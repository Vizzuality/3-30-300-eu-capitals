"""Where each capital is drawn on the Home map: enlarged, and nudged apart where outlines would
overlap.

The layout is computed in screen pixels at the Home view's reference scale (Web Mercator metres
per pixel), as the map shows it. Each outline (metres from its centre) is enlarged so that its
size, the square root of its area, is ``size_px * km ** size_exponent`` pixels: the smaller the
city, the more it is enlarged. Outlines closer than ``gap_px`` are then pushed apart along the line
joining their centres, the smaller one moving more, until none are; nothing moves otherwise.

The outlines are drawn from display geometries made for that size (``display_outline``): channels
too narrow to see are closed, parts and holes too small to see are dropped and the rest is
simplified. Every figure (area, residents, shares) comes from the full-detail geometry.
"""

from __future__ import annotations

import itertools
import math

import numpy as np
import shapely
from shapely import affinity
from shapely.ops import nearest_points

from data_processing.core.geo import polygon_parts, polygonal

R = 6378137.0  # Web Mercator sphere


def mercator(lon: float, lat: float) -> tuple[float, float]:
    return (
        R * math.radians(lon),
        R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)),
    )


def lonlat(x: float, y: float) -> tuple[float, float]:
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


def enlargement(km: float, lat: float, layout: dict) -> float:
    """Factor applied to the true outline (metres on the ground) on the Home map."""
    size_px = layout["size_px"] * km ** layout["size_exponent"]
    ground_m_per_px = layout["reference_m_per_px"] * math.cos(math.radians(lat))
    return size_px * ground_m_per_px / (km * 1000)


def home_px_m(km: float, layout: dict) -> float:
    """Metres on the ground per pixel of the city's enlarged outline at the reference scale: its
    size (``km``) over its size in pixels. The latitude cancels out of the enlargement."""
    return km * 1000 / (layout["size_px"] * km ** layout["size_exponent"])


def display_outline(geom, px_m: float, outline: dict) -> shapely.Geometry:
    """The outline as Home draws it, from the full-detail city (metres, a local projection), for
    pixels of ``px_m`` metres (``home_px_m``): channels narrower than ``merge_gap_px`` are closed
    (dilated then eroded by half that, with mitred corners, which leaves the rest in place), parts
    and holes smaller than ``min_area_px2`` are dropped (the largest part always stays), and the
    outline is simplified to ``tolerance_px`` (Douglas-Peucker, topology kept, so rings stay
    valid and apart)."""
    g = polygonal(geom)
    r = outline["merge_gap_px"] / 2 * px_m
    if r > 0:
        g = polygonal(g.buffer(r, join_style="mitre").buffer(-r, join_style="mitre"))
    min_area = outline["min_area_px2"] * px_m**2
    parts = sorted(polygon_parts(g), key=lambda p: -p.area)
    kept = [
        shapely.Polygon(p.exterior, [h for h in p.interiors if shapely.Polygon(h).area >= min_area])
        for i, p in enumerate(parts)
        if i == 0 or p.area >= min_area
    ]
    simple = polygonal(
        shapely.MultiPolygon(kept).simplify(outline["tolerance_px"] * px_m, preserve_topology=True)
    )
    return shapely.MultiPolygon(polygon_parts(simple))


def outline_px(outline: list, scale: float, lat: float, layout: dict) -> shapely.Geometry:
    """The enlarged outline in pixels around (0, 0), y up."""
    k = scale / (layout["reference_m_per_px"] * math.cos(math.radians(lat)))
    polys = [
        shapely.Polygon(np.asarray(rings[0]) * k, [np.asarray(r) * k for r in rings[1:]])
        for rings in outline
    ]
    return shapely.make_valid(shapely.MultiPolygon(polys) if len(polys) > 1 else polys[0])


def _extent(geom, u) -> tuple[float, float]:
    coords = shapely.get_coordinates(geom)
    p = coords @ u
    return float(p.min()), float(p.max())


def nudge(shapes: dict, anchors: dict, gap: float, max_iterations: int = 2000) -> dict:
    """Positions (pixels) of shapes drawn around their anchors so that no two are closer than
    ``gap``. A pair too close is pushed apart along the line between their positions, by the
    overlap of their extents along that line plus the gap, shared in inverse proportion to their
    areas (half of it per pass, so that crowded groups settle). Deterministic: pairs are taken in
    the order of their keys."""
    pos = {k: np.asarray(anchors[k], dtype=float) for k in sorted(shapes)}
    area = {k: max(shapes[k].area, 1e-9) for k in shapes}
    keys = sorted(shapes)
    for _ in range(max_iterations):
        moved = False
        for a, b in itertools.combinations(keys, 2):
            ga = affinity.translate(shapes[a], *pos[a])
            gb = affinity.translate(shapes[b], *pos[b])
            if ga.distance(gb) >= gap - 1e-6:
                continue
            d = pos[a] - pos[b]
            n = float(np.hypot(*d))
            u = d / n if n > 1e-9 else np.array([1.0, 0.0])
            amin, _ = _extent(ga, u)
            _, bmax = _extent(gb, u)
            need = max(bmax - amin + gap, 0.0)
            if need <= 1e-6:
                continue
            step = max(need / 2, min(need, 0.5))
            wa = area[b] / (area[a] + area[b])
            pos[a] = pos[a] + u * step * wa
            pos[b] = pos[b] - u * step * (1 - wa)
            moved = True
        if not moved:
            return pos
    raise RuntimeError(f"Home layout: outlines still overlap after {max_iterations} passes")


def home_layout(records: list[dict], layout: dict) -> dict:
    """``scale``, ``display`` and ``leader`` of each capital (capitals.json), by slug."""
    mpp = layout["reference_m_per_px"]
    shapes, anchors, scales = {}, {}, {}
    for r in records:
        lon, lat = r["centre"]
        scales[r["slug"]] = enlargement(r["km"], lat, layout)
        shapes[r["slug"]] = outline_px(r["outline"], scales[r["slug"]], lat, layout)
        x, y = mercator(lon, lat)
        anchors[r["slug"]] = (x / mpp, y / mpp)
    pos = nudge(shapes, anchors, layout["gap_px"], layout["max_iterations"])
    out = {}
    for slug, p in pos.items():
        lon, lat = lonlat(p[0] * mpp, p[1] * mpp)
        leader = None
        anchor = shapely.Point(anchors[slug])
        drawn = affinity.translate(shapes[slug], *p)
        if anchor.distance(shapely.Point(p)) > layout["leader_min_px"] and not drawn.covers(anchor):
            q = nearest_points(drawn.boundary, anchor)[0]
            qlon, qlat = lonlat(q.x * mpp, q.y * mpp)
            leader = [round(qlon, 6), round(qlat, 6)]
        out[slug] = {
            "scale": float(f"{scales[slug]:.4g}"),
            "display": [round(lon, 6), round(lat, 6)],
            "leader": leader,
        }
    return out
