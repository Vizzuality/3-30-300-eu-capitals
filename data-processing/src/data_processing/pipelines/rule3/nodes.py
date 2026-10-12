"""Layer 1: 3 trees visible (every resident sees at least 3 trees from home).

From the centre of each 10 m square of the city, every tree within 30 m is checked with a straight
line that must not cross a building footprint; a square inside a building ignores that building.
A square passes if it sees at least 3 trees.
"""

from __future__ import annotations

import logging
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from data_processing.core.grid import Grid
from data_processing.core.trees import detect_trees
from data_processing.core.visibility import Scene, visible_counts
from data_processing.pipelines.grid.nodes import raster

log = logging.getLogger(__name__)


def find_trees(
    canopy_height_source: dict, grid: dict, city_mask: dict, method: dict, sources: dict
) -> tuple[pd.DataFrame, dict]:
    t0 = time.time()
    p = method["trees"]
    x, y, h = detect_trees(
        canopy_height_source["file"],
        p["min_height_m"],
        p["smoothing_sigma_m"],
        p["peak_radius_m"],
        sources["canopy_height"]["nodata"],
    )
    g = Grid.from_dict(grid)
    i, j = g.index_of(x, y)
    inside = g.contains_index(i, j)
    in_city = np.zeros(len(x), bool)
    in_city[inside] = city_mask["array"][i[inside], j[inside]].astype(bool)
    trees = pd.DataFrame(
        {"tree": np.arange(len(x), dtype=np.int64), "x": x, "y": y, "height": h, "in_city": in_city}
    )
    city_km2 = city_mask["array"].sum() * g.res**2 / 1e6
    stats = {
        "trees_in_grid": len(trees),
        "trees_in_city": int(in_city.sum()),
        "trees_per_ha_in_city": round(in_city.sum() / city_km2 / 100, 2),
        "median_height_m": float(np.median(h)) if len(h) else None,
        "seconds": round(time.time() - t0),
    }
    log.info("trees: %d in the grid, %d in the city", len(trees), stats["trees_in_city"])
    return trees, stats


def own_buildings(geoms, x, y) -> tuple[np.ndarray, np.ndarray]:
    """Index of (up to two) buildings containing each point, -2 when none."""
    tree = shapely.STRtree(geoms)
    pi, bi = tree.query(shapely.points(x, y), predicate="within")
    own1 = np.full(len(x), -2, np.int32)
    own2 = np.full(len(x), -2, np.int32)
    order = np.lexsort((bi, pi))
    pi, bi = pi[order], bi[order]
    first = np.r_[True, pi[1:] != pi[:-1]]
    own1[pi[first]] = bi[first]
    second = ~first
    own2[pi[second]] = bi[second]  # a third overlapping building, if any, still blocks
    return own1, own2


def rule3_squares(
    grid: dict, city_mask: dict, trees: pd.DataFrame, buildings: gpd.GeoDataFrame, method: dict
) -> tuple[dict, dict]:
    t0 = time.time()
    g = Grid.from_dict(grid)
    p = method["rule3"]
    scene = Scene(
        trees["x"].values,
        trees["y"].values,
        buildings.geometry.values,
        g.x0,
        g.y1,
        g.height,
        g.width,
        g.res,
        p["edge_bucket_m"],
    )
    rows, cols = np.nonzero(city_mask["array"].astype(bool))
    vx, vy = g.centre_of(rows, cols)
    own1, own2 = own_buildings(buildings.geometry.values, vx, vy)
    seen = visible_counts(scene, vx, vy, own1, own2, p["view_radius_m"], cap=p["min_trees"])
    passes = np.zeros(g.shape, np.uint8)
    passes[rows, cols] = seen >= p["min_trees"]
    count = np.full(g.shape, 255, np.uint8)
    count[rows, cols] = seen
    stats = {
        "squares": int(len(rows)),
        "squares_passing": int(passes.sum()),
        "squares_inside_a_building": int((own1 >= 0).sum()),
        "squares_inside_two_buildings": int((own2 >= 0).sum()),
        "building_edges": int(len(scene.edges)),
        "seconds": round(time.time() - t0),
    }
    log.info(
        "rule 3: %d of %d squares pass (%.0f s)",
        stats["squares_passing"],
        len(rows),
        time.time() - t0,
    )
    return raster(g, passes, nodata=None), stats
