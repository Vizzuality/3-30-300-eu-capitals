"""Water as the map draws it: the whole water body (Shallows colour),
open water 6 m from the shore, two ripple lines 13 and 24 m in, the coast line, and short hatch
marks on water 30 m or more from the shore (11 m long, on a staggered 24 x 12 m grid anchored to
the projection's origin so they line up across tiles and releases)."""

from __future__ import annotations

import math

import numpy as np
import shapely
from shapely.prepared import prep


def hatch_marks(poly, sx: float = 24.0, sy: float = 12.0, length: float = 11.0) -> list:
    if poly.is_empty:
        return []
    out = []
    for part in shapely.get_parts(poly):
        pp = prep(part)
        x0, y0, x1, y1 = part.bounds
        for y in np.arange(math.floor(y0 / sy) * sy + sy / 2, y1, sy):
            row = int(round((y - sy / 2) / sy))
            off = (row % 2) * sx / 2 + (row % 3) * sx * 0.13
            xs = np.arange(math.floor(x0 / sx) * sx + off - sx, x1, sx)
            lines = shapely.linestrings(
                np.stack(
                    [
                        np.column_stack([xs, np.full_like(xs, y)]),
                        np.column_stack([xs + length, np.full_like(xs, y)]),
                    ],
                    axis=1,
                )
            )
            out.extend(line for line in lines if pp.contains(line))
    return out


def shore_lines(water, area, offsets=(13.0, 24.0)):
    """Coast (kind 0) and ripples (kinds 1, 2): the water's edge and the edges ``offsets`` m in.
    The analysis area's own edge is not a shore."""
    edge = area.boundary
    coast = water.boundary.difference(edge.buffer(1))
    out = [(0, coast)]
    for kind, d in enumerate(offsets, start=1):
        rip = water.buffer(-d, join_style="round").boundary.difference(edge.buffer(d + 1))
        out.append((kind, rip))
    return out
