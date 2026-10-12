"""Common steps 3 and 5: the shared 10 m grid, and which squares belong to the city.

A square belongs to the city if its centre is inside the city (boundary minus the sea), which is
exactly what rasterising with ``all_touched=False`` does. The same test marks water squares
(centre in water). Each square also gets the number of its 1 m pixels that are land (not water),
used by the 30 % rule to leave water out of the neighbourhood.
"""

from __future__ import annotations

import logging

import geopandas as gpd
import numpy as np
from rasterio.features import rasterize

from data_processing.core.grid import Grid

log = logging.getLogger(__name__)


def raster(grid: Grid, array: np.ndarray, nodata=None) -> dict:
    return {"array": array, "transform": grid.transform, "crs": grid.crs, "nodata": nodata}


def centre_mask(geoms, grid: Grid) -> np.ndarray:
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return np.zeros(grid.shape, bool)
    return rasterize(
        [(g, 1) for g in geoms],
        out_shape=grid.shape,
        transform=grid.transform,
        fill=0,
        dtype="uint8",
        all_touched=False,
    ).astype(bool)


def make_grid(boundaries: gpd.GeoDataFrame, method: dict) -> dict:
    b = boundaries.set_index("name").geometry
    grid = Grid.around(
        b["analysis"].bounds, method["grid_res_m"], method["grid_snap_m"], method["crs"]
    )
    log.info("grid %d x %d squares of %s m", grid.width, grid.height, grid.res)
    return grid.to_dict()


def city_squares(grid_spec: dict, boundaries: gpd.GeoDataFrame) -> tuple[dict, dict]:
    grid = Grid.from_dict(grid_spec)
    b = boundaries.set_index("name").geometry
    city = centre_mask([b["city"]], grid)
    analysis = centre_mask([b["analysis"]], grid)
    stats = {
        "grid": grid_spec,
        "city_squares": int(city.sum()),
        "city_squares_km2": round(city.sum() * grid.res**2 / 1e6, 3),
        "city_km2": round(b["city"].area / 1e6, 3),
        "analysis_squares": int(analysis.sum()),
    }
    out = np.where(city, 1, 0).astype(np.uint8)
    return raster(grid, out), stats


def water_squares(
    grid_spec: dict, water: gpd.GeoDataFrame, method: dict, band_rows: int = 200
) -> tuple[dict, dict]:
    """Water squares (centre test) and water at 2 m (a 2 m pixel is water if any of its 1 m
    pixels' centres is in water)."""
    grid = Grid.from_dict(grid_spec)
    geoms = [g for g in water.geometry if not g.is_empty]
    centre = centre_mask(geoms, grid)
    fine = grid.fine(method["chm_res_m"])
    coarse = grid.fine(2.0)
    k = round(grid.res / fine.res)
    k2 = round(coarse.res / fine.res)
    water2 = np.zeros(coarse.shape, np.uint8)
    for r0 in range(0, grid.height, band_rows):
        r1 = min(grid.height, r0 + band_rows)
        w = water_band(geoms, fine, r0 * k, (r1 - r0) * k)
        hh = w.shape[0] // k2
        water2[r0 * k // k2 : r0 * k // k2 + hh] = (
            w.reshape(hh, k2, fine.width // k2, k2).any(axis=(1, 3)).astype(np.uint8)
        )
    log.info("water: %d squares by centre", int(centre.sum()))
    return raster(grid, centre.astype(np.uint8)), raster(coarse, water2)


def water_band(geoms, fine: Grid, row0: int, nrows: int) -> np.ndarray:
    """Water (pixel centre in water) for rows ``row0``–``row0 + nrows`` of a fine grid."""
    band = Grid(fine.x0, fine.y1 - row0 * fine.res, fine.width, nrows, fine.res, fine.crs)
    return centre_mask(geoms, band)
