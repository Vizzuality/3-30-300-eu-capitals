"""The overview's reference layers (``roads`` and ``places`` of ``context.pmtiles``): main roads as
whole, connected strokes, and district names, from the extracts the context reads (rules in
``core/orientation.py``, parameters in ``overview.yml`` › ``roads`` and ``places``)."""

from __future__ import annotations

import json
import logging
import math
import re
import time
from collections import Counter
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.transform
import shapely
from rasterio.windows import Window
from shapely.ops import linemerge

from data_processing.core import osm
from data_processing.core.geo import polygonal, reproject, transformer
from data_processing.core.labels import Measure
from data_processing.core.orientation import (
    CLASSES,
    RANK,
    Piece,
    choose_levels,
    first_zoom,
    geometric_dangling_ends,
    is_tunnel,
    label_point,
    merge_dual_carriageways,
    parallel_one_ways,
    road_class,
    thin_by_spacing,
)
from data_processing.core.overview import ground_m_per_px
from data_processing.pipelines.boundaries.nodes import (
    capital_config,
    context_regions,
    extract_file,
    extract_regions,
    read_land,
)
from data_processing.pipelines.context.nodes import _write

log = logging.getLogger(__name__)

PLACE_KINDS = {"suburb", "neighbourhood", "quarter"}


def _xy(lons, lats, crs):
    x, y = transformer("EPSG:4326", crs).transform(np.asarray(lons), np.asarray(lats))
    return np.column_stack([x, y])


def parse_tier(spec: str | None):
    """A tier as written in capitals.yml › places: ``admin_level=9`` or ``place=suburb``."""
    if not spec:
        return None
    key, value = spec.split("=")
    return ("admin", int(value)) if key == "admin_level" else ("place", value)


def population_within(points, population_source: dict, ghs_crs: str, radius_m: float) -> list[int]:
    """GHS-POP residents (its 100 m cells, whose centres lie) within ``radius_m`` of each point
    (EPSG:3035), from the capital's GHS-POP tiles."""
    if not points:
        return []
    to_ghs = transformer("EPSG:3035", ghs_crs)
    back = transformer(ghs_crs, "EPSG:3035")
    totals = np.zeros(len(points))
    reach = int(math.ceil(radius_m / 100)) + 2
    for path in population_source["tiles"].values():
        with rasterio.open(f"/vsizip/{path}/{Path(path).stem}.tif") as src:
            for k, (x, y) in enumerate(points):
                gx, gy = to_ghs.transform(x, y)
                row, col = src.index(gx, gy)
                r0, c0 = max(row - reach, 0), max(col - reach, 0)
                r1, c1 = min(row + reach + 1, src.height), min(col + reach + 1, src.width)
                if r0 >= r1 or c0 >= c1:
                    continue
                a = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(float)
                if src.nodata is not None:
                    a[a == src.nodata] = 0
                a[~np.isfinite(a) | (a < 0)] = 0
                rr, cc = np.mgrid[r0:r1, c0:c1]
                cx, cy = rasterio.transform.xy(src.transform, rr.ravel(), cc.ravel())
                ex, ey = back.transform(np.asarray(cx), np.asarray(cy))
                inside = np.hypot(np.asarray(ex) - x, np.asarray(ey) - y) <= radius_m
                totals[k] += float(a.ravel()[inside].sum())
    return [int(round(v)) for v in totals]


ONEWAY = ("yes", "-1", "1", "true")


