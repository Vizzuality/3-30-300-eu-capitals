"""Street name candidates for zooms 15 and 16. The browser places the names: it cannot bend text
along a line, so the pipeline prepares straight positions to choose from.

- Ways with the same name are merged; the two sides of a dual carriageway give twin candidates,
  merged into one between them.
- Each street is cut into straight stretches (no point further than 2 px from the stretch's chord
  at that zoom); stretches too short for the name at 12 px, plus a margin, are dropped.
- Candidates sit in the middle of the room left on a stretch, at least 10 px from crossings with
  other named streets, repeated every 280 px along long stretches.
- Each stores its name, angle (degrees counter-clockwise from east, turned to read left to right),
  stretch length and text width in px at its zoom, and a rank (highway class, then street length).

Text widths come from the real fonts (Figtree, Noto Sans for Greek and Cyrillic) at weight 500,
measured with Pillow.
"""

from __future__ import annotations

import math
import unicodedata
from collections import defaultdict

import numpy as np
from PIL import ImageFont
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import linemerge

from data_processing.core.geo import transformer

LABEL_RANK = {
    "motorway": 1,
    "trunk": 1,
    "primary": 2,
    "secondary": 3,
    "tertiary": 4,
    "unclassified": 5,
    "residential": 5,
    "living_street": 6,
    "pedestrian": 6,
}

ZOOMS = (15, 16)
FONT_PX = 12
MARGIN_PX = 6
STRAIGHT_PX = 2.0
CROSSING_PX = 10
SPACING_PX = 280
TWIN_M = 45
R = 6378137.0


def px_per_m(z: int) -> float:
    """Screen pixels per Web Mercator metre at zoom z (512 px tiles, as deck.gl)."""
    return 512 * 2**z / (2 * math.pi * R)


class Measure:
    """Width of a name at 12 px, weight 500; Greek and Cyrillic characters from Noto Sans, as the
    browser's font fallback does. Measured at 10x then scaled, to avoid hinting rounding."""

    def __init__(self, figtree: str, noto_sans: str):
        self.figtree = ImageFont.truetype(figtree, FONT_PX * 10)
        self.figtree.set_variation_by_axes([500])
        self.noto = ImageFont.truetype(noto_sans, FONT_PX * 10)
        self.noto.set_variation_by_axes([500, 100])  # axes: weight, width

    @staticmethod
    def needs_noto(ch: str) -> bool:
        return unicodedata.name(ch, "").startswith(("GREEK", "CYRILLIC"))

    def __call__(self, text: str) -> float:
        width, run, run_noto = 0.0, "", None
        for ch in text:
            n = self.needs_noto(ch)
            if run and n != run_noto:
                width += (self.noto if run_noto else self.figtree).getlength(run)
                run = ""
            run += ch
            run_noto = n
        if run:
            width += (self.noto if run_noto else self.figtree).getlength(run)
        return width / 10


def straight_stretches(coords: np.ndarray, tol: float):
    out, i, n = [], 0, len(coords)
    while i < n - 1:
        j = i + 1
        while j + 1 < n:
            a, b = coords[i], coords[j + 1]
            ab = b - a
            length = np.hypot(*ab)
            if length == 0:
                j += 1
                continue
            pts = coords[i + 1 : j + 1]
            d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / length
            if d.max(initial=0) > tol:
                break
            j += 1
        out.append((coords[i], coords[j]))
        i = j
    return out


def reading_angle(dx: float, dy: float) -> float:
    a = math.degrees(math.atan2(dy, dx))
    if a > 90:
        a -= 180
    elif a <= -90:
        a += 180
    return a


