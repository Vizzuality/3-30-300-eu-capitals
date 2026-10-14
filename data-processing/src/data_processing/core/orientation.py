"""Reference layers of the capital page's overview: the main roads, and the names of the city's
districts.

Roads. Every way of class motorway, trunk, primary, secondary or tertiary (``road_class``), the
same over the whole context rectangle: no ramps (``*_link``), no minor street. Each dual
carriageway is drawn as one line (``merge_dual_carriageways``).

Districts. The level below the municipality that gives ``min_names`` to ``max_names`` areas
(administrative boundaries first, else ``place=suburb`` thinned by spacing), then the next finer
level; each area named at a point inside it, within the city.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field, replace

import numpy as np
import shapely
import shapely.ops

CLASSES = ("motorway", "trunk", "primary", "secondary", "tertiary")
RANK = {c: i + 1 for i, c in enumerate(CLASSES)}
MAIN_RANK = 3  # motorway, trunk, primary: the zooms below 10


def road_class(tags: dict) -> str | None:
    """The class a way is drawn with in ``roads``, as OpenStreetMap's own maps choose roads at
    these zooms: motorway, trunk, primary, secondary or tertiary, the way itself and nothing
    else: no ``*_link`` (ramps and slip roads, an interchange's detail), no residential or minor
    street, no path, no area (``area=yes``). None when the way is left out."""
    cls = tags.get("highway")
    if cls not in RANK or tags.get("area") == "yes":
        return None
    return cls


def first_zoom(cls: str, main_minzoom: int, minzoom: int) -> int:
    """The zoom a road shows from: motorway, trunk and primary from ``main_minzoom``, the others
    from ``minzoom``."""
    return main_minzoom if RANK[cls] <= MAIN_RANK else minzoom


def is_tunnel(tags: dict) -> bool:
    return tags.get("tunnel") not in (None, "no")


# ------------------------------------------------------------------ districts
def choose_levels(counts: dict[int, int], places: dict[str, int], rules: dict) -> tuple:
    """The two tiers of district names: (kind, level) each, kind ``admin`` (``level`` an
    admin_level) or ``place`` (``level`` a place value), or None.

    Tier 1: the coarsest admin level with ``min_names``–``max_names`` areas in the city, else
    ``place=suburb`` (thinned to ``max_names``). Tier 2: a finer level with more names than tier
    1: after an admin level, the next finer admin level, else ``place=suburb``; after
    ``place=suburb``, the admin level with the fewest areas above tier 1's names; else
    ``place=neighbourhood`` or ``place=quarter``, whichever has more."""
    lo, hi = rules["min_names"], rules["max_names"]
    levels = sorted(counts)
    n_suburb = places.get("suburb", 0)
    t1 = next((("admin", lv) for lv in levels if lo <= counts[lv] <= hi), None)
    if t1 is None:
        t1 = ("place", "suburb") if n_suburb else None
    if t1 is None:
        return None, None
    finer = max(
        ("neighbourhood", "quarter"), key=lambda k: (places.get(k, 0), k == "neighbourhood")
    )
    if t1[0] == "admin":
        n1 = counts[t1[1]]
        t2 = next((("admin", lv) for lv in levels if lv > t1[1] and counts[lv] > n1), None)
        if t2 is None and n_suburb > n1:
            t2 = ("place", "suburb")
    else:
        n1 = min(n_suburb, hi)
        above = [lv for lv in levels if counts[lv] > n1]
        t2 = ("admin", min(above, key=lambda lv: (counts[lv], lv))) if above else None
    if t2 is None and places.get(finer, 0) > n1:
        t2 = ("place", finer)
    return t1, t2


def thin_by_spacing(points: list[tuple[float, float]], order: list[int], max_n: int) -> list[int]:
    """Indices of the points kept, taken in ``order`` (most important first) at least a spacing
    apart: the smallest spacing (1 m steps of a bisection) that keeps at most ``max_n``."""

    def keep(spacing):
        out = []
        for i in order:
            if all(math.dist(points[i], points[j]) >= spacing for j in out):
                out.append(i)
        return out

    if len(points) <= max_n:
        return list(order)
    lo, hi = 0.0, 1.0
    while len(keep(hi)) > max_n:
        hi *= 2
    while hi - lo > 1.0:
        mid = (lo + hi) / 2
        if len(keep(mid)) > max_n:
            lo = mid
        else:
            hi = mid
    return keep(hi)


def label_point(area) -> shapely.Point:
    """A point inside an area, far from its edges: the pole of inaccessibility of its largest
    part (to 1 m)."""
    parts = [p for p in shapely.get_parts(area) if p.geom_type == "Polygon" and not p.is_empty]
    largest = max(parts, key=lambda p: p.area)
    return shapely.ops.polylabel(largest, tolerance=1.0)


# ------------------------------------------------------------------ dual carriageways, merged
@dataclass
class Piece:
    """A line drawn in the ``roads`` layer (EPSG:3035)."""

    geom: shapely.LineString
    cls: str
    tunnel: bool
    minzoom: int
    dual: bool = False
    key: str = ""  # ref, else name: the road it belongs to (its carriageways pair by it)
    oneway: bool = False
    name: str = ""


def _tangents(line: shapely.LineString, dists: np.ndarray, h: float = 5.0) -> np.ndarray:
    a = shapely.line_interpolate_point(line, np.clip(dists - h, 0, line.length))
    b = shapely.line_interpolate_point(line, np.clip(dists + h, 0, line.length))
    v = shapely.get_coordinates(b) - shapely.get_coordinates(a)
    n = np.hypot(v[:, 0], v[:, 1])
    n[n == 0] = 1
    return v / n[:, None]


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def _self_pairs(pts, d: np.ndarray, t: np.ndarray, max_m: float):
    """For the samples of one line: the sample of the same line further along it (by more than
    one and a half times the gap, round a U), running the other way, nearest within ``max_m``:
    the other carriageway, where both are chained into one line through a U. Only samples before
    their partner are paired, so each stretch is paired once."""
    n = len(pts)
    db = np.zeros(n)
    q = np.array(pts, dtype=object)
    ok = np.zeros(n, dtype=bool)
    ii, jj = shapely.STRtree(pts).query(pts, predicate="dwithin", distance=max_m)
    xy = shapely.get_coordinates(pts)
    gap = np.hypot(*(xy[ii] - xy[jj]).T)
    # facing samples of the two carriageways: far apart along the line (round the U), close
    # across it, running the other way
    sel = (d[jj] - d[ii] > 1.5 * gap + 10) & (np.einsum("ij,ij->i", t[ii], t[jj]) < -0.7)
    ii, jj, gap = ii[sel], jj[sel], gap[sel]
    if len(ii):
        order = np.lexsort((gap, ii))
        first = np.r_[True, ii[order][1:] != ii[order][:-1]]
        for i, j in zip(ii[order][first], jj[order][first], strict=True):
            db[i], q[i], ok[i] = d[j], pts[j], True
    return db, q, ok


@dataclass
class MergeStats:
    pairs: int = 0
    short_pairs: int = 0  # pairs under merge_min_m continuing a longer one
    km_merged: float = 0.0
    snapped: int = 0
    dropped_crossings: int = 0
    joined: int = 0  # centreline ends joined to the road they stop at
    stubs_dropped: int = 0  # one-way stubs between stretches of a centreline
    duplicates: int = 0  # centrelines drawn twice, drawn once
    road_ends: list = field(default_factory=list)  # centreline ends where the road really ends


class _Labels:
    """The class and tunnel of points along a road's carriageways, from its own ways (chained
    lines lose them): the best class of the ways a point lies on, and whether it is in a tunnel."""

    def __init__(self, pieces: list[Piece]):
        by_cls: dict[str, list] = defaultdict(list)
        for p in pieces:
            by_cls[p.cls].append(p.geom)
        self.zones = [
            (c, shapely.union_all(by_cls[c]).buffer(0.5)) for c in sorted(by_cls, key=RANK.get)
        ]
        tunnels = [p.geom for p in pieces if p.tunnel]
        self.tunnel = shapely.union_all(tunnels).buffer(0.5) if tunnels else None

    def classes(self, xy: np.ndarray) -> np.ndarray:
        out = np.full(len(xy), self.zones[-1][0], dtype=object)
        for c, zone in reversed(self.zones):  # the best class last, so it wins
            out[shapely.contains_xy(zone, xy[:, 0], xy[:, 1])] = c
        return out

    def tunnels(self, xy: np.ndarray) -> np.ndarray:
        if self.tunnel is None:
            return np.zeros(len(xy), dtype=bool)
        return shapely.contains_xy(self.tunnel, xy[:, 0], xy[:, 1])


def _label_runs(labels: list) -> list[tuple[int, int]]:
    """Runs of equal consecutive labels: (first, last) index pairs."""
    out, start = [], 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[start]:
            out.append((start, i - 1))
            start = i
    return out


def merge_dual_carriageways(pieces: list[Piece], rules: dict) -> tuple[list[Piece], MergeStats]:
    """Each dual carriageway (two one-way lines of the same road, by its ``key``, running the
    opposite ways side by side within ``merge_max_m``, over at least ``merge_min_m``) drawn as one
    centreline with ``dual`` set, whatever the classes of its ways: the centreline takes the
    better class of its two sides (OSM often tags a block of one carriageway a class lower), and
    is a tunnel only where both sides are. Roads that ended on a removed carriageway are extended
    to the centreline, short crossings of the median are dropped, and a centreline's end is joined
    to the road it stops at. Then the boxes are cleared: a one-way stub left between two stretches
    of its road's centreline (both ends on it), shorter than ``stub_max_m``, is dropped, and a
    centreline drawn twice is drawn once. Other lines are kept as they are."""
    max_m, min_m, step = rules["merge_max_m"], rules["merge_min_m"], rules["merge_step_m"]

    def zoom(cls):
        return first_zoom(cls, rules["main_minzoom"], rules["minzoom"])

    st = MergeStats()
    groups: dict[str, list[int]] = defaultdict(list)
    for i, p in enumerate(pieces):
        if p.oneway and p.key:
            groups[p.key].append(i)
    out: list[Piece] = []
    consumed: list[shapely.Geometry] = []  # removed carriageway stretches
    centre_of: list[shapely.LineString] = []  # the centreline each replaces
    used: set[int] = set()
    rests: list[Piece] = []  # what is left of the carriageways merged in places
    for key, idx in groups.items():
        # chain each carriageway (directed: the two ways stay apart)
        merged = shapely.line_merge(
            shapely.MultiLineString([pieces[i].geom for i in idx]), directed=True
        )
        lines = [g for g in shapely.get_parts(merged) if g.length > 0]
        name = pieces[idx[0]].name
        used.update(idx)
        lab = _Labels([pieces[i] for i in idx])
        cut: list[list[tuple[float, float]]] = [[] for _ in lines]  # consumed intervals
        # the ends of each stretch merged in the first pass (side by side over merge_min_m at
        # least): (position along the line, the centreline's end there)
        anchors: list[list[tuple[float, tuple]]] = [[] for _ in lines]
        reach = 1.5 * step
        # first pass: pairs side by side over merge_min_m at least; second pass: shorter pairs
        # that directly continue a stretch of the first pass (a carriageway broken by a fork
        # before the road's last block), never one of the second pass (no chain of short pairs)
        for second in (False, True):
            for a in range(len(lines)):
                la = lines[a]
                if not second and la.length < min_m:
                    continue
                d = np.arange(0, la.length + step / 2, step)
                pts = shapely.line_interpolate_point(la, d)
                ta = _tangents(la, d)
                for b in range(a + second, len(lines)):
                    lb = lines[b]
                    if b == a:
                        # one chained line holding both carriageways (they meet in a U at an end)
                        db, q, ok = _self_pairs(pts, d, ta, max_m)
                    else:
                        if la.distance(lb) > max_m:
                            continue
                        db = shapely.line_locate_point(lb, pts)
                        q = shapely.line_interpolate_point(lb, db)
                        gap = shapely.distance(pts, q)
                        tb = _tangents(lb, db)
                        ok = (gap <= max_m) & (np.einsum("ij,ij->i", ta, tb) < -0.7)
                    # a stretch already merged (of either line) is not used again: no
                    # centreline drawn twice
                    for s0, s1 in cut[a]:
                        ok &= ~((d >= s0) & (d <= s1))
                    for s0, s1 in cut[b]:
                        ok &= ~((db >= s0) & (db <= s1))
                    for k0, k1 in _runs(ok):
                        front = back = None  # the first pass's centreline end it continues
                        sa = [float(d[k0]), float(d[k1])]
                        sb = [float(db[k0]), float(db[k1])]
                        if not second:
                            if (k1 - k0) * step < min_m:
                                continue
                        else:
                            if k1 == k0:
                                continue
                            for line_k, ends in ((a, sa), (b, sb)):
                                for i, sv in enumerate(ends):
                                    near = [x for x in anchors[line_k] if abs(x[0] - sv) <= reach]
                                    if not near:
                                        continue
                                    pos, pt = min(near, key=lambda x, sv=sv: abs(x[0] - sv))
                                    ends[i] = pos  # the carriageway consumed up to it
                                    if i == 0 and front is None:
                                        front = pt
                                    elif i == 1 and back is None:
                                        back = pt
                            if front is None and back is None:
                                continue
                        pa = shapely.get_coordinates(pts[k0 : k1 + 1])
                        pb = shapely.get_coordinates(q[k0 : k1 + 1])
                        mid = (pa + pb) / 2
                        ca, cb = lab.classes(pa), lab.classes(pb)
                        cls = [x if RANK[x] <= RANK[y] else y for x, y in zip(ca, cb, strict=True)]
                        under = list(lab.tunnels(pa) & lab.tunnels(pb))
                        # joined to the centreline it continues, with the labels of its end
                        if front is not None:
                            mid = np.vstack([[front], mid])
                            cls, under = [cls[0], *cls], [under[0], *under]
                        if back is not None:
                            mid = np.vstack([mid, [back]])
                            cls, under = [*cls, cls[-1]], [*under, under[-1]]
                        centre = shapely.LineString(mid)
                        # consecutive stretches share their joining sample
                        for r0, r1 in _label_runs(list(zip(cls, under, strict=True))):
                            seg = mid[max(r0 - 1, 0) : r1 + 1]
                            if len(seg) >= 2:
                                out.append(
                                    Piece(
                                        shapely.LineString(seg),
                                        cls[r0],
                                        bool(under[r0]),
                                        zoom(cls[r0]),
                                        True,
                                        key,
                                        name=name,
                                    )
                                )
                        a0, a1 = sorted(sa)
                        b0, b1 = sorted(sb)
                        cut[a].append((a0, a1))
                        cut[b].append((b0, b1))
                        if not second:
                            anchors[a] += [(sa[0], tuple(mid[0])), (sa[1], tuple(mid[-1]))]
                            anchors[b] += [(sb[0], tuple(mid[0])), (sb[1], tuple(mid[-1]))]
                        for line, (s0, s1) in ((la, (a0, a1)), (lb, (b0, b1))):
                            consumed.append(shapely.ops.substring(line, s0, s1))
                            centre_of.append(centre)
                        st.pairs += 1
                        st.short_pairs += second
                        st.km_merged += centre.length / 1000
        # what is left of each carriageway, with its class and tunnel stretches
        for k, line in enumerate(lines):
            rest = [(0.0, line.length)]
            for s0, s1 in sorted(cut[k]):
                nxt = []
                for r0, r1 in rest:
                    if s1 <= r0 or s0 >= r1:
                        nxt.append((r0, r1))
                        continue
                    if s0 > r0:
                        nxt.append((r0, s0))
                    if s1 < r1:
                        nxt.append((s1, r1))
                rest = nxt
            for r0, r1 in rest:
                if r1 - r0 <= 0.5:
                    continue
                part = shapely.ops.substring(line, r0, r1)
                dd = np.append(np.arange(0, part.length, 2.0), part.length)
                xy = shapely.get_coordinates(shapely.line_interpolate_point(part, dd))
                labels = list(zip(lab.classes(xy), lab.tunnels(xy), strict=True))
                for i0, i1 in _label_runs(labels):
                    s0, s1 = dd[max(i0 - 1, 0)], dd[i1]
                    seg = shapely.ops.substring(part, s0, s1)
                    if seg.geom_type == "LineString" and seg.length > 0.5:
                        c, t = labels[i0]
                        rests.append(Piece(seg, c, bool(t), zoom(c), False, key, True, name))
    others = [p for i, p in enumerate(pieces) if i not in used]
    if not consumed:
        return others + rests + out, st
    tree = shapely.STRtree(consumed)
    kept = []
    for p, is_rest in [(p, False) for p in others] + [(p, True) for p in rests]:
        ends = [shapely.Point(p.geom.coords[0]), shapely.Point(p.geom.coords[-1])]
        hits = [tree.query(e, predicate="dwithin", distance=0.5) for e in ends]
        # a short crossing of the median, both ends on removed carriageways: dropped
        if not is_rest and all(len(h) for h in hits) and p.geom.length <= 1.5 * max_m:
            st.dropped_crossings += 1
            continue
        # an end on a removed carriageway (a junction, or where the carriageway goes on alone)
        # is joined to the centreline
        coords = list(p.geom.coords)
        for k, h in enumerate(hits):
            if not len(h):
                continue
            e = ends[k]
            c = min((centre_of[int(m)] for m in h), key=lambda c, e=e: c.distance(e))
            target = c.interpolate(c.project(e))
            if target.distance(e) > 0.01:
                if k == 0:
                    coords.insert(0, (target.x, target.y))
                else:
                    coords.append((target.x, target.y))
                st.snapped += 1
        kept.append(replace(p, geom=shapely.LineString(coords)))
    # a centreline's end that touches nothing: joined to the road it stops at (two dual roads
    # meeting: their centrelines end between each other's carriageways), else it is where the
    # road really ends (two carriageways meeting in a U)
    every = kept + out
    tree = shapely.STRtree([p.geom for p in every])
    reach = max_m / 2 + 5
    for k in range(len(kept), len(every)):
        c = every[k]
        coords = list(c.geom.coords)
        for end in (0, -1):
            e = shapely.Point(coords[end])
            near = [m for m in tree.query(e, predicate="dwithin", distance=reach) if m != k]
            other = [m for m in near if every[m].key != c.key]
            if any(every[m].geom.distance(e) <= 1.0 for m in other):
                continue
            if other:
                m = min(other, key=lambda m, e=e: every[m].geom.distance(e))
                target = every[m].geom.interpolate(every[m].geom.project(e))
                if end == 0:
                    coords.insert(0, (target.x, target.y))
                else:
                    coords.append((target.x, target.y))
                st.joined += 1
            elif not any(every[m].geom.distance(e) <= 1.0 for m in near):
                st.road_ends.append((e.x, e.y))
        every[k] = replace(c, geom=shapely.LineString(coords))
    every = _drop_stubs(every, rules["stub_max_m"], st, zoom)
    return _dedupe_centres(every, st), st


def _drop_stubs(pieces: list[Piece], max_len: float, st: MergeStats, zoom) -> list[Piece]:
    """The walls of the boxes: one-way stubs of a merged road left between two stretches of its
    centreline (both ends on a centreline of the same road, shorter than ``max_len``), where the
    pairing broke off for a few samples at a junction. Each is dropped, and the gap it spanned in
    the centreline is closed by a straight line between its ends (once for the two walls), with
    the best class of the centrelines it joins, a tunnel only if they all are."""
    centres: dict[str, list] = defaultdict(list)
    for p in pieces:
        if p.dual:
            centres[p.key].append(p)
    zone = {k: shapely.union_all([c.geom for c in g]) for k, g in centres.items()}
    out, bridges, dropped = [], [], []
    for p in pieces:
        c = zone.get(p.key)
        ends = [shapely.Point(p.geom.coords[0]), shapely.Point(p.geom.coords[-1])]
        if (
            c is None
            or not p.oneway
            or p.dual
            or p.geom.length >= max_len
            or any(c.distance(e) > 1.0 for e in ends)
        ):
            out.append(p)
            continue
        st.stubs_dropped += 1
        dropped.append(p)
        a, b = (shapely.ops.nearest_points(c, e)[0] for e in ends)
        if a.distance(b) <= 1.0:
            continue
        # the other wall of the same box closes the same gap: one bridge (its ends land a few
        # metres apart on the centreline, where each carriageway met the crossing)
        same = [
            q
            for q in bridges
            if q.key == p.key
            and min(
                max(
                    a.distance(shapely.Point(q.geom.coords[0])),
                    b.distance(shapely.Point(q.geom.coords[-1])),
                ),
                max(
                    b.distance(shapely.Point(q.geom.coords[0])),
                    a.distance(shapely.Point(q.geom.coords[-1])),
                ),
            )
            <= max_len / 4
        ]
        if not same:
            joined = [
                q for q in centres[p.key] if min(q.geom.distance(a), q.geom.distance(b)) <= 1.0
            ]
            cls = min((q.cls for q in joined), key=RANK.get, default=p.cls)
            tunnel = bool(joined) and all(q.tunnel for q in joined)
            bridges.append(
                replace(
                    p,
                    geom=shapely.LineString([a, b]),
                    cls=cls,
                    tunnel=tunnel,
                    minzoom=zoom(cls),
                    dual=True,
                    oneway=False,
                )
            )
    if not dropped:
        return out
    # a road that ended on a dropped stub is extended to the centreline, as for a removed
    # carriageway
    tree = shapely.STRtree([p.geom for p in dropped])
    kept = []
    for p in out:
        coords = list(p.geom.coords)
        for end in (0, -1):
            e = shapely.Point(coords[end])
            hits = [int(m) for m in tree.query(e, predicate="dwithin", distance=0.5)]
            if not hits or (p.dual and zone.get(p.key) is not None):
                continue
            c = zone[dropped[hits[0]].key]
            if c.distance(e) <= 1.0:
                continue
            t = shapely.ops.nearest_points(c, e)[0]
            if end == 0:
                coords.insert(0, (t.x, t.y))
            else:
                coords.append((t.x, t.y))
            st.snapped += 1
        kept.append(replace(p, geom=shapely.LineString(coords)))
    return kept + bridges


def _dedupe_centres(pieces: list[Piece], st: MergeStats) -> list[Piece]:
    """A centreline drawn twice drawn once: the stretch of a centreline lying on a longer one of
    the same road (within 1 m) is cut away, and the cut end is joined back to it."""
    duals = sorted((p for p in pieces if p.dual), key=lambda p: -p.geom.length)
    others = [p for p in pieces if not p.dual]
    covered: dict[str, list] = defaultdict(list)
    kept = []
    for p in duals:
        g = p.geom
        near = [c for c in covered[p.key] if c.distance(g) <= 1.0]
        covered[p.key].append(g)
        if not near:
            kept.append(p)
            continue
        cover = shapely.union_all(near)
        left = g.difference(cover.buffer(1.0))
        if left.length >= g.length - 0.01:
            kept.append(p)
            continue
        st.duplicates += 1
        for part in shapely.get_parts(left):
            if part.length <= 1.0:
                continue
            coords = list(part.coords)
            for end in (0, -1):
                e = shapely.Point(coords[end])
                if cover.distance(e) <= 1.5:
                    t = shapely.ops.nearest_points(cover, e)[0]
                    if end == 0:
                        coords.insert(0, (t.x, t.y))
                    else:
                        coords.append((t.x, t.y))
            kept.append(replace(p, geom=shapely.LineString(coords)))
    return others + kept


def geometric_dangling_ends(pieces, inside, exempt) -> int:
    """Line ends that touch no other line (within 1 m), ``inside`` (a predicate on points) and
    not ``exempt`` (real road ends, the context's edge)."""
    geoms = [p.geom for p in pieces]
    merged = list(shapely.get_parts(shapely.line_merge(shapely.MultiLineString(geoms))))
    tree = shapely.STRtree(merged)
    count = 0
    for k, g in enumerate(merged):
        if g.is_ring:
            continue
        for e in (shapely.Point(g.coords[0]), shapely.Point(g.coords[-1])):
            if not inside(e) or exempt(e):
                continue
            touching = [m for m in tree.query(e, predicate="dwithin", distance=1.0) if m != k]
            if touching or g.length <= 4:
                continue
            # a line whose end touches its own course further on (a loop) is not an end either
            rest = (
                shapely.ops.substring(g, 2.0, g.length)
                if e.equals(shapely.Point(g.coords[0]))
                else shapely.ops.substring(g, 0.0, g.length - 2.0)
            )
            if rest.distance(e) > 1.0:
                count += 1
    return count


def parallel_one_ways(pieces: list[Piece], max_m: float) -> int:
    """One-way lines still drawn beside another one-way line of the same road, running the other
    way within ``max_m`` (a divided road left as two lines, or a box of short pieces)."""
    one = [p for p in pieces if p.oneway and not p.dual and p.key]
    if not one:
        return 0
    tree = shapely.STRtree([p.geom for p in one])
    count = 0
    for k, p in enumerate(one):
        mid = p.geom.interpolate(0.5, normalized=True)
        u = np.subtract(p.geom.coords[-1], p.geom.coords[0])
        for m in tree.query(mid, predicate="dwithin", distance=max_m):
            q = one[m]
            if m != k and q.key == p.key:
                v = np.subtract(q.geom.coords[-1], q.geom.coords[0])
                if float(np.dot(u, v)) < 0:
                    count += 1
                    break
    return count