def road_layer(
    ways: list[dict],
    city,
    box,
    land,
    lat: float,
    tile_zooms,
    rules: dict,
    crs: str = "EPSG:3035",
) -> tuple[list[dict], dict, list[Piece]]:
    """The ``roads`` features (EPSG:3035 in, longitude and latitude out) and their statistics:
    every way of the class rule (``road_class``, already applied to ``ways``), each dual
    carriageway as one line, the same over the whole context rectangle (``box``)."""
    shapely.prepare(box)
    shapely.prepare(city)
    edge = box.boundary
    pieces = [
        Piece(
            shapely.LineString(w["coords"]),
            w["cls"],
            w["tunnel"],
            first_zoom(w["cls"], rules["main_minzoom"], rules["minzoom"]),
            key=w["ref"] or w["name"],
            oneway=w["oneway"],
            name=w["name"],
        )
        for w in ways
    ]
    before = list(pieces)
    pieces, mst = merge_dual_carriageways(pieces, rules)

    # line ends that meet no other road (where a road goes on as a minor street, or really ends)
    def at_edge(pt):
        return edge.distance(pt) < rules["edge_m"]

    def in_city(pt):
        return bool(city.covers(pt))

    def outside_city(pt):
        return bool(box.covers(pt)) and not city.covers(pt)

    ends = {
        name: {
            "city": geometric_dangling_ends(ps, in_city, at_edge),
            "outside": geometric_dangling_ends(ps, outside_city, at_edge),
        }
        for name, ps in (("before_merge", before), ("after_merge", pieces))
    }
    # road drawn per km², inside the city and outside it (the rectangle's land)
    land_in = polygonal(land.intersection(box))
    out_area = polygonal(land_in.difference(city))
    lines = shapely.MultiLineString([p.geom for p in pieces])

    def density(area):
        return lines.intersection(area).length / 1000 / (area.area / 1e6) if area.area else 0.0

    groups: dict[tuple, list] = {}
    for p in pieces:
        groups.setdefault((p.cls, p.tunnel, p.minzoom, p.dual), []).append(p.geom)
    tol = rules["tolerance_px"] * ground_m_per_px(lat, rules["tolerance_zoom"])
    feats, segments = [], 0
    for (cls, tunnel, minzoom, dual_line), ls in sorted(
        groups.items(), key=lambda g: (RANK[g[0][0]], g[0][1:])
    ):
        merged = linemerge(shapely.MultiLineString(ls)).intersection(box)
        merged = shapely.simplify(merged, tol, preserve_topology=False)
        parts = [p for p in shapely.get_parts(merged) if p.geom_type == "LineString" and p.length]
        z0 = max(minzoom, tile_zooms[0])
        if not parts or z0 > tile_zooms[1]:
            continue
        segments += sum(len(p.coords) - 1 for p in parts)
        ll = reproject(shapely.MultiLineString(parts), crs, "EPSG:4326")
        feats.append(
            {
                "type": "Feature",
                "geometry": json.loads(shapely.to_geojson(ll)),
                "properties": {"class": cls, "tunnel": int(tunnel), "dual": int(dual_line)},
                "tippecanoe": {"layer": "roads", "minzoom": z0, "maxzoom": tile_zooms[1]},
            }
        )
    stats = {
        "ways": len(ways),
        "ways_by_class": dict(Counter(w["cls"] for w in ways)),
        "unconnected_ends": ends,
        "merge": {
            "pairs": mst.pairs,
            "short_pairs": mst.short_pairs,
            "km": round(mst.km_merged, 1),
            "snapped": mst.snapped,
            "median_crossings_dropped": mst.dropped_crossings,
            "centreline_ends_joined": mst.joined,
            "centreline_road_ends": len(mst.road_ends),
            "stubs_dropped": mst.stubs_dropped,
            "duplicate_centrelines": mst.duplicates,
        },
        "parallel_one_ways": parallel_one_ways(pieces, rules["merge_max_m"]),
        "unmerged": unmerged_duals(pieces, rules),
        "density_city": round(density(city), 2),
        "density_outside": round(density(out_area), 2),
        "segments": segments,
        "tolerance_m": round(tol, 2),
    }
    return feats, stats, pieces


def unmerged_duals(pieces: list[Piece], rules: dict, examples: int = 4) -> dict:
    """One-way lines left as they are although a one-way line of the same road runs the other
    way near them, by reason."""
    one = [p for p in pieces if p.oneway and p.key and not p.dual and p.geom.length >= 50]
    if not one:
        return {}
    tree = shapely.STRtree([p.geom for p in one])
    to_ll = transformer("EPSG:3035", "EPSG:4326")
    out: dict = {}
    for k, p in enumerate(one):
        mid = p.geom.interpolate(0.5, normalized=True)
        reason = None
        for m in tree.query(mid, predicate="dwithin", distance=150):
            q = one[m]
            if m == k or q.key != p.key:
                continue
            d = q.geom.distance(mid)
            if d > rules["merge_max_m"]:
                reason = f"over {rules['merge_max_m']} m apart"
            else:
                reason = f"side by side for under {rules['merge_min_m']} m"
            break
        if reason:
            r = out.setdefault(reason, {"count": 0, "examples": []})
            r["count"] += 1
            if len(r["examples"]) < examples:
                lon, lat = to_ll.transform(mid.x, mid.y)
                r["examples"].append(f"{p.name or p.key} ({p.cls}) {lat:.4f},{lon:.4f}")
    return out


