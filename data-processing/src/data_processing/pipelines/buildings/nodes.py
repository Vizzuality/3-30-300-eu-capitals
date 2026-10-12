"""Buildings and facades: the results per building, and for the 3 trees rule per facade.

For every building of the city (its representative point is in the city):

1. Facades: walls split at corners, walls under 3 m dropped, walls shared with a neighbouring
   building dropped (more than half of their points, 1 m outside the wall, fall in another
   building), each with its compass orientation.
2. Residents: the building's residents (common step 4), shared between its facades by length.
3. 3 trees per facade: a point every 5 m, 1 m outside the wall; a tree counts if it is within 30 m
   of one of them and the straight line crosses no building. 3 different trees or more: passes.
4. 3 trees per building: passes if MORE than half of its residents live behind passing facades
   (residents follow facade length, so this is the share of facade length that passes).
5. 30 % canopy per building: canopy share of the land within 500 m of the building's centre.
6. 300 m per building: straight line from the building to the nearest path (not across water, up
   to 100 m) plus the walk from there; 0 if the building touches a green space.
7. Rules met: 0 to 3.
"""

from __future__ import annotations

import logging
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from scipy.spatial import cKDTree

from data_processing.core.facades import polygon_walls, wall_samples
from data_processing.core.geo import compass8, true_bearing
from data_processing.core.network import Network, first_dry
from data_processing.core.visibility import Scene, visible_pairs
from data_processing.pipelines.rule30.nodes import passes_threshold, point_canopy
from data_processing.pipelines.rule300.nodes import WATER_MARGIN_M, points_for

log = logging.getLogger(__name__)


