"""Lines of sight between viewers and trees, blocked by building footprints (exact, 2-D).

A straight line from a viewer to a tree is blocked when it crosses an edge of any building
footprint (outer or inner ring), except the edges of the viewer's own building when one is given
(a 10 m square inside a building looks out of it, as from its windows). Buildings
block whatever their height; water and trees never block.

Building edges are hashed into square buckets; a line only tests the edges of the buckets its
bounding box overlaps. Trees are binned by 10 m square of the shared grid.
"""

from __future__ import annotations

import math

import numpy as np
import shapely
from numba import njit, prange


# ------------------------------------------------------------------ inputs
def building_edges(geoms) -> tuple[np.ndarray, np.ndarray]:
    """Edges of every ring of every polygon: (n, 4) [x0, y0, x1, y1] and the polygon index."""
    rings, ring_src = [], []
    parts, part_src = shapely.get_parts(np.asarray(geoms), return_index=True)
    ext = shapely.get_exterior_ring(parts)
    rings.append(ext)
    ring_src.append(part_src)
    n_int = shapely.get_num_interior_rings(parts)
    if n_int.max(initial=0) > 0:
        for k in range(int(n_int.max())):
            has = n_int > k
            rings.append(shapely.get_interior_ring(parts[has], k))
            ring_src.append(part_src[has])
    rings = np.concatenate(rings)
    ring_src = np.concatenate(ring_src)
    coords, idx = shapely.get_coordinates(rings, return_index=True)
    same = idx[1:] == idx[:-1]
    a = coords[:-1][same]
    b = coords[1:][same]
    src = ring_src[idx[:-1][same]]
    keep = np.any(a != b, axis=1)
    return np.hstack([a[keep], b[keep]]).astype(np.float64), src[keep].astype(np.int32)