def shorten(name: str, rules: list[dict], keep=()) -> str:
    """A district name as people say it: each rule (``pattern``, a regular expression, and its
    ``replace``) applied in turn; the name is kept if a rule would empty it, or if it is one of
    ``keep`` (where the short name would mislead)."""
    if name in keep:
        return name
    for r in rules:
        new = re.sub(r["pattern"], r["replace"], name).strip()
        name = new or name
    return name


def place_layer(
    cfg: dict,
    city_name: str,
    city_level: int,
    rels_areas: dict,
    rels_level: dict,
    rels_tags: dict,
    nodes: list[dict],
    city,
    population_source: dict,
    ghs_crs: str,
    measure: Measure,
    tile_zooms,
    rules: dict,
) -> tuple[list[dict], dict]:
    """The ``places`` features: two tiers of district names at points inside the city."""
    crs = "EPSG:3035"
    shapely.prepare(city)
    city_p = city
    areas: dict[int, list] = {}
    for rid, g_ll in rels_areas.items():
        g = polygonal(reproject(g_ll, "EPSG:4326", crs))
        if g.is_empty:
            continue
        inter = polygonal(g.intersection(city))
        if inter.is_empty or inter.area < rules["min_share_in_city"] * g.area:
            continue
        areas.setdefault(rels_level[rid], []).append((rid, inter))
    counts = {lv: len(v) for lv, v in areas.items()}
    by_kind: dict[str, list] = {k: [] for k in PLACE_KINDS}
    for n in nodes:
        name = n["tags"].get("name")
        x, y = _xy([n["lon"]], [n["lat"]], crs)[0]
        if name and shapely.contains_xy(city_p, x, y):
            by_kind[n["tags"]["place"]].append((n, (x, y)))
    cfg_places = cfg.get("places") or {}
    override = {k: v for k, v in cfg_places.items() if k in ("tier1", "tier2")}
    if override:
        t1, t2 = parse_tier(override.get("tier1")), parse_tier(override.get("tier2"))
    else:
        t1, t2 = choose_levels(counts, {k: len(v) for k, v in by_kind.items()}, rules)

    def candidates(tier):
        out = []
        if tier is None:
            return out
        kind, level = tier
        if kind == "admin":
            for rid, inter in areas.get(level, []):
                tags = rels_tags[rid]
                if tags.get("name"):
                    p = label_point(inter)
                    out.append((tags, (p.x, p.y)))
        else:
            out = [(n["tags"], xy) for n, xy in by_kind.get(level, [])]
        return out

    tiers = []
    for k, tier in ((1, t1), (2, t2)):
        cands = candidates(tier)
        ranks = population_within(
            [xy for _, xy in cands], population_source, ghs_crs, rules["rank_radius_m"]
        )
        rows = [(tags, xy, r) for (tags, xy), r in zip(cands, ranks, strict=True)]
        if k == 1 and tier and tier[0] == "place" and not override:
            order = sorted(range(len(rows)), key=lambda i: (-rows[i][2], rows[i][0]["name"]))
            keep = thin_by_spacing([r[1] for r in rows], order, rules["max_names"])
            rows = [rows[i] for i in keep]
        tiers.append(rows)
    # the languages of the names, as OSM has them (name and name:xx), for the release notes
    named = sorted((r for rows in tiers for r in rows), key=lambda r: -r[2])
    lang_keys = Counter(k for t, _, _ in named for k in t if k.startswith("name:"))
    lang_examples = [
        {k: v for k, v in t.items() if k == "name" or k.startswith("name:")}
        for t, _, _ in named[:3]
    ]
    # names as people say them (capitals.yml › places.name_rules)
    rules_n = cfg_places.get("name_rules") or []
    keep_n = set(cfg_places.get("name_keep") or [])
    tiers = [
        [({**t, "name": shorten(t["name"], rules_n, keep_n)}, xy, rank) for t, xy, rank in rows]
        for rows in tiers
    ]
    # a place named as the city itself is left out (Sofia's settlement София)
    own = {cfg.get("local_name"), city_name}
    tiers = [[r for r in rows if r[0]["name"] not in own] for rows in tiers]
    # a finer area named as a district near it is left out (Berlin's Ortsteil Mitte)
    first = [(r[0]["name"], r[1]) for r in tiers[0]]
    tiers[1] = [
        r
        for r in tiers[1]
        if not any(
            n == r[0]["name"] and math.dist(xy, r[1]) <= rules["same_name_m"] for n, xy in first
        )
    ]
    feats = []
    for k, rows in ((1, tiers[0]), (2, tiers[1])):
        for tags, (x, y), rank in sorted(rows, key=lambda r: (-r[2], r[0]["name"])):
            lon, lat = transformer(crs, "EPSG:4326").transform(x, y)
            props = {
                "name": tags["name"],
                "tier": k,
                "rank": rank,
                "w": round(measure(tags["name"]), 2),
            }
            feats.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                    "properties": props,
                    "tippecanoe": {
                        "layer": "places",
                        "minzoom": tile_zooms[0],
                        "maxzoom": tile_zooms[1],
                    },
                }
            )

    def label(tier):
        return (
            None
            if tier is None
            else f"{'admin_level' if tier[0] == 'admin' else 'place'}={tier[1]}"
        )

    stats = {
        "city_admin_level": city_level,
        "admin_counts": {str(k): v for k, v in sorted(counts.items())},
        "place_counts": {k: len(v) for k, v in by_kind.items()},
        "tier1": label(t1),
        "tier2": label(t2),
        "override": bool(override),
        "name_keys": dict(lang_keys.most_common()),
        "name_examples": lang_examples,
        "tier1_names": len(tiers[0]),
        "tier2_names": len(tiers[1]),
    }
    return feats, stats