# ------------------------------------------------------------------ 1–2. facades
def make_facades(buildings: gpd.GeoDataFrame, method: dict) -> tuple:
    t0 = time.time()
    f = method["facades"]
    geoms = buildings.geometry.values
    scored = np.nonzero(buildings["scored"].values)[0]
    rows, sx, sy, sfac = [], [], [], []
    for bi in scored:
        for wall in polygon_walls(
            geoms[bi], f["simplify_m"], f["corner_deg"], f["min_length_m"], f["round_piece_m"]
        ):
            pts, outward, length = wall_samples(wall, f["sample_step_m"], f["sample_offset_m"])
            k = len(rows)
            rows.append((bi, length, outward[0], outward[1], wall))
            sx.append(pts[:, 0])
            sy.append(pts[:, 1])
            sfac.append(np.full(len(pts), k, np.int64))
    sx, sy, sfac = np.concatenate(sx), np.concatenate(sy), np.concatenate(sfac)
    bidx = np.array([r[0] for r in rows], np.int64)

    # shared walls: their outside points fall in another building
    tree = shapely.STRtree(geoms)
    pi, gi = tree.query(shapely.points(sx, sy), predicate="within")
    other = gi != bidx[sfac[pi]]
    in_other = np.zeros(len(sx), bool)
    in_other[pi[other]] = True
    share_in_other = np.bincount(sfac, weights=in_other, minlength=len(rows)) / np.bincount(
        sfac, minlength=len(rows)
    )
    shared = share_in_other > f["shared_share"]

    walls = [r[4] for r in rows]
    mid = np.array([w[len(w) // 2] if len(w) > 2 else w.mean(axis=0) for w in walls])
    ox = np.array([r[2] for r in rows])
    oy = np.array([r[3] for r in rows])
    bearing = true_bearing(mid[:, 0], mid[:, 1], ox, oy, method["crs"])
    fac = gpd.GeoDataFrame(
        {
            "b": buildings["id"].values[bidx],
            "bidx": bidx,
            "length": np.array([r[1] for r in rows]),
            "bearing": np.round(bearing).astype(np.int16) % 360,
            "orient": compass8(bearing),
            "shared": shared,
        },
        geometry=[shapely.LineString(w) for w in walls],
        crs=method["crs"],
    )
    stats = {
        "walls": len(fac),
        "shared_walls_dropped": int(shared.sum()),
        "facades": int((~shared).sum()),
        "scored_buildings": len(scored),
        "scored_buildings_without_facade": int(
            len(scored) - fac.loc[~fac.shared, "bidx"].nunique()
        ),
    }
    keep = ~shared
    new_index = -np.ones(len(fac), np.int64)
    new_index[keep] = np.arange(keep.sum())
    fac = fac[keep].reset_index(drop=True)
    fac.insert(0, "sid", np.arange(1, len(fac) + 1, dtype=np.int32))
    sk = keep[sfac]
    samples = pd.DataFrame({"x": sx[sk], "y": sy[sk], "f": new_index[sfac[sk]]})
    stats["samples"] = len(samples)
    stats["seconds"] = round(time.time() - t0)
    log.info(
        "facades: %d (%d shared walls dropped), %d points",
        len(fac),
        stats["shared_walls_dropped"],
        len(samples),
    )
    return fac, samples, stats


# ------------------------------------------------------------------ 3. trees per facade
def facade_trees(
    facades: gpd.GeoDataFrame,
    facade_samples: pd.DataFrame,
    trees: pd.DataFrame,
    buildings: gpd.GeoDataFrame,
    grid: dict,
    method: dict,
) -> tuple:
    t0 = time.time()
    p = method["rule3"]
    g = grid
    scene = Scene(
        trees["x"].values,
        trees["y"].values,
        buildings.geometry.values,
        g["x0"],
        g["y1"],
        g["height"],
        g["width"],
        g["res"],
        p["edge_bucket_m"],
    )
    viewer, tree, dist = visible_pairs(
        scene, facade_samples["x"].values, facade_samples["y"].values, p["view_radius_m"]
    )
    seen = pd.DataFrame(
        {
            "f": facade_samples["f"].values[viewer],
            "tree": tree,
            "dist": dist,
            "sx": facade_samples["x"].values[viewer],
            "sy": facade_samples["y"].values[viewer],
        }
    )
    # each tree once per facade, from the facade point nearest to it
    seen = seen.sort_values(["f", "tree", "dist"]).drop_duplicates(["f", "tree"])
    n = np.bincount(seen["f"].values, minlength=len(facades))
    facades = facades.copy()
    facades["n"] = n.astype(np.int32)
    facades["ok"] = (n >= p["min_trees"]).astype(np.int8)
    seen = seen.assign(sid=facades["sid"].values[seen["f"].values]).drop(columns="f")
    stats = {
        "facades": len(facades),
        "facades_passing": int(facades["ok"].sum()),
        "pairs_seen": len(seen),
        "seconds": round(time.time() - t0),
    }
    log.info(
        "facades: %d of %d see 3 trees (%.0f s)",
        stats["facades_passing"],
        len(facades),
        time.time() - t0,
    )
    return facades, seen.reset_index(drop=True), stats


# ------------------------------------------------------------------ 6. walk per building
def _densify_rings(geoms, step: float):
    """Outline points every ``step`` m (all rings) and the index of their geometry."""
    parts, src = shapely.get_parts(geoms, return_index=True)
    rings, ridx = shapely.get_rings(parts, return_index=True)
    xy, idx = shapely.get_coordinates(shapely.segmentize(rings, step), return_index=True)
    return xy, src[ridx[idx]]


def building_walks(
    buildings: gpd.GeoDataFrame,
    walk: dict,
    intervals: pd.DataFrame,
    parks: gpd.GeoDataFrame,
    water_2m: dict,
    method: dict,
) -> pd.DataFrame:
    """Walking distance, park and route of every scored building."""
    p = method["rule300"]
    net, pts = points_for(walk, intervals, method)
    scored = np.nonzero(buildings["scored"].values)[0]
    geoms = buildings.geometry.values[scored]

    # touching a green space: distance 0
    ptree = shapely.STRtree(parks.geometry.values)
    bi, pk = ptree.query(geoms, predicate="intersects")
    touch_park = np.full(len(scored), -1, np.int64)
    touch_park[bi] = parks["pid"].values[pk]

    # nearest path point from the outline (densified every 2 m), not across water
    xy, owner = _densify_rings(geoms, 2.0)
    kd = cKDTree(np.column_stack([pts.x, pts.y]))
    d, idx = kd.query(xy, k=3, distance_upper_bound=p["max_snap_m"], workers=-1)
    pair_v = np.repeat(np.arange(len(xy)), 3)
    pair_p = idx.ravel()
    pair_d = d.ravel()
    ok = np.isfinite(pair_d)
    pair_v, pair_p, pair_d = pair_v[ok], pair_p[ok], pair_d[ok]
    pair_b = owner[pair_v]
    order = np.lexsort((pair_d, pair_b))
    pair_v, pair_p, pair_d, pair_b = pair_v[order], pair_p[order], pair_d[order], pair_b[order]
    # per building, try its candidates in order of distance until one does not cross water
    starts = np.searchsorted(pair_b, np.arange(len(scored) + 1))
    counts = np.diff(starts)
    t = water_2m["transform"]
    best = np.full(len(scored), -1, np.int64)
    for c in range(24):
        rows = np.nonzero((best < 0) & (counts > c))[0]
        if not len(rows):
            break
        k = starts[rows] + c
        got = first_dry(
            xy[pair_v[k], 0],
            xy[pair_v[k], 1],
            pair_p[k][:, None],
            pair_d[k][:, None],
            pts.x,
            pts.y,
            water_2m["array"],
            t.c,
            t.f,
            t.a,
            WATER_MARGIN_M,
        )
        best[rows[got >= 0]] = k[got >= 0]
    has = best >= 0
    point = np.full(len(scored), -1, np.int64)
    point[has] = pair_p[best[has]]
    start_xy = np.full((len(scored), 2), np.nan)
    start_xy[has] = xy[pair_v[best[has]]]
    straight = np.full(len(scored), np.inf)
    straight[has] = pair_d[best[has]]
    walk_m = straight + np.where(has, pts.dist[np.maximum(point, 0)], np.inf)
    walk_m[touch_park >= 0] = 0.0

    routes, park_of = route_lines(net, walk, intervals, pts, point, start_xy, walk_m, parks)
    park = np.where(touch_park >= 0, touch_park, park_of)
    return pd.DataFrame(
        {
            "id": buildings["id"].values[scored],
            "walk_m": walk_m,
            "park": park,
            "route": routes,
        }
    )


def route_lines(
    net: Network,
    walk: dict,
    iv: pd.DataFrame,
    pts,
    point,
    start_xy,
    walk_m,
    parks: gpd.GeoDataFrame,
):
    """Route of each building (list of (x, y), or None) and the green space reached."""
    pred, node_src = walk["pred"], walk["node_src"]
    n = net.n
    nx_, ny_ = net.node_x, net.node_y
    park_geom = dict(zip(parks["pid"].values, parks.geometry.values, strict=True))
    routes, park_of = [], np.full(len(point), -1, np.int64)
    seg_iv = iv.groupby("seg")
    for b in range(len(point)):
        p = point[b]
        if p < 0 or not np.isfinite(walk_m[b]) or walk_m[b] == 0:
            routes.append(None)
            continue
        line = [tuple(start_xy[b]), (pts.x[p], pts.y[p])]
        if pts.node[p] >= 0:
            node = int(pts.node[p])
            row = None
        else:
            seg, s, via = int(pts.seg[p]), float(pts.s[p]), int(pts.via[p])
            if via == 0:
                cand = seg_iv.get_group(seg)
                dd = np.maximum(np.maximum(cand["s0"].values - s, s - cand["s1"].values), 0)
                r = cand.iloc[int(np.argmin(dd))]
                se = min(max(s, r["s0"]), r["s1"])
                t = se / net.length[seg]
                u, v = net.u[seg], net.v[seg]
                line.append((nx_[u] + t * (nx_[v] - nx_[u]), ny_[u] + t * (ny_[v] - ny_[u])))
                routes.append(line)
                park_of[b] = int(r["park"])
                _to_park(line, park_geom.get(park_of[b]))
                continue
            node = int(net.u[seg] if via == 1 else net.v[seg])
            row = None
        for _ in range(100_000):
            line.append((nx_[node], ny_[node]))
            q = pred[node]
            if q == n or q < 0:
                row = node_src[node]
                break
            node = int(q)
        if row is None or row < 0:
            routes.append(line)
            continue
        r = iv.iloc[int(row)]
        seg = int(r["seg"])
        u, v = net.u[seg], net.v[seg]
        se = r["s0"] if node == u else r["s1"]
        t = se / net.length[seg]
        line.append((nx_[u] + t * (nx_[v] - nx_[u]), ny_[u] + t * (ny_[v] - ny_[u])))
        park_of[b] = int(r["park"])
        _to_park(line, park_geom.get(park_of[b]))
        routes.append(line)
    return routes, park_of


def _to_park(line: list, park) -> None:
    """End the route on the green space itself (the last few metres, at most 20 m)."""
    if park is None:
        return
    end = shapely.Point(line[-1])
    if park.covers(end):
        return
    near = shapely.get_coordinates(shapely.shortest_line(park, end))[0]
    line.append((float(near[0]), float(near[1])))


# ------------------------------------------------------------------ 4–7. rules per building
def building_rules(
    buildings: gpd.GeoDataFrame,
    building_residents: pd.DataFrame,
    facades: gpd.GeoDataFrame,
    canopy_px: dict,
    land_px: dict,
    grid: dict,
    walk: dict,
    walk_sources: pd.DataFrame,
    parks: gpd.GeoDataFrame,
    water_2m: dict,
    method: dict,
) -> tuple:
    t0 = time.time()
    res = building_residents.set_index("id")["residents"]
    out = pd.DataFrame(
        {
            "id": buildings["id"].values,
            "scored": buildings["scored"].values,
            "residents": res.reindex(buildings["id"].values).fillna(0).values,
        }
    )
    # 3 trees: share of facade length (= residents) behind passing facades
    tot = facades.groupby("b")["length"].sum()
    ok = facades[facades["ok"] == 1].groupby("b")["length"].sum()
    share3 = (ok.reindex(out["id"]).fillna(0) / tot.reindex(out["id"])).fillna(0.0).values
    out["share3"] = np.where(out["scored"], share3, 0.0)
    out["r3"] = (out["share3"] > method["facades"]["building_share"]) & out["scored"]
    out["facades"] = facades.groupby("b").size().reindex(out["id"]).fillna(0).astype(int).values

    # 30 % canopy within 500 m of the building's centre
    c, n = point_canopy(
        buildings["cx"].values,
        buildings["cy"].values,
        canopy_px,
        land_px,
        grid,
        method["rule30"]["radius_m"],
    )
    with np.errstate(divide="ignore", invalid="ignore"):
        out["canopy"] = np.where(n > 0, c / n, 0.0)
    out["r30"] = passes_threshold(c, n, method["rule30"]["threshold"]) & out["scored"]

    # 300 m walk
    walks = building_walks(buildings, walk, walk_sources, parks, water_2m, method)
    out = out.merge(walks, on="id", how="left")
    out["walk_m"] = out["walk_m"].astype(float)
    out["r300"] = (out["walk_m"] <= method["rule300"]["threshold_m"]) & out["scored"]
    out["park"] = out["park"].fillna(-1).astype(np.int64)
    out["score"] = out["r3"].astype(int) + out["r30"].astype(int) + out["r300"].astype(int)
    for k in ("r3", "r30", "r300"):
        out[k] = out[k].astype(np.int8)
    routes = out.pop("route")
    s = out[out["scored"]]
    w = s["residents"].values
    stats = {
        "scored_buildings": int(len(s)),
        "residents_in_scored_buildings": float(w.sum()),
        "share_residents_by_buildings": {
            "met": [round(float(w[s["score"] == k].sum() / w.sum()), 4) for k in range(4)],
            "rules": {
                r: round(float(w[s[f"r{r}"] == 1].sum() / w.sum()), 4) for r in ("3", "30", "300")
            },
        },
        "buildings_touching_a_green_space": int((s["walk_m"] == 0).sum()),
        "buildings_without_path_or_park": int((~np.isfinite(s["walk_m"])).sum()),
        "seconds": round(time.time() - t0),
    }
    route_df = pd.DataFrame({"id": out["id"].values, "route": routes.values})
    route_df = route_df[route_df["route"].notna()]
    route_gdf = gpd.GeoDataFrame(
        {"id": route_df["id"].values},
        geometry=[shapely.LineString(r) for r in route_df["route"]],
        crs=method["crs"],
    )
    log.info("buildings: %d scored (%.0f s)", len(s), time.time() - t0)
    return out, route_gdf, stats