def bucket_edges(edges: np.ndarray, x0: float, y1: float, size: float, nrows: int, ncols: int):
    """CSR of edge indices per bucket (row-major, rows from north)."""
    ex0 = np.minimum(edges[:, 0], edges[:, 2])
    ex1 = np.maximum(edges[:, 0], edges[:, 2])
    ey0 = np.minimum(edges[:, 1], edges[:, 3])
    ey1 = np.maximum(edges[:, 1], edges[:, 3])
    j0 = np.clip(np.floor((ex0 - x0) / size).astype(np.int64), 0, ncols - 1)
    j1 = np.clip(np.floor((ex1 - x0) / size).astype(np.int64), 0, ncols - 1)
    i0 = np.clip(np.floor((y1 - ey1) / size).astype(np.int64), 0, nrows - 1)
    i1 = np.clip(np.floor((y1 - ey0) / size).astype(np.int64), 0, nrows - 1)
    ni, nj = i1 - i0 + 1, j1 - j0 + 1
    cnt = ni * nj
    e = np.repeat(np.arange(len(edges)), cnt)
    start = np.repeat(np.cumsum(cnt) - cnt, cnt)
    k = np.arange(len(e)) - start
    bid = (i0[e] + k // nj[e]) * ncols + (j0[e] + k % nj[e])
    order = np.argsort(bid, kind="stable")
    bid, e = bid[order], e[order]
    bstart = np.searchsorted(bid, np.arange(nrows * ncols + 1)).astype(np.int64)
    return bstart, e.astype(np.int64)


def bin_points(x, y, x0: float, y1: float, res: float, nrows: int, ncols: int):
    """Points sorted by grid square, with the CSR start of each square. Points outside the grid
    are dropped. Returns (order, start)."""
    j = np.floor((x - x0) / res).astype(np.int64)
    i = np.floor((y1 - y) / res).astype(np.int64)
    inside = (i >= 0) & (i < nrows) & (j >= 0) & (j < ncols)
    idx = np.nonzero(inside)[0]
    cid = i[idx] * ncols + j[idx]
    order = np.argsort(cid, kind="stable")
    idx, cid = idx[order], cid[order]
    start = np.searchsorted(cid, np.arange(nrows * ncols + 1)).astype(np.int64)
    return idx, start


class Scene:
    """Trees and building edges ready for the kernels."""

    def __init__(self, tree_x, tree_y, building_geoms, x0, y1, nrows, ncols, res, bucket):
        self.x0, self.y1, self.nrows, self.ncols, self.res = x0, y1, nrows, ncols, res
        order, start = bin_points(tree_x, tree_y, x0, y1, res, nrows, ncols)
        self.tree_id = order.astype(np.int64)
        self.tx = np.asarray(tree_x, np.float64)[order]
        self.ty = np.asarray(tree_y, np.float64)[order]
        self.tstart = start
        self.edges, self.eb = building_edges(building_geoms)
        self.bsize = float(bucket)
        self.bnrows = math.ceil(nrows * res / bucket)
        self.bncols = math.ceil(ncols * res / bucket)
        self.bstart, self.bedges = bucket_edges(
            self.edges, x0, y1, bucket, self.bnrows, self.bncols
        )

    def args(self):
        return (
            self.tx,
            self.ty,
            self.tstart,
            self.x0,
            self.y1,
            self.res,
            self.nrows,
            self.ncols,
            self.edges,
            self.eb,
            self.bstart,
            self.bedges,
            self.bsize,
            self.bnrows,
            self.bncols,
        )


# ------------------------------------------------------------------ kernels
@njit(cache=True, inline="always")
def _orient(ax, ay, bx, by, cx, cy):
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


@njit(cache=True)
def segments_intersect(px, py, qx, qy, ax, ay, bx, by):
    """True if segment pq and segment ab share at least one point."""
    if max(px, qx) < min(ax, bx) or max(ax, bx) < min(px, qx):
        return False
    if max(py, qy) < min(ay, by) or max(ay, by) < min(py, qy):
        return False
    o1 = _orient(px, py, qx, qy, ax, ay)
    o2 = _orient(px, py, qx, qy, bx, by)
    o3 = _orient(ax, ay, bx, by, px, py)
    o4 = _orient(ax, ay, bx, by, qx, qy)
    return (o1 * o2 <= 0.0) and (o3 * o4 <= 0.0)


@njit(cache=True)
def line_blocked(
    px, py, qx, qy, own1, own2, edges, eb, bstart, bedges, x0, y1, bsize, bnrows, bncols
):
    j0 = int(math.floor((min(px, qx) - x0) / bsize))
    j1 = int(math.floor((max(px, qx) - x0) / bsize))
    i0 = int(math.floor((y1 - max(py, qy)) / bsize))
    i1 = int(math.floor((y1 - min(py, qy)) / bsize))
    j0, j1 = max(j0, 0), min(j1, bncols - 1)
    i0, i1 = max(i0, 0), min(i1, bnrows - 1)
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            b = i * bncols + j
            for k in range(bstart[b], bstart[b + 1]):
                e = bedges[k]
                if eb[e] == own1 or eb[e] == own2:
                    continue
                if segments_intersect(
                    px, py, qx, qy, edges[e, 0], edges[e, 1], edges[e, 2], edges[e, 3]
                ):
                    return True
    return False


@njit(cache=True, parallel=True)
def count_visible(
    vx,
    vy,
    own1,
    own2,
    radius,
    cap,
    tx,
    ty,
    tstart,
    x0,
    y1,
    res,
    nrows,
    ncols,
    edges,
    eb,
    bstart,
    bedges,
    bsize,
    bnrows,
    bncols,
):
    """Number of trees within ``radius`` seen from each viewer, stopping at ``cap`` (0 = no cap)."""
    n = len(vx)
    out = np.zeros(n, np.int32)
    k = int(math.ceil(radius / res)) + 1
    r2 = radius * radius
    for v in prange(n):
        x, y = vx[v], vy[v]
        ci = int(math.floor((y1 - y) / res))
        cj = int(math.floor((x - x0) / res))
        c = 0
        done = False
        for i in range(max(ci - k, 0), min(ci + k, nrows - 1) + 1):
            if done:
                break
            for j in range(max(cj - k, 0), min(cj + k, ncols - 1) + 1):
                if done:
                    break
                cell = i * ncols + j
                for t in range(tstart[cell], tstart[cell + 1]):
                    dx, dy = tx[t] - x, ty[t] - y
                    if dx * dx + dy * dy > r2:
                        continue
                    if not line_blocked(
                        x,
                        y,
                        tx[t],
                        ty[t],
                        own1[v],
                        own2[v],
                        edges,
                        eb,
                        bstart,
                        bedges,
                        x0,
                        y1,
                        bsize,
                        bnrows,
                        bncols,
                    ):
                        c += 1
                        if cap > 0 and c >= cap:
                            done = True
                            break
        out[v] = c
    return out


@njit(cache=True, parallel=True)
def fill_visible(
    vx,
    vy,
    own1,
    own2,
    radius,
    start,
    tx,
    ty,
    tstart,
    x0,
    y1,
    res,
    nrows,
    ncols,
    edges,
    eb,
    bstart,
    bedges,
    bsize,
    bnrows,
    bncols,
):
    """Second pass of ``count_visible`` (no cap): sorted-tree indices seen from each viewer, in
    the CSR given by ``start``, and their distances."""
    total = start[len(vx)]
    trees = np.empty(total, np.int64)
    dist = np.empty(total, np.float32)
    k = int(math.ceil(radius / res)) + 1
    r2 = radius * radius
    for v in prange(len(vx)):
        x, y = vx[v], vy[v]
        ci = int(math.floor((y1 - y) / res))
        cj = int(math.floor((x - x0) / res))
        p = start[v]
        for i in range(max(ci - k, 0), min(ci + k, nrows - 1) + 1):
            for j in range(max(cj - k, 0), min(cj + k, ncols - 1) + 1):
                cell = i * ncols + j
                for t in range(tstart[cell], tstart[cell + 1]):
                    dx, dy = tx[t] - x, ty[t] - y
                    d2 = dx * dx + dy * dy
                    if d2 > r2:
                        continue
                    if not line_blocked(
                        x,
                        y,
                        tx[t],
                        ty[t],
                        own1[v],
                        own2[v],
                        edges,
                        eb,
                        bstart,
                        bedges,
                        x0,
                        y1,
                        bsize,
                        bnrows,
                        bncols,
                    ):
                        trees[p] = t
                        dist[p] = math.sqrt(d2)
                        p += 1
    return trees, dist


def visible_counts(scene: Scene, vx, vy, own1=None, own2=None, radius=30.0, cap=0):
    n = len(vx)
    own1 = np.full(n, -2, np.int32) if own1 is None else np.asarray(own1, np.int32)
    own2 = np.full(n, -2, np.int32) if own2 is None else np.asarray(own2, np.int32)
    return count_visible(
        np.asarray(vx, np.float64),
        np.asarray(vy, np.float64),
        own1,
        own2,
        float(radius),
        int(cap),
        *scene.args(),
    )


def visible_pairs(scene: Scene, vx, vy, radius=30.0):
    """(viewer index, tree id, distance) of every tree seen from each viewer (no own building)."""
    vx = np.asarray(vx, np.float64)
    vy = np.asarray(vy, np.float64)
    n = len(vx)
    none = np.full(n, -2, np.int32)
    counts = count_visible(vx, vy, none, none, float(radius), 0, *scene.args())
    start = np.zeros(n + 1, np.int64)
    np.cumsum(counts, out=start[1:])
    trees, dist = fill_visible(vx, vy, none, none, float(radius), start, *scene.args())
    viewer = np.repeat(np.arange(n), counts)
    return viewer, scene.tree_id[trees], dist
