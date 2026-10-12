"""Tree tops from the 1 m canopy height (first step of the 3 trees rule).

Each local peak of the lightly smoothed canopy height that is at least 3 m tall is one tree: the
height is smoothed with a Gaussian (sigma 1 m), and a pixel is a peak if it is the highest within
a disc of 3 m radius (so peaks are at least about 3 m apart). Ties on flat tops are broken by a
tiny fixed perturbation that depends only on the pixel's position, so the result does not depend
on how the raster is cut into bands.
"""

from __future__ import annotations

import math

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy import ndimage


def tie_breaker(rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """Deterministic value in [0, 1e-3) per pixel, from its absolute position."""
    h = (rows.astype(np.int64) * 73856093) ^ (cols.astype(np.int64) * 19349663)
    return (np.abs(h) % 9973).astype(np.float32) * np.float32(1e-7)


def find_peaks(
    height: np.ndarray,
    row0: int,
    min_height: float,
    sigma_px: float,
    radius_px: int,
    nodata: int | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """(rows, cols) of the tree tops of a band of canopy height (rows relative to the band)."""
    a = height.astype(np.float32)
    if nodata is not None:
        a[height == nodata] = 0
    sm = ndimage.gaussian_filter(a, sigma_px, mode="nearest")
    rr, cc = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
    sm += tie_breaker(rr + row0, cc)
    yy, xx = np.mgrid[-radius_px : radius_px + 1, -radius_px : radius_px + 1]
    disc = xx**2 + yy**2 <= radius_px**2
    mx = ndimage.maximum_filter(sm, footprint=disc, mode="nearest")
    peak = (sm == mx) & (sm >= min_height)
    return np.nonzero(peak)


def detect_trees(
    chm_path: str,
    min_height: float,
    sigma_m: float,
    radius_m: float,
    nodata: int,
    band_rows: int = 1000,
):
    """Tree tops of the whole raster: x, y (pixel centres) and height (m, the canopy height at
    the top's pixel)."""
    xs, ys, hs = [], [], []
    with rasterio.open(chm_path) as src:
        res = src.transform.a
        sigma_px = sigma_m / res
        radius_px = int(round(radius_m / res))
        pad = radius_px + int(math.ceil(4 * sigma_px)) + 2
        tr = src.transform
        for r in range(0, src.height, band_rows):
            ra, rb = max(0, r - pad), min(src.height, r + band_rows + pad)
            a = src.read(1, window=Window(0, ra, src.width, rb - ra))
            rows, cols = find_peaks(a, ra, min_height, sigma_px, radius_px, nodata)
            absr = rows + ra
            keep = (absr >= r) & (absr < r + band_rows)
            rows, cols, absr = rows[keep], cols[keep], absr[keep]
            h = a[rows, cols]
            ok = h != nodata
            xs.append(tr.c + (cols[ok] + 0.5) * res)
            ys.append(tr.f - (absr[ok] + 0.5) * res)
            hs.append(h[ok])
    return np.concatenate(xs), np.concatenate(ys), np.concatenate(hs).astype(np.uint8)
