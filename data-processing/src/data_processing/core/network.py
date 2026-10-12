"""The walking network and walking distances to the nearest green space (the 300 m rule).

The network is built from OpenStreetMap ways: every pair of consecutive nodes of a walkable way is
a straight segment, and ways meet where they share a node. Water is crossed only where a way
crosses it (bridges); ferries have no highway tag and are not part of it.

Walking distance is measured from every point where a path comes within 20 m of a green space
(those stretches of path are at distance 0), with one Dijkstra run from a virtual source linked to
the ends of every such stretch.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import shapely
from numba import njit, prange
from scipy import sparse
from scipy.sparse.csgraph import dijkstra

from data_processing.core.geo import transformer


def is_walkable(tags: dict, rule: dict) -> bool:
    hw = tags.get("highway")
    if hw is None or hw in rule["walk_excluded_highway"]:
        return False
    allowed = any(tags.get(k) in v for k, v in rule["walk_allowed_despite_access"].items())
    for key, values in rule["walk_excluded"].items():
        if tags.get(key) in values:
            if key == "access" and allowed:
                continue
            return False
    return True


def read_ways(path: str) -> list[dict]:
    """Ways written by ``read_osm`` (one JSON object per line: id, tags, nodes, geometry)."""
    with Path(path).open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


@dataclass
class Network:
    node_x: np.ndarray  # float64, EPSG:3035
    node_y: np.ndarray
    u: np.ndarray  # int64 node index of each segment
    v: np.ndarray
    length: np.ndarray  # float64
    way: np.ndarray  # OSM way id of each segment

    @property
    def n(self) -> int:
        return len(self.node_x)

    def to_npz(self) -> dict:
        return {k: getattr(self, k) for k in ("node_x", "node_y", "u", "v", "length", "way")}

    @classmethod
    def from_npz(cls, d: dict) -> Network:
        return cls(**{k: d[k] for k in ("node_x", "node_y", "u", "v", "length", "way")})

    def segments(self) -> np.ndarray:
        return np.column_stack(
            [self.node_x[self.u], self.node_y[self.u], self.node_x[self.v], self.node_y[self.v]]
        )


def build_network(ways: list[dict], rule: dict, crs: str) -> Network:
    node_ids, lon, lat, us, vs, wid = [], [], [], [], [], []
    for w in ways:
        if not is_walkable(w.get("tags", {}), rule):
            continue
        nodes, geom = w.get("nodes"), w["geometry"]
        if not nodes or len(nodes) != len(geom):
            continue
        for k, (nid, p) in enumerate(zip(nodes, geom, strict=True)):
            if p is None:
                continue
            node_ids.append(nid)
            lon.append(p["lon"])
            lat.append(p["lat"])
            if k:
                us.append(nodes[k - 1])
                vs.append(nid)
                wid.append(w["id"])
    if not us:
        raise ValueError("no walkable way")
    ids = np.asarray(node_ids, np.int64)
    uniq, first = np.unique(ids, return_index=True)
    x, y = transformer("EPSG:4326", crs).transform(np.asarray(lon)[first], np.asarray(lat)[first])
    u = np.searchsorted(uniq, np.asarray(us, np.int64))
    v = np.searchsorted(uniq, np.asarray(vs, np.int64))
    x, y = np.asarray(x), np.asarray(y)
    length = np.hypot(x[u] - x[v], y[u] - y[v])
    keep = u != v
    return Network(x, y, u[keep], v[keep], length[keep], np.asarray(wid, np.int64)[keep])


# ------------------------------------------------------------------ sources
def source_intervals(net: Network, fringe_parts, fringe_park: np.ndarray) -> pd.DataFrame:
    """Stretches of segments inside the fringe (within 20 m of a green space, on the park's side
    of any water): segment, start and end (m from u), and the park reached."""
    seg = shapely.linestrings(net.segments().reshape(-1, 2, 2))
    tree = shapely.STRtree(fringe_parts)
    si, fi = tree.query(seg, predicate="intersects")
    if len(si) == 0:
        return pd.DataFrame({"seg": [], "s0": [], "s1": [], "park": []})
    inter = shapely.intersection(seg[si], fringe_parts[fi])
    parts, src = shapely.get_parts(inter, return_index=True)
    keep = ~shapely.is_empty(parts)
    parts, src = parts[keep], src[keep]
    coords, cidx = shapely.get_coordinates(parts, return_index=True)
    s = shapely.line_locate_point(seg[si[src[cidx]]], shapely.points(coords))
    df = pd.DataFrame({"part": cidx, "s": s}).groupby("part").s.agg(["min", "max"])
    out = pd.DataFrame(
        {
            "seg": si[src[df.index.values]],
            "s0": df["min"].values,
            "s1": df["max"].values,
            "park": fringe_park[fi[src[df.index.values]]],
        }
    )
    return out


@dataclass
class Distances:
    node: np.ndarray  # walking distance at each node (inf if no green space is reachable)
    pred: np.ndarray  # predecessor towards the green space (-1: none, n: starts at a source)
    node_src: np.ndarray  # for nodes linked to the virtual source: the interval row used


def walk_distances(net: Network, iv: pd.DataFrame) -> Distances:
    n = net.n
    seg = iv["seg"].values
    off_u = iv["s0"].values  # from u to the start of the stretch
    off_v = net.length[seg] - iv["s1"].values  # from v to its end
    cand = (
        pd.DataFrame(
            {
                "node": np.concatenate([net.u[seg], net.v[seg]]),
                "w": np.concatenate([off_u, off_v]),
                "row": np.concatenate([np.arange(len(iv)), np.arange(len(iv))]),
            }
        )
        .sort_values("w", kind="stable")
        .drop_duplicates("node")
    )
    eps = 1e-3
    rows = np.concatenate([net.u, np.full(len(cand), n)])
    cols = np.concatenate([net.v, cand["node"].values])
    w = np.maximum(np.concatenate([net.length, cand["w"].values]), eps)
    a, b = np.minimum(rows, cols), np.maximum(rows, cols)
    df = pd.DataFrame({"a": a, "b": b, "w": w}).groupby(["a", "b"], sort=False).w.min()
    df = df.reset_index()
    m = sparse.csr_matrix((df.w.values, (df.a.values, df.b.values)), shape=(n + 1, n + 1))
    d, pred = dijkstra(m, directed=False, indices=n, return_predecessors=True)
    d = d[:n]
    d[d < 0.01] = 0.0
    node_src = np.full(n, -1, np.int64)
    node_src[cand["node"].values] = cand["row"].values
    pred = pred[:n].astype(np.int64)
    pred[pred < 0] = -1
    return Distances(d, pred, node_src)


# ------------------------------------------------------------------ points along the network
@dataclass
class NetworkPoints:
    x: np.ndarray
    y: np.ndarray
    dist: np.ndarray  # walking distance from this point
    seg: np.ndarray  # segment (-1 for nodes)
    s: np.ndarray  # position along the segment, m from u
    node: np.ndarray  # node index (-1 for samples)
    via: np.ndarray  # 0: at a source stretch, 1: through u, 2: through v (samples only)


def network_points(net: Network, dist: Distances, iv: pd.DataFrame, step: float) -> NetworkPoints:
    L = net.length
    nsamp = np.maximum(np.floor(L / step).astype(np.int64), 1)
    sid = np.repeat(np.arange(len(L)), nsamp)
    start = np.repeat(np.cumsum(nsamp) - nsamp, nsamp)
    s = (np.arange(len(sid)) - start + 0.5) * (L[sid] / nsamp[sid])
    du = dist.node[net.u[sid]] + s
    dv = dist.node[net.v[sid]] + L[sid] - s
    d = np.minimum(du, dv)
    via = np.where(du <= dv, 1, 2).astype(np.int8)
    # samples on a source segment: distance to the nearest stretch along it
    if len(iv):
        j = pd.DataFrame({"i": np.arange(len(sid)), "seg": sid, "s": s})
        j = j[np.isin(sid, iv["seg"].values)].merge(iv[["seg", "s0", "s1"]], on="seg", how="inner")
        j["d"] = np.maximum(np.maximum(j["s0"] - j["s"], j["s"] - j["s1"]), 0.0)
        best = j.groupby("i").d.min()
        better = best.values < d[best.index.values]
        idx = best.index.values[better]
        d[idx] = best.values[better]
        via[idx] = 0
    t = s / L[sid]
    x = net.node_x[net.u[sid]] + t * (net.node_x[net.v[sid]] - net.node_x[net.u[sid]])
    y = net.node_y[net.u[sid]] + t * (net.node_y[net.v[sid]] - net.node_y[net.u[sid]])
    nn = net.n
    return NetworkPoints(
        x=np.concatenate([net.node_x, x]),
        y=np.concatenate([net.node_y, y]),
        dist=np.concatenate([dist.node, d]),
        seg=np.concatenate([np.full(nn, -1, np.int64), sid]),
        s=np.concatenate([np.zeros(nn), s]),
        node=np.concatenate([np.arange(nn), np.full(len(sid), -1, np.int64)]),
        via=np.concatenate([np.zeros(nn, np.int8), via]),
    )


# ------------------------------------------------------------------ straight legs and water
@njit(cache=True, inline="always")
def _wet(x, y, water, x0, y1, res):
    j = int(math.floor((x - x0) / res))
    i = int(math.floor((y1 - y) / res))
    if i < 0 or j < 0 or i >= water.shape[0] or j >= water.shape[1]:
        return False
    return water[i, j] != 0


@njit(cache=True)
def crosses_water(ax, ay, bx, by, water, x0, y1, res, margin):
    """True if the straight line a–b passes over water (sampled every half pixel), ignoring
    ``margin`` metres at both ends (so a path along a quay is not cut off by its own pixel)."""
    d = math.hypot(bx - ax, by - ay)
    if d <= 2 * margin:
        return False
    n = int(math.ceil(d / (res / 2)))
    for k in range(n + 1):
        t = k / n
        if t * d < margin or (1 - t) * d < margin:
            continue
        if _wet(ax + t * (bx - ax), ay + t * (by - ay), water, x0, y1, res):
            return True
    return False


@njit(cache=True, parallel=True)
def first_dry(qx, qy, cand, cand_d, px, py, water, x0, y1, res, margin):
    """For each query point, the first candidate (ordered by distance) whose straight line does
    not cross water; -1 if none."""
    n, k = cand.shape
    out = np.full(n, -1, np.int64)
    for q in prange(n):
        for c in range(k):
            p = cand[q, c]
            if p < 0 or not np.isfinite(cand_d[q, c]):
                break
            if not crosses_water(qx[q], qy[q], px[p], py[p], water, x0, y1, res, margin):
                out[q] = p
                break
    return out
