"""Facades: the walls of a building that people look out of.

Each building outline is split into walls at its corners (wherever the outline turns by more than
25°); walls shorter than 3 m are dropped. Outlines first lose their vertex jitter (0.5 m
simplification). An outline with fewer than two corners (a round building) is cut into pieces of
about 15 m (at least three). Rings are oriented so the building is on the left of each wall, so
the outside is always on the right.
"""

from __future__ import annotations

import math

import numpy as np
import shapely


def _dedupe(p: np.ndarray, tol: float = 0.05) -> np.ndarray:
    if len(p) < 2:
        return p
    keep = np.r_[True, np.hypot(*np.diff(p, axis=0).T) > tol]
    p = p[keep]
    if len(p) > 1 and np.hypot(*(p[0] - p[-1])) <= tol:
        p = p[:-1]
    return p


def ring_walls(
    ring: np.ndarray, corner_deg: float, min_length: float, round_piece: float
) -> list[np.ndarray]:
    """Walls of a closed ring (first point repeated or not), as open polylines."""
    p = _dedupe(np.asarray(ring, dtype=np.float64)[:, :2])
    n = len(p)
    if n < 3:
        return []
    e = np.roll(p, -1, axis=0) - p  # edge i goes from vertex i to i+1
    el = np.hypot(e[:, 0], e[:, 1])
    ang = np.arctan2(e[:, 1], e[:, 0])
    turn = np.angle(np.exp(1j * (ang - np.roll(ang, 1))))  # turn at vertex i
    corners = np.nonzero(np.abs(turn) > math.radians(corner_deg))[0]
    cum = np.r_[0.0, np.cumsum(el)]
    per = cum[-1]

    if len(corners) < 2:
        start = int(corners[0]) if len(corners) == 1 else 0
        order = np.r_[np.arange(start, n), np.arange(0, start)]
        q = np.vstack([p[order], p[order[:1]]])
        qc = np.r_[0.0, np.cumsum(np.hypot(*np.diff(q, axis=0).T))]
        k = max(3, round(per / round_piece))
        cuts = np.linspace(0, per, k + 1)
        walls = []
        for a, b in zip(cuts[:-1], cuts[1:], strict=True):
            inner = (qc > a) & (qc < b)
            pts = np.vstack([_interp(q, qc, a), q[inner], _interp(q, qc, b)])
            walls.append(pts)
    else:
        walls = []
        m = len(corners)
        for k in range(m):
            a, b = int(corners[k]), int(corners[(k + 1) % m])
            idx = np.arange(a, b + 1) if b > a else np.r_[np.arange(a, n), np.arange(0, b + 1)]
            walls.append(p[idx % n])
    out = []
    for w in walls:
        length = float(np.hypot(*np.diff(w, axis=0).T).sum())
        if length >= min_length:
            out.append(w)
    return out


def _interp(q: np.ndarray, qc: np.ndarray, s: float) -> np.ndarray:
    i = int(np.clip(np.searchsorted(qc, s, side="right") - 1, 0, len(q) - 2))
    t = (s - qc[i]) / max(qc[i + 1] - qc[i], 1e-12)
    return (q[i] + t * (q[i + 1] - q[i]))[None, :]


def polygon_walls(
    geom, simplify: float, corner_deg: float, min_length: float, round_piece: float
) -> list[np.ndarray]:
    """Walls of every ring of a (Multi)Polygon, with the building on their left."""
    g = shapely.simplify(geom, simplify, preserve_topology=True)
    g = shapely.orient_polygons(g, exterior_cw=False)
    walls = []
    for poly in shapely.get_parts(g):
        for ring in [poly.exterior, *poly.interiors]:
            walls.extend(ring_walls(np.asarray(ring.coords), corner_deg, min_length, round_piece))
    return walls


def wall_samples(wall: np.ndarray, step: float, offset: float):
    """Points every ``step`` m along a wall (centred), pushed ``offset`` m to its right (outside),
    and the wall's mean outward direction weighted by length."""
    seg = np.diff(wall, axis=0)
    sl = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.r_[0.0, np.cumsum(sl)]
    length = cum[-1]
    k = max(1, round(length / step))
    pos = (np.arange(k) + 0.5) * length / k
    i = np.clip(np.searchsorted(cum, pos, side="right") - 1, 0, len(sl) - 1)
    t = (pos - cum[i]) / np.maximum(sl[i], 1e-12)
    base = wall[i] + t[:, None] * seg[i]
    tangent = seg[i] / np.maximum(sl[i], 1e-12)[:, None]
    normal = np.column_stack([tangent[:, 1], -tangent[:, 0]])  # right-hand side
    pts = base + offset * normal
    outward = np.array([(seg[:, 1] * 1.0).sum(), (-seg[:, 0] * 1.0).sum()])
    return pts, outward, length