def context_orientation(
    capital: str,
    summary_json: dict,
    boundaries: gpd.GeoDataFrame,
    boundary_source: dict,
    land_polygons_source: dict,
    population_source: dict,
    fonts: dict,
    capitals: dict,
    sources: dict,
    overview: dict,
    paths: dict,
) -> tuple[str, dict]:
    t0 = time.time()
    cfg = capital_config(capital, capitals)
    crs = boundaries.crs.to_string()
    rows = boundaries.set_index("name").geometry
    city = rows["city"]
    bbox, tile_zooms = summary_json["context"]["bbox"], summary_json["zooms"]["context"]
    lat = (bbox[1] + bbox[3]) / 2
    box = reproject(shapely.segmentize(shapely.box(*bbox), 0.01), "EPSG:4326", crs)
    rules, prules = overview["roads"], overview["places"]
    files = [str(extract_file(r, sources, paths)) for r in context_regions(cfg)]
    files = [f for f in files if Path(f).exists()]
    own = [str(extract_file(r, sources, paths)) for r in extract_regions(cfg)]
    ways, seen, place_nodes, seen_nodes = [], set(), [], set()
    for f in files:
        got = osm.read_main_roads_and_places(
            f, bbox, summary_json["bbox"], set(CLASSES), PLACE_KINDS
        )
        for w in got["roads"]:
            t = w["tags"]
            cls = road_class(t)
            if w["id"] in seen or cls is None:
                continue
            seen.add(w["id"])
            ways.append(
                {
                    "coords": _xy(w["lon"], w["lat"], crs),
                    "cls": cls,
                    "name": t.get("name", ""),
                    "tunnel": is_tunnel(t),
                    "oneway": t.get("oneway") in ONEWAY,
                    "ref": t.get("ref", ""),
                }
            )
        for n in got["places"]:
            if n["id"] not in seen_nodes:
                seen_nodes.add(n["id"])
                place_nodes.append(n)
    t_read = time.time() - t0
    land = read_land(land_polygons_source, bbox, crs)
    road_feats, road_stats, pieces = road_layer(ways, city, box, land, lat, tile_zooms, rules, crs)
    # places: the administrative areas finer than the city, from its own extracts
    city_level = int(boundary_source["admin_level"])
    rels_areas, rels_level, rels_tags = {}, {}, {}
    for f in own:
        rels = osm.relations(f)
        admin = {
            r: lv for r, lv in osm.admin_relations(rels, city_level).items() if r not in rels_level
        }
        for rid, g in osm.areas_of_relations(f, admin).items():
            rels_areas[rid], rels_level[rid], rels_tags[rid] = g, admin[rid], rels[rid]["tags"]
    measure = Measure(fonts["figtree"], fonts["noto_sans"])
    place_feats, place_stats = place_layer(
        cfg,
        boundary_source.get("name", ""),
        city_level,
        rels_areas,
        rels_level,
        rels_tags,
        place_nodes,
        city,
        population_source,
        sources["ghs_pop"]["crs"],
        measure,
        tile_zooms,
        prules,
    )
    out = Path(paths["intermediate"]) / "tiles" / "context_orientation.geojsonseq.gz"
    _write(out, [*road_feats, *place_feats])
    stats = {
        "extracts": [Path(f).name for f in files],
        "roads": road_stats,
        "places": place_stats,
        "checks": road_checks(capital, pieces, ways),
        "seconds_reading": round(t_read),
        "seconds": round(time.time() - t0),
    }
    log.info("context roads: %s", {k: v for k, v in road_stats.items() if k != "ends_left"})
    log.info("context places: %s", place_stats)
    return str(out), stats


