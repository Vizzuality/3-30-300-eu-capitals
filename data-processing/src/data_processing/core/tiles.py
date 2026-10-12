"""Web Mercator tiles: grid rendering (grid.pmtiles), evidence coordinates and PMTiles writing."""

from __future__ import annotations

import gzip
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from data_processing.core.geo import transformer

R = 6378137.0
ORIGIN = math.pi * R


def tile_size_m(z: int) -> float:
    return 2 * ORIGIN / 2**z


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = tile_size_m(z)
    minx = -ORIGIN + x * size
    maxy = ORIGIN - y * size
    return minx, maxy - size, minx + size, maxy


def tile_range(lonlat_bbox, z: int):
    """(x0, y0, x1, y1) inclusive tile range covering a (west, south, east, north) box."""
    w, s, e, n = lonlat_bbox
    to_merc = transformer("EPSG:4326", "EPSG:3857")
    (mx0, mx1), (my0, my1) = to_merc.transform([w, e], [s, n])
    size = tile_size_m(z)
    x0 = int(math.floor((mx0 + ORIGIN) / size))
    x1 = int(math.floor((mx1 + ORIGIN) / size))
    y0 = int(math.floor((ORIGIN - my1) / size))
    y1 = int(math.floor((ORIGIN - my0) / size))
    return x0, y0, x1, y1


def render_grid_tile(
    values: np.ndarray, transform, crs: str, z: int, x: int, y: int, px: int, no_colour: int
) -> np.ndarray:
    """Pixels of tile z/x/y: the value of the grid square under each pixel centre (nearest)."""
    minx, miny, maxx, maxy = tile_bounds(z, x, y)
    step = (maxx - minx) / px
    xs = minx + (np.arange(px) + 0.5) * step
    ys = maxy - (np.arange(px) + 0.5) * step
    mx, my = np.meshgrid(xs, ys)
    ex, ey = transformer("EPSG:3857", crs).transform(mx, my)
    col = np.floor((np.asarray(ex) - transform.c) / transform.a).astype(np.int64)
    row = np.floor((np.asarray(ey) - transform.f) / transform.e).astype(np.int64)
    h, w = values.shape
    inside = (col >= 0) & (col < w) & (row >= 0) & (row < h)
    out = np.full((px, px), no_colour, np.uint8)
    out[inside] = values[row[inside], col[inside]]
    return out


def png_bytes(pixels: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(pixels, mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_pmtiles(
    path: Path,
    tiles: list[tuple[int, int, int, bytes]],
    tile_type,
    compression,
    lonlat_bbox,
    center_zoom: int,
    metadata: dict,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = sorted((zxy_to_tileid(z, x, y), data) for z, x, y, data in tiles)
    w, s, e, n = lonlat_bbox
    tmp = path.with_suffix(".tmp")
    with tmp.open("wb") as fh:
        writer = Writer(fh)
        for tid, data in entries:
            writer.write_tile(tid, data)
        writer.finalize(
            {
                "tile_type": tile_type,
                "tile_compression": compression,
                "min_lon_e7": int(w * 1e7),
                "min_lat_e7": int(s * 1e7),
                "max_lon_e7": int(e * 1e7),
                "max_lat_e7": int(n * 1e7),
                "center_zoom": center_zoom,
                "center_lon_e7": int((w + e) / 2 * 1e7),
                "center_lat_e7": int((s + n) / 2 * 1e7),
            },
            metadata,
        )
    tmp.replace(path)


class TileFrame:
    """Evidence coordinates: whole decimetres from the tile's north-west corner, x east, y south,
    in ground metres (Web Mercator metres x cos(latitude of the tile's centre))."""

    def __init__(self, z: int, x: int, y: int):
        self.z, self.x, self.y = z, x, y
        size = tile_size_m(z)
        self.minx = -ORIGIN + x * size
        self.maxy = ORIGIN - y * size
        lat_c = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2**z))))
        self.k = math.cos(math.radians(lat_c))

    def from_merc(self, mx, my) -> np.ndarray:
        mx, my = np.asarray(mx, dtype=np.float64), np.asarray(my, dtype=np.float64)
        return np.column_stack(
            [np.round((mx - self.minx) * self.k * 10), np.round((self.maxy - my) * self.k * 10)]
        ).astype(np.int64)

    def line(self, mx, my) -> list:
        pts = self.from_merc(mx, my)
        keep = np.r_[True, np.any(pts[1:] != pts[:-1], axis=1)] if len(pts) else []
        return pts[keep].tolist()


def gzip_bytes(data: bytes) -> bytes:
    return gzip.compress(data, mtime=0)


__all__ = ["Compression", "TileType"]
