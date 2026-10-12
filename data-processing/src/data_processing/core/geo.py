"""Geometry helpers shared by the pipelines."""

from __future__ import annotations

import math

import numpy as np
import shapely
from pyproj import Transformer

_TRANSFORMERS: dict[tuple[str, str], Transformer] = {}


def transformer(src: str, dst: str) -> Transformer:
    key = (src, dst)
    if key not in _TRANSFORMERS:
        _TRANSFORMERS[key] = Transformer.from_crs(src, dst, always_xy=True)
    return _TRANSFORMERS[key]


def reproject(geom, src: str, dst: str):
    """Reproject a shapely geometry (or array of geometries)."""
    t = transformer(src, dst)
    return shapely.transform(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def polygonal(geom) -> shapely.Geometry:
    """Valid (Multi)Polygon made of the polygonal parts of ``geom`` (empty Polygon if none)."""
    if geom is None or geom.is_empty:
        return shapely.Polygon()
    g = shapely.make_valid(geom)
    parts = [p for p in shapely.get_parts(g) if p.geom_type in ("Polygon", "MultiPolygon")]
    out = []
    for p in parts:
        out.extend(q for q in shapely.get_parts(p) if q.area > 0)
    if not out:
        return shapely.Polygon()
    return out[0] if len(out) == 1 else shapely.MultiPolygon(out)


def polygon_parts(geom) -> list[shapely.Polygon]:
    g = polygonal(geom)
    return [] if g.is_empty else list(shapely.get_parts(g))


def lonlat_bbox(geom_3035, crs: str = "EPSG:3035", pad_deg: float = 0.0):
    """(west, south, east, north) of a projected geometry, densified so edges are covered."""
    g = reproject(shapely.segmentize(shapely.box(*geom_3035.bounds), 500.0), crs, "EPSG:4326")
    w, s, e, n = g.bounds
    return (w - pad_deg, s - pad_deg, e + pad_deg, n + pad_deg)


def true_bearing(x, y, dx, dy, crs: str = "EPSG:3035") -> np.ndarray:
    """Compass bearing (degrees clockwise from true north) of direction (dx, dy) at (x, y)."""
    t = transformer(crs, "EPSG:4326")
    lon0, lat0 = t.transform(np.asarray(x), np.asarray(y))
    n = np.hypot(dx, dy)
    n = np.where(n > 0, n, 1.0)
    lon1, lat1 = t.transform(np.asarray(x) + 10 * dx / n, np.asarray(y) + 10 * dy / n)
    east = (np.asarray(lon1) - lon0) * np.cos(np.radians(lat0))
    north = np.asarray(lat1) - lat0
    return np.degrees(np.arctan2(east, north)) % 360


COMPASS8 = np.array(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])


def compass8(bearing) -> np.ndarray:
    return COMPASS8[np.round(np.asarray(bearing) / 45).astype(int) % 8]


def web_mercator_tile(lon, lat, z: int):
    n = 2**z
    lat = np.clip(np.asarray(lat, dtype=float), -85.0511, 85.0511)
    x = np.floor((np.asarray(lon) + 180) / 360 * n).astype(np.int64)
    y = np.floor((1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n).astype(np.int64)
    return x, y
