"""Meta & WRI High Resolution Canopy Height Map v1 (1 m, CC BY 4.0), read straight from its
cloud-optimised GeoTIFFs and resampled onto the 1 m grid of the capital (EPSG:3035, same origin as
the 10 m grid).

The source tiles are zoom-9 quadkey tiles of 65,536 px in Web Mercator (about 0.6 m on the ground
at Stockholm's latitude). Each 1 m pixel takes the mean height of the source pixels it covers
(GDAL ``average``), so it is "the height of vegetation for that 1 m square".
"""

from __future__ import annotations

import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import Window

from data_processing.core.grid import Grid

log = logging.getLogger(__name__)

MERC_ORIGIN = 20037508.342789244
TILE_PX = 65536
MERC_RES = 2 * MERC_ORIGIN / 2 ** (9 + 16)  # zoom-9 tiles of 65,536 px

GDAL_ENV = {
    "AWS_NO_SIGN_REQUEST": "YES",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "CPL_VSIL_CURL_CHUNK_SIZE": "10485760",
    "GDAL_HTTP_USERAGENT": "3-30-300-data-processing/0.1",
    "GDAL_HTTP_MAX_RETRY": "8",
    "GDAL_HTTP_RETRY_DELAY": "5",
}


def quadkey_offset(qk: str) -> tuple[int, int]:
    """Global (row, column) of a quadkey tile's top-left pixel (65,536 px tiles)."""
    x = y = 0
    for ch in qk:
        d = int(ch)
        x, y = (x << 1) | (d & 1), (y << 1) | (d >> 1)
    return y * TILE_PX, x * TILE_PX


def _band(
    base_url: str,
    tiles: list[str],
    nodata: int,
    left: float,
    top: float,
    width: int,
    height: int,
    res: float,
    crs: str,
) -> np.ndarray:
    b = transform_bounds(
        crs, "EPSG:3857", left, top - height * res, left + width * res, top, densify_pts=100
    )
    pad = 4
    c0 = math.floor((b[0] + MERC_ORIGIN) / MERC_RES) - pad
    c1 = math.ceil((b[2] + MERC_ORIGIN) / MERC_RES) + pad
    r0 = math.floor((MERC_ORIGIN - b[3]) / MERC_RES) - pad
    r1 = math.ceil((MERC_ORIGIN - b[1]) / MERC_RES) + pad
    mosaic = np.full((r1 - r0, c1 - c0), nodata, np.uint8)
    for t in tiles:
        qr, qc = quadkey_offset(t)
        if qr >= r1 or qr + TILE_PX <= r0 or qc >= c1 or qc + TILE_PX <= c0:
            continue
        with rasterio.open(f"/vsicurl/{base_url}/chm/{t}.tif") as src:
            tc = round((src.transform.c + MERC_ORIGIN) / MERC_RES)
            tr = round((MERC_ORIGIN - src.transform.f) / MERC_RES)
            if (tr, tc) != (qr, qc):
                raise ValueError(f"tile {t} is not where its quadkey says")
            rr0, rr1 = max(r0, tr), min(r1, tr + src.height)
            cc0, cc1 = max(c0, tc), min(c1, tc + src.width)
            if rr0 >= rr1 or cc0 >= cc1:
                continue
            a = src.read(1, window=Window(cc0 - tc, rr0 - tr, cc1 - cc0, rr1 - rr0))
            mosaic[rr0 - r0 : rr1 - r0, cc0 - c0 : cc1 - c0] = a
    src_transform = from_origin(
        c0 * MERC_RES - MERC_ORIGIN, MERC_ORIGIN - r0 * MERC_RES, MERC_RES, MERC_RES
    )
    out = np.full((height, width), nodata, np.uint8)
    reproject(
        mosaic,
        out,
        src_transform=src_transform,
        src_crs="EPSG:3857",
        src_nodata=nodata,
        dst_transform=from_origin(left, top, res, res),
        dst_crs=crs,
        dst_nodata=nodata,
        resampling=Resampling.average,
    )
    return out


def build_chm(
    base_url: str,
    tiles: list[str],
    fine: Grid,
    target: Path,
    nodata: int = 255,
    band_rows: int = 1000,
    workers: int = 6,
) -> float:
    """Write the 1 m canopy height raster of ``fine`` (uint8 metres, ``nodata`` = no data)."""
    for k, v in GDAL_ENV.items():
        os.environ.setdefault(k, v)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp.tif")
    profile = {
        "driver": "GTiff",
        "dtype": "uint8",
        "count": 1,
        "width": fine.width,
        "height": fine.height,
        "crs": fine.crs,
        "transform": fine.transform,
        "nodata": nodata,
        "compress": "deflate",
        "predictor": 2,
        "tiled": True,
        "blockxsize": 512,
        "blockysize": 512,
        "BIGTIFF": "IF_SAFER",
    }
    bands = [(r, min(band_rows, fine.height - r)) for r in range(0, fine.height, band_rows)]

    def job(rb):
        r, h = rb
        top = fine.y1 - r * fine.res
        return r, h, _band(base_url, tiles, nodata, fine.x0, top, fine.width, h, fine.res, fine.crs)

    t0 = time.time()
    with rasterio.open(tmp, "w", **profile) as dst, ThreadPoolExecutor(workers) as ex:
        for r, h, arr in ex.map(job, bands):
            dst.write(arr, 1, window=Window(0, r, fine.width, h))
            log.info(
                "canopy height rows %d–%d of %d (%.0f s)", r, r + h, fine.height, time.time() - t0
            )
    tmp.replace(target)
    return time.time() - t0
