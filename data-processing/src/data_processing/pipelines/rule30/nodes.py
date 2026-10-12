"""Layer 2: 30 % canopy (every neighbourhood has at least 30 % tree canopy).

Per 10 m square, the number of its 1 m pixels where vegetation is at least 3 m tall. The share of a
square's neighbourhood is the canopy pixels over the land pixels of the squares whose centres lie
within 500 m of its centre; water pixels (sea, lakes, rivers) and pixels without canopy-height
data are left out of both counts. A square passes if the share is at least 30 %. Sums are whole
numbers of pixels, so the threshold is tested exactly (``100 * canopy >= 30 * land``).
"""

from __future__ import annotations

import logging
import math
import time
from fractions import Fraction

import geopandas as gpd
import numpy as np
import rasterio
from numba import njit, prange
from rasterio.windows import Window
from scipy.signal import fftconvolve

from data_processing.core.grid import Grid, disc_offsets
from data_processing.pipelines.grid.nodes import raster, water_band

log = logging.getLogger(__name__)


def canopy_cover(
    canopy_height_source: dict,
    grid: dict,
    water: gpd.GeoDataFrame,
    method: dict,
    sources: dict,
    band_squares: int = 100,
) -> tuple[dict, dict]:
    """Canopy pixels and land pixels (both 0–100) per 10 m square."""
    g = Grid.from_dict(grid)
    fine = g.fine(method["chm_res_m"])
    k = round(g.res / fine.res)
    nodata = sources["canopy_height"]["nodata"]
    hmin = method["rule30"]["canopy_min_height_m"]
    geoms = [x for x in water.geometry if not x.is_empty]
    canopy = np.zeros(g.shape, np.uint8)
    land = np.zeros(g.shape, np.uint8)
    with rasterio.open(canopy_height_source["file"]) as src:
        assert src.width == fine.width and src.height == fine.height
        for r0 in range(0, g.height, band_squares):
            r1 = min(g.height, r0 + band_squares)
            h = src.read(1, window=Window(0, r0 * k, fine.width, (r1 - r0) * k))
            wet = water_band(geoms, fine, r0 * k, (r1 - r0) * k)
            ok = (h != nodata) & ~wet
            tall = ok & (h >= hmin)
            shape = (r1 - r0, k, g.width, k)
            canopy[r0:r1] = tall.reshape(shape).sum(axis=(1, 3))
            land[r0:r1] = ok.reshape(shape).sum(axis=(1, 3))
    return raster(g, canopy), raster(g, land)


def disc_sums(values: np.ndarray, radius: float, res: float) -> np.ndarray:
    """Exact integer sum of ``values`` over the disc around each square (FFT, then rounded)."""
    kernel = disc_offsets(radius, res).astype(np.float64)
    out = fftconvolve(values.astype(np.float64), kernel, mode="same")
    return np.rint(out).astype(np.int64)


def passes_threshold(canopy_sum, land_sum, threshold: float) -> np.ndarray:
    """canopy / land >= threshold, tested on integers (no rounding error at the boundary)."""
    f = Fraction(str(threshold))
    canopy_sum = np.asarray(canopy_sum, np.int64)
    land_sum = np.asarray(land_sum, np.int64)
    return (land_sum > 0) & (canopy_sum * f.denominator >= land_sum * f.numerator)


def rule30_squares(
    canopy_px: dict, land_px: dict, city_mask: dict, grid: dict, method: dict
) -> tuple[dict, dict, dict]:
    t0 = time.time()
    g = Grid.from_dict(grid)
    p = method["rule30"]
    c = disc_sums(canopy_px["array"], p["radius_m"], g.res)
    n = disc_sums(land_px["array"], p["radius_m"], g.res)
    city = city_mask["array"].astype(bool)
    share = np.full(g.shape, np.nan, np.float32)
    with np.errstate(divide="ignore", invalid="ignore"):
        share[city] = (c[city] / n[city]).astype(np.float32)
    passes = np.zeros(g.shape, np.uint8)
    passes[city] = passes_threshold(c[city], n[city], p["threshold"])
    stats = {
        "squares": int(city.sum()),
        "squares_passing": int(passes.sum()),
        "canopy_share_of_city_land": round(
            float(
                canopy_px["array"][city].sum(dtype=np.int64)
                / max(1, land_px["array"][city].sum(dtype=np.int64))
            ),
            4,
        ),
        "seconds": round(time.time() - t0),
    }
    log.info("rule 30: %d of %d squares pass", stats["squares_passing"], stats["squares"])
    return raster(g, share, nodata=float("nan")), raster(g, passes), stats


@njit(cache=True, parallel=True)
def _point_disc_sums(px, py, canopy, land, x0, y1, res, radius):
    n = len(px)
    cs = np.zeros(n, np.int64)
    ls = np.zeros(n, np.int64)
    h, w = canopy.shape
    k = int(math.ceil(radius / res)) + 1
    r2 = radius * radius
    for b in prange(n):
        ci = int(math.floor((y1 - py[b]) / res))
        cj = int(math.floor((px[b] - x0) / res))
        c = 0
        s = 0
        for i in range(max(ci - k, 0), min(ci + k, h - 1) + 1):
            yc = y1 - (i + 0.5) * res
            dy = yc - py[b]
            for j in range(max(cj - k, 0), min(cj + k, w - 1) + 1):
                dx = x0 + (j + 0.5) * res - px[b]
                if dx * dx + dy * dy <= r2:
                    c += canopy[i, j]
                    s += land[i, j]
        cs[b] = c
        ls[b] = s
    return cs, ls


def point_canopy(x, y, canopy_px: dict, land_px: dict, grid: dict, radius: float):
    """Canopy and land pixel sums over the squares whose centres lie within ``radius`` of each
    point (the building's centre, for the rule per building)."""
    g = Grid.from_dict(grid)
    return _point_disc_sums(
        np.asarray(x, np.float64),
        np.asarray(y, np.float64),
        canopy_px["array"].astype(np.int64),
        land_px["array"].astype(np.int64),
        g.x0,
        g.y1,
        g.res,
        float(radius),
    )