def label_candidates(ways: list[dict], area_merc, measure: Measure):
    """Candidates (GeoJSON features with Tippecanoe zooms) and the width of each name."""
    to_merc = transformer("EPSG:4326", "EPSG:3857")
    to_ll = transformer("EPSG:3857", "EPSG:4326")
    streets = defaultdict(list)
    rank_of: dict[str, int] = {}
    node_names = defaultdict(set)
    node_xy = {}
    for w in ways:
        tags = w.get("tags", {})
        rank = LABEL_RANK.get(tags.get("highway"))
        name = tags.get("name")
        if rank is None or not name:
            continue
        geom = w["geometry"]
        nodes = w.get("nodes") or [None] * len(geom)
        pts = [(p["lon"], p["lat"]) for p in geom if p is not None]
        if len(pts) < 2:
            continue
        xs, ys = to_merc.transform(*zip(*pts, strict=True))
        streets[name].append(LineString(zip(xs, ys, strict=True)))
        rank_of[name] = min(rank, rank_of.get(name, 9))
        for nid, x, y in zip(nodes, xs, ys, strict=False):
            if nid is not None:
                node_names[nid].add(name)
                node_xy[nid] = (x, y)
    crossings = np.array([node_xy[i] for i, names in node_names.items() if len(names) >= 2])
    if not len(crossings):
        crossings = np.zeros((0, 2))
    widths = {name: round(measure(name), 2) for name in streets}
    features = []
    for z in ZOOMS:
        k = px_per_m(z)
        cands = []
        for name, lines in streets.items():
            merged = linemerge(lines)
            parts = list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]
            street_len = sum(p.length for p in parts)
            need = widths[name] + 2 * MARGIN_PX
            for part in parts:
                coords = np.asarray(part.coords) * k
                for a, b in straight_stretches(coords, STRAIGHT_PX):
                    length = float(np.hypot(*(b - a)))
                    if length < need:
                        continue
                    u = (b - a) / length
                    lo, hi = need / 2, length - need / 2
                    mid = (lo + hi) / 2
                    count = max(1, int((hi - lo) // SPACING_PX) + 1)
                    offsets = [mid + (i - (count - 1) / 2) * SPACING_PX for i in range(count)]
                    if len(crossings):
                        rel = crossings * k - a
                        along = rel @ u
                        across = np.abs(rel[:, 0] * u[1] - rel[:, 1] * u[0])
                        on = (across < 3) & (along > -CROSSING_PX) & (along < length + CROSSING_PX)
                        along = along[on]
                    else:
                        along = np.zeros(0)
                    for t in offsets:
                        best, best_d = None, -1.0
                        for tt in np.linspace(
                            max(lo, t - SPACING_PX / 2), min(hi, t + SPACING_PX / 2), 15
                        ):
                            d = np.abs(along - tt).min(initial=1e9)
                            if d > best_d + 1e-6 or (
                                abs(d - best_d) < 1e-6 and abs(tt - t) < abs(best - t)
                            ):
                                best, best_d = tt, d
                        if best_d < CROSSING_PX:
                            continue
                        p = (a + u * best) / k
                        if not area_merc.contains(Point(p)):
                            continue
                        cands.append(
                            {
                                "name": name,
                                "x": p[0],
                                "y": p[1],
                                "angle": reading_angle(*u),
                                "len": length,
                                "rank": rank_of[name],
                                "slen": street_len,
                            }
                        )
        by_name = defaultdict(list)
        for c in cands:
            by_name[c["name"]].append(c)
        for cs in by_name.values():
            cs.sort(key=lambda c: -c["len"])
            used = [False] * len(cs)
            for i, c in enumerate(cs):
                if used[i]:
                    continue
                group = [c]
                for j in range(i + 1, len(cs)):
                    if used[j]:
                        continue
                    d = cs[j]
                    dist_m = math.hypot(d["x"] - c["x"], d["y"] - c["y"])
                    da = abs((d["angle"] - c["angle"] + 90) % 180 - 90)
                    twin = da < 15 and dist_m < TWIN_M
                    if twin or dist_m * k < SPACING_PX / 2:
                        used[j] = True
                        if twin:
                            group.append(d)
                if len(group) > 1:
                    c = dict(  # noqa: PLW2901 - twins merged into one candidate between them
                        c,
                        x=sum(g["x"] for g in group) / len(group),
                        y=sum(g["y"] for g in group) / len(group),
                    )
                lon, lat = to_ll.transform(c["x"], c["y"])
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [round(lon, 7), round(lat, 7)],
                        },
                        "properties": {
                            "name": c["name"],
                            "angle": round(c["angle"], 1),
                            "z": z,
                            "len": round(c["len"]),
                            "w": widths[c["name"]],
                            "rank": c["rank"],
                            "slen": round(c["slen"]),
                        },
                        "tippecanoe": {"layer": "street_labels", "minzoom": z, "maxzoom": z},
                    }
                )
    return features, widths
