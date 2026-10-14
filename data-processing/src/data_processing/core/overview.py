"""The capital page's overview: where its camera may go, and the water drawn around the city.

The camera is fitted to the city as the client fits it (math.gl's ``fitBounds``, on deck.gl's Web
Mercator: a 512 px world at zoom 0), on the desktop map and on the phone's map band, each with its
padding; the fit is never held back by the capital page's least zoom (9): a whole city is always
shown, and the least zoom follows it. The camera may zoom out ``zoom_out`` below its fitted zoom,
and the context rectangle is the union of what both views show at that least zoom, around the
fitted centre: the camera stays inside it, and the context water covers it.
"""

from __future__ import annotations

import math

import shapely

from data_processing.core.geo import polygon_parts

TILE_PX = 512
EARTH_M = 2 * math.pi * 6378137.0  # Web Mercator's circumference


def world_px(lon: float, lat: float) -> tuple[float, float]:
    """Web Mercator pixels of a 512 px world at zoom 0 (x east, y south)."""
    x = TILE_PX * (lon + 180) / 360
    y = TILE_PX * (0.5 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / (2 * math.pi))
    return x, y


def world_lonlat(x: float, y: float) -> tuple[float, float]:
    lon = x / TILE_PX * 360 - 180
    lat = math.degrees(2 * math.atan(math.exp((0.5 - y / TILE_PX) * 2 * math.pi)) - math.pi / 2)
    return lon, lat


def fit(bounds, frame: dict, max_zoom: float) -> dict:
    """The camera fitted to ``bounds`` (west, south, east, north) in a ``frame`` (width, height,
    padding [top, right, bottom, left] in px), as math.gl's ``fitBounds`` does: centre in world
    px (shifted by half the padding difference, at each axis's own scale), zoom of the tighter
    axis, at most ``max_zoom``."""
    w, s, e, n = bounds
    x0, y0 = world_px(w, n)
    x1, y1 = world_px(e, s)
    top, right, bottom, left = frame["padding"]
    scale_x = (frame["width"] - left - right) / (x1 - x0)
    scale_y = (frame["height"] - top - bottom) / (y1 - y0)
    return {
        "cx": (x0 + x1) / 2 + (right - left) / 2 / scale_x,
        "cy": (y0 + y1) / 2 + (bottom - top) / 2 / scale_y,
        "zoom": min(max_zoom, math.log2(min(scale_x, scale_y))),
    }


def view(camera: dict, frame: dict, zoom: float) -> tuple[float, float, float, float]:
    """What a camera shows at ``zoom``: (x0, y0, x1, y1) in world px."""
    s = 2**zoom
    hw, hh = frame["width"] / 2 / s, frame["height"] / 2 / s
    return camera["cx"] - hw, camera["cy"] - hh, camera["cx"] + hw, camera["cy"] + hh


def context_rectangle(bounds, overview: dict) -> dict:
    """The context of a city of ``bounds``: ``bbox`` (west, south, east, north), the union of the
    views of every frame at its least zoom (its fitted zoom minus ``zoom_out``, which may be below
    the page's usual least zoom), and ``min_zoom`` per frame. Rounded so that the views stay
    inside: the box outwards to 5 decimals, the zooms up to 2. ``tile_zooms`` are the zooms of its
    water tiles: from the floor of the least ``min_zoom`` (at most ``water.minzoom``) to
    ``water.maxzoom``, or further when a fitted view would load finer tiles (deck.gl loads the
    tiles of the rounded zoom: Valletta's overview is at zoom 15)."""
    boxes, min_zoom, fitted = [], {}, []
    for name, frame in overview["frames"].items():
        camera = fit(bounds, frame, overview["max_zoom"])
        fitted.append(camera["zoom"])
        least = camera["zoom"] - overview["zoom_out"]
        min_zoom[name] = math.ceil(least * 100) / 100
        boxes.append(view(camera, frame, least))
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    (w, n), (e, s) = world_lonlat(x0, y0), world_lonlat(x1, y1)
    k = 1e5
    bbox = [
        math.floor(w * k) / k,
        math.floor(s * k) / k,
        math.ceil(e * k) / k,
        math.ceil(n * k) / k,
    ]
    water = overview["water"]
    first = min(water["minzoom"], math.floor(min(min_zoom.values())))
    tile_zooms = [first, max(water["maxzoom"], round(max(fitted)))]
    return {"bbox": bbox, "min_zoom": min_zoom, "tile_zooms": tile_zooms}


def ground_m_per_px(lat: float, zoom: float) -> float:
    """Metres on the ground per pixel of 512 px tiles at ``zoom`` and latitude ``lat``."""
    return EARTH_M * math.cos(math.radians(lat)) / (TILE_PX * 2**zoom)


def slim_water(water, m_per_px: float, min_width_px: float, min_piece_px: float):
    """Water as the overview draws it away from the city: without water narrower than about
    ``min_width_px`` (opened by half of it: ditches, canals, streams) and pieces smaller than
    ``min_piece_px`` × ``min_piece_px``, for pixels of ``m_per_px`` metres."""
    r = min_width_px / 2 * m_per_px
    opened = water.buffer(-r, quad_segs=2).buffer(r, quad_segs=2)
    min_area = (min_piece_px * m_per_px) ** 2
    return shapely.MultiPolygon([p for p in polygon_parts(opened) if p.area >= min_area])
