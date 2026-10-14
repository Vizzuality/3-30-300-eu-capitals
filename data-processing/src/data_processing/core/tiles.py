"""Web Mercator tiles: grid rendering (grid.pmtiles), evidence coordinates and PMTiles writing."""

from __future__ import annotations

import gzip
import io
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import (
    Compression,
    TileType,
    deserialize_header,
    serialize_header,
    zxy_to_tileid,
)
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


# ------------------------------------------------------------------ archive metadata
HEADER_BYTES = 127
# Tippecanoe records its command line, with the absolute paths of this machine, in its metadata
LOCAL_METADATA = ("generator_options",)
# an absolute path: "/" or "~/" or "C:\" after a quote, a space or "=", then a path segment
ABSOLUTE_PATH = re.compile(r"""(?:^|[\s'"=])(?:/|~/|[A-Za-z]:[\\/])[\w.+~-]+""")


def absolute_paths(value) -> list[str]:
    """Every string in ``value`` (nested dicts and lists) that holds an absolute path."""
    if isinstance(value, dict):
        return [p for v in value.values() for p in absolute_paths(v)]
    if isinstance(value, list):
        return [p for v in value for p in absolute_paths(v)]
    return [value] if isinstance(value, str) and ABSOLUTE_PATH.search(value) else []


def _read_metadata(f, header) -> dict:
    f.seek(header["metadata_offset"])
    raw = f.read(header["metadata_length"])
    compression = header["internal_compression"]
    if compression == Compression.GZIP:
        raw = gzip.decompress(raw)
    elif compression != Compression.NONE:
        raise ValueError(f"metadata compression {compression} is not supported")
    return json.loads(raw)


def drop_metadata(path: Path, keys=LOCAL_METADATA) -> list[str]:
    """Remove ``keys`` from a PMTiles v3 archive's metadata, in place; returns those removed.
    The header and root directory are rewritten and the leaf directories and tile data copied as
    they are: their offsets are relative to their own sections (PMTiles v3, §4.1)."""
    path = Path(path)
    with path.open("rb") as f:
        header = deserialize_header(f.read(HEADER_BYTES))
        meta = _read_metadata(f, header)
        removed = [k for k in keys if k in meta]
        if not removed:
            return []
        data = json.dumps(
            {k: v for k, v in meta.items() if k not in removed},
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode()
        if header["internal_compression"] == Compression.GZIP:
            data = gzip_bytes(data)
        f.seek(header["root_offset"])
        root = f.read(header["root_length"])
        new = dict(header)
        new["root_offset"] = HEADER_BYTES
        new["metadata_offset"] = HEADER_BYTES + len(root)
        new["metadata_length"] = len(data)
        new["leaf_directory_offset"] = new["metadata_offset"] + len(data)
        new["tile_data_offset"] = new["leaf_directory_offset"] + header["leaf_directory_length"]
        tmp = path.with_suffix(".tmp")
        with tmp.open("wb") as out:
            out.write(serialize_header(new))
            out.write(root)
            out.write(data)
            for section in ("leaf_directory", "tile_data"):
                f.seek(header[f"{section}_offset"])
                left = header[f"{section}_length"]
                while left > 0:
                    chunk = f.read(min(left, 1 << 24))
                    if not chunk:
                        raise ValueError(f"{path}: truncated archive")
                    out.write(chunk)
                    left -= len(chunk)
    tmp.replace(path)
    return removed


__all__ = ["Compression", "TileType"]
