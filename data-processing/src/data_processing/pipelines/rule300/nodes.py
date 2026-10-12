"""Layer 3: 300 m to a park (every resident lives within a 300 m walk of a green space).

1. Green spaces: OSM parks, gardens, nature reserves, forests and woods, not marked private or
   closed to the public; pieces that touch are joined; pieces under 1 ha are dropped.
2. The walking network: OSM ways people can walk on (core/network.py).
3. Walking distance from every stretch of path within 20 m of a green space. The "20 m" reach is
   taken on the green space's side of any water: the stretch must lie in a part of the 20 m fringe
   that is connected by land to the green space. Each square adds its straight-line distance to
   the nearest path point (up to 100 m) whose straight line does not cross water; squares inside a
   green space have distance 0.
4. A square passes if the walk is 300 m or less.
"""

from __future__ import annotations

import logging
import math
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from scipy.spatial import cKDTree

from data_processing.core.geo import polygon_parts, polygonal
from data_processing.core.grid import Grid
from data_processing.core.network import (
    Distances,
    Network,
    build_network,
    first_dry,
    network_points,
    read_ways,
    source_intervals,
    walk_distances,
)
from data_processing.pipelines.boundaries.nodes import osm_polygons
from data_processing.pipelines.grid.nodes import centre_mask, raster

log = logging.getLogger(__name__)

WATER_MARGIN_M = 2.0  # ends of a straight leg not tested for water (quays, shore paths)


# ------------------------------------------------------------------ green spaces
GREEN_KINDS = ("park", "garden", "nature_reserve", "forest", "wood")


def green_kind(tags: dict, green_tags: dict) -> str | None:
    for key, values in green_tags.items():
        if tags.get(key) in values:
            return tags[key]
    return None


def build_parks(
    osm_features: dict, boundaries: gpd.GeoDataFrame, method: dict
) -> tuple[gpd.GeoDataFrame, dict]:
    p = method["rule300"]
    src = osm_polygons(osm_features["green"], method["crs"])
    src["kind"] = [green_kind(t, p["green_tags"]) for t in src["tags"]]
    src["access"] = [t.get("access") for t in src["tags"]]
    src["name"] = [t.get("name") for t in src["tags"]]
    n_all = len(src)
    src = src[src["kind"].notna() & ~src["access"].isin(p["excluded_access"])]
    src = src.reset_index(drop=True)
    merged = polygon_parts(shapely.union_all(src.geometry.values))
    parks = gpd.GeoDataFrame(geometry=merged, crs=method["crs"])
    parks["area_m2"] = parks.area
    parks = parks[parks["area_m2"] >= p["min_area_m2"]].reset_index(drop=True)

    # kind = the kind covering most of the piece; name = the largest named source that covers at
    # least a quarter of the piece or 0.3 ha of it
    tree = shapely.STRtree(src.geometry.values)
    pi, si = tree.query(parks.geometry.values, predicate="intersects")
    a = shapely.area(shapely.intersection(parks.geometry.values[pi], src.geometry.values[si]))
    df = pd.DataFrame(
        {
            "park": pi,
            "src": si,
            "a": a,
            "kind": src["kind"].values[si],
            "name": src["name"].values[si],
        }
    )
    kind = (
        df.groupby(["park", "kind"])
        .a.sum()
        .reset_index()
        .sort_values("a")
        .drop_duplicates("park", keep="last")
        .set_index("park")["kind"]
    )
    named = df[df["name"].notna()].sort_values("a").drop_duplicates("park", keep="last")
    named = named[(named.a >= 3000) | (named.a >= 0.25 * parks["area_m2"].values[named.park])]
    parks["kind"] = kind.reindex(parks.index).values
    parks["name"] = named.set_index("park")["name"].reindex(parks.index).values
    # green spaces are kept whole for their size (1 ha), then cut to the analysis area plus a
    # margin: nothing beyond it can be reached from the city's squares
    reach = boundaries.set_index("name").geometry["analysis"].buffer(200)
    parks = parks[parks.intersects(reach)].copy()
    parks["geometry"] = [polygonal(g.intersection(reach)) for g in parks.geometry]
    parks = parks[~parks.geometry.is_empty].reset_index(drop=True)
    parks.insert(0, "pid", np.arange(len(parks), dtype=np.int32))
    stats = {
        "osm_polygons": n_all,
        "osm_polygons_public": len(src),
        "green_spaces_ge_1ha": len(parks),
        "named": int(parks["name"].notna().sum()),
        "area_in_reach_km2": round(parks.area.sum() / 1e6, 3),
        "by_kind": parks["kind"].value_counts().to_dict(),
    }
    log.info("green spaces: %d of 1 ha or more (%d named)", len(parks), stats["named"])
    return parks, stats


def access_fringe(parks: gpd.GeoDataFrame, water: gpd.GeoDataFrame, reach: float):
    """Parts of the ``reach`` m fringe around each green space that are connected by land to it
    (not across water), with the green space they belong to."""
    wet_parts = np.array([q for g in water.geometry.values for q in polygon_parts(g)], dtype=object)
    wet_tree = shapely.STRtree(wet_parts) if len(wet_parts) else None
    pieces, owner = [], []
    geoms = parks.geometry.values
    buf = shapely.buffer(geoms, reach)
    for k in range(len(geoms)):
        wet = shapely.Polygon()
        if wet_tree is not None:
            cand = wet_tree.query(buf[k])
            if len(cand):
                box = buf[k].bounds
                wet = shapely.union_all([shapely.clip_by_rect(wet_parts[c], *box) for c in cand])
        dry = shapely.difference(geoms[k], wet)
        for part in polygon_parts(shapely.difference(buf[k], wet)):
            if not dry.is_empty and part.intersects(dry):
                pieces.append(part)
                owner.append(k)
    pieces, owner = subdivide(pieces, owner)
    return np.array(pieces, dtype=object), parks["pid"].values[np.asarray(owner, np.int64)]