def road_checks(capital: str, pieces: list[Piece], ways: list[dict]) -> dict:
    """What must hold in a capital (Stockholm): Folkungagatan meets Götgatan; at Skanstull and at
    Fridhemsplan, each road one line (its carriageways merged, ramps left out), Lindhagensplan's
    roundabout kept; at the Essingeleden interchange between Kristineberg and Fredhäll, the
    motorway's lines only."""
    if capital != "stockholm":
        return {}
    to = transformer("EPSG:4326", "EPSG:3035")
    out = {}

    def named(name):
        """A road's lines: by its name, or by the key (ref) of its ways (a merged pair carries
        one carriageway's name: Johanneshovsbron and Söderleden share ref E 4.25)."""
        keys = {w["ref"] or w["name"] for w in ways if w["name"] == name}
        return [p for p in pieces if p.name == name or p.key in keys]

    fa, gb = named("Folkungagatan"), named("Götgatan")
    out["Folkungagatan meets Götgatan"] = bool(
        fa
        and gb
        and shapely.MultiLineString([p.geom for p in fa]).distance(
            shapely.MultiLineString([p.geom for p in gb])
        )
        < 1.0
    )
    for place, (lon, lat), names in (
        (
            "Skanstull",
            (18.0745, 59.3080),
            ("Götgatan", "Ringvägen", "Johanneshovsbron", "Söderleden", "Söderledstunneln"),
        ),
        ("Fridhemsplan", (18.0300, 59.3320), ("Drottningholmsvägen", "Sankt Eriksgatan")),
    ):
        here = shapely.Point(*to.transform(lon, lat)).buffer(500)
        for name in names:
            near = [p for p in named(name) if p.geom.intersects(here)]
            if near:
                apart = [round(p.geom.length) for p in near if p.oneway and not p.dual]
                out[f"{place}, {name}: one line"] = not [m for m in apart if m > 50]
                out[f"{place}, {name}: one-way lines left (m)"] = apart
    # Lindhagensplan, a real roundabout of one-way ways: kept as it is
    ring = [p for p in pieces if p.name == "Lindhagensplan"]
    out["Lindhagensplan: roundabout kept (one-way lines, m)"] = [
        len([p for p in ring if p.oneway and not p.dual]),
        round(sum(p.geom.length for p in ring if p.oneway and not p.dual)),
    ]
    # Essingeleden between Kristineberg and Fredhäll
    here = shapely.Point(*to.transform(18.0010, 59.3330)).buffer(800)
    near = [p for p in pieces if p.geom.intersects(here) and p.cls in ("motorway", "trunk")]
    out["Kristineberg-Fredhäll: motorway lines (dual, one-way, two-way)"] = [
        sum(p.dual for p in near),
        sum(p.oneway and not p.dual for p in near),
        sum(not p.oneway and not p.dual for p in near),
    ]
    return out