def subdivide(geoms, owner, size: float = 250.0):
    """Cut large polygons into ``size`` m squares, so that intersecting them with many short
    segments stays cheap (the result covers exactly the same ground)."""
    out, own = [], []
    for g, o in zip(geoms, owner, strict=True):
        x0, y0, x1, y1 = g.bounds
        if x1 - x0 <= size and y1 - y0 <= size:
            out.append(g)
            own.append(o)
            continue
        for x in np.arange(math.floor(x0 / size) * size, x1, size):
            for y in np.arange(math.floor(y0 / size) * size, y1, size):
                for part in polygon_parts(shapely.clip_by_rect(g, x, y, x + size, y + size)):
                    out.append(part)
                    own.append(o)
    return out, own


def build_walk_network(osm_features: dict, method: dict) -> tuple[dict, dict]:
    ways = read_ways(osm_features["highways"])
    net = build_network(ways, method["rule300"], method["crs"])
    stats = {
        "ways": len(ways),
        "nodes": int(net.n),
        "segments": int(len(net.u)),
        "length_km": round(float(net.length.sum()) / 1000, 1),
    }
    log.info(
        "walking network: %d nodes, %d segments, %.0f km", net.n, len(net.u), stats["length_km"]
    )
    return net.to_npz(), stats


def walk_to_parks(
    walk_network: dict, parks: gpd.GeoDataFrame, water: gpd.GeoDataFrame, method: dict
) -> tuple[dict, pd.DataFrame, dict]:
    t0 = time.time()
    p = method["rule300"]
    net = Network.from_npz(walk_network)
    fringe, owner = access_fringe(parks, water, p["entrance_m"])
    iv = source_intervals(net, fringe, owner)
    dist = walk_distances(net, iv)
    out = {**walk_network, "dist": dist.node, "pred": dist.pred, "node_src": dist.node_src}
    stats = {
        "fringe_parts": int(len(fringe)),
        "source_stretches": int(len(iv)),
        "nodes_reaching_a_park": int(np.isfinite(dist.node).sum()),
        "seconds": round(time.time() - t0),
    }
    return out, iv, stats


def points_for(walk: dict, iv: pd.DataFrame, method: dict):
    net = Network.from_npz(walk)
    dist = Distances(walk["dist"], walk["pred"], walk["node_src"])
    return net, network_points(net, dist, iv, method["rule300"]["sample_step_m"])


def nearest_dry(qx, qy, pts, water_2m: dict, max_snap: float, k: int = 12):
    """Index of the nearest network point within ``max_snap`` whose straight line from the
    query point does not cross water (-1 if none)."""
    tree = cKDTree(np.column_stack([pts.x, pts.y]))
    d, idx = tree.query(np.column_stack([qx, qy]), k=k, distance_upper_bound=max_snap, workers=-1)
    idx = np.where(np.isfinite(d), idx, -1).astype(np.int64)
    t = water_2m["transform"]
    return first_dry(
        np.asarray(qx, np.float64),
        np.asarray(qy, np.float64),
        idx,
        d,
        pts.x,
        pts.y,
        water_2m["array"],
        t.c,
        t.f,
        t.a,
        WATER_MARGIN_M,
    )


def rule300_squares(
    grid: dict,
    city_mask: dict,
    walk: dict,
    intervals: pd.DataFrame,
    parks: gpd.GeoDataFrame,
    water_2m: dict,
    method: dict,
):
    t0 = time.time()
    g = Grid.from_dict(grid)
    p = method["rule300"]
    net, pts = points_for(walk, intervals, method)
    rows, cols = np.nonzero(city_mask["array"].astype(bool))
    qx, qy = g.centre_of(rows, cols)
    best = nearest_dry(qx, qy, pts, water_2m, p["max_snap_m"])
    d = np.full(len(rows), np.inf)
    hit = best >= 0
    d[hit] = np.hypot(qx[hit] - pts.x[best[hit]], qy[hit] - pts.y[best[hit]]) + pts.dist[best[hit]]
    in_park = centre_mask(parks.geometry.values, g)[rows, cols]
    d[in_park] = 0.0
    dist = np.full(g.shape, np.nan, np.float32)
    dist[rows, cols] = np.where(np.isfinite(d), d, np.inf).astype(np.float32)
    passes = np.zeros(g.shape, np.uint8)
    passes[rows, cols] = d <= p["threshold_m"]
    stats = {
        "squares": int(len(rows)),
        "squares_passing": int(passes.sum()),
        "squares_in_a_green_space": int(in_park.sum()),
        "squares_without_a_path_within_100m": int((~hit & ~in_park).sum()),
        "squares_on_a_path_not_reaching_a_park": int((hit & ~np.isfinite(d) & ~in_park).sum()),
        "network_points": int(len(pts.x)),
        "seconds": round(time.time() - t0),
    }
    log.info("rule 300: %d of %d squares pass", stats["squares_passing"], len(rows))
    return raster(g, dist, nodata=float("nan")), raster(g, passes), stats
