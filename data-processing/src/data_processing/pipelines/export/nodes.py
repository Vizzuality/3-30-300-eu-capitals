"""Export: the release folder of a capital, laid out exactly as the bucket:
``capitals/<slug>/{grid,city,evidence}.pmtiles`` and ``summary.json``; and the cross-capital
files ``ranking.json``, ``capitals.json`` and ``sources.json``. Formats are documented in
docs/release-format.md.
"""

from __future__ import annotations

import json
import logging
import math
import subprocess
import time
from collections import defaultdict
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
import shapely

from data_processing.core.download import HEADERS, now_utc
from data_processing.core.geo import lonlat_bbox, reproject, web_mercator_tile
from data_processing.core.tiles import (
    Compression,
    TileFrame,
    TileType,
    gzip_bytes,
    png_bytes,
    render_grid_tile,
    tile_range,
    write_pmtiles,
)
from data_processing.pipelines.boundaries.nodes import capital_config

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1


def capital_dir(paths: dict, capital: str) -> Path:
    return Path(paths["release"]) / "capitals" / capital


def _city_ll_bbox(boundaries: gpd.GeoDataFrame, name: str = "analysis"):
    g = boundaries.set_index("name").geometry[name]
    return lonlat_bbox(g, boundaries.crs.to_string())


# ------------------------------------------------------------------ grid.pmtiles
def grid_archive(
    capital: str, grid_values: dict, boundaries: gpd.GeoDataFrame, tiles: dict, paths: dict
) -> tuple[str, dict]:
    t0 = time.time()
    p = tiles["grid"]
    values = grid_values["array"]
    bbox = _city_ll_bbox(boundaries)
    out_tiles, sizes = [], defaultdict(list)
    for z in range(p["minzoom"], p["maxzoom"] + 1):
        x0, y0, x1, y1 = tile_range(bbox, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                px = render_grid_tile(
                    values,
                    grid_values["transform"],
                    grid_values["crs"],
                    z,
                    x,
                    y,
                    p["tile_px"],
                    p["no_colour"],
                )
                if (px == p["no_colour"]).all():
                    continue  # empty tile: not stored, the API answers 204
                data = png_bytes(px)
                out_tiles.append((z, x, y, data))
                sizes[z].append(len(data))
    target = capital_dir(paths, capital) / "grid.pmtiles"
    write_pmtiles(
        target,
        out_tiles,
        TileType.PNG,
        Compression.NONE,
        bbox,
        11,
        {
            "name": f"{capital}-grid",
            "schema": "grid",
            "schema_version": SCHEMA_VERSION,
            "tile_size": p["tile_px"],
            "values": {
                "0": "no rule met",
                "1": "1 rule met",
                "2": "2 rules met",
                "3": "3 rules met",
                str(p["no_colour"]): "no colour (water, outside the city)",
            },
            "encoding": "single-channel 8-bit PNG (greyscale); pixel value = rules met",
            "resampling": "nearest neighbour from the 10 m EPSG:3035 grid",
        },
    )
    stats = {
        "tiles": len(out_tiles),
        "bytes": target.stat().st_size,
        "per_zoom": {
            str(z): {"tiles": len(v), "max_bytes": max(v), "median_bytes": int(np.median(v))}
            for z, v in sizes.items()
        },
        "seconds": round(time.time() - t0),
    }
    log.info("grid.pmtiles: %d tiles, %.1f MB", len(out_tiles), stats["bytes"] / 1e6)
    return str(target), stats


# ------------------------------------------------------------------ city.pmtiles
def city_archive(
    capital: str,
    tiles_water: str,
    tiles_parks: str,
    tiles_streets: str,
    tiles_canopy: str,
    tiles_trees: str,
    tiles_buildings: str,
    tiles: dict,
    paths: dict,
    tippecanoe_dir: str,
) -> tuple[str, dict]:
    t0 = time.time()
    target = capital_dir(paths, capital) / "city.pmtiles"
    target.parent.mkdir(parents=True, exist_ok=True)
    exe = Path(tippecanoe_dir) / "tippecanoe"
    if not exe.exists():
        raise FileNotFoundError(
            f"{exe} not found: run `just install-tippecanoe` (felt/tippecanoe v2.82.0)"
        )
    version = subprocess.run([str(exe), "--version"], capture_output=True, text=True, check=False)
    cmd = [
        str(exe),
        "-o",
        str(target),
        "--force",
        "-P",
        *tiles["city"]["tippecanoe_flags"],
        f"--name={capital}-city",
        "-q",
        tiles_water,
        tiles_parks,
        tiles_streets,
        tiles_canopy,
        tiles_trees,
        tiles_buildings,
    ]
    subprocess.run(cmd, check=True)
    stats = {
        "bytes": target.stat().st_size,
        "tippecanoe": (version.stdout or version.stderr).strip(),
        "flags": tiles["city"]["tippecanoe_flags"],
        "seconds": round(time.time() - t0),
    }
    log.info("city.pmtiles: %.1f MB (%.0f s)", stats["bytes"] / 1e6, time.time() - t0)
    return str(target), stats


# ------------------------------------------------------------------ evidence.pmtiles
def _merc_coords(geoms, crs: str):
    """The geometries in Web Mercator."""
    return reproject(geoms, crs, "EPSG:3857")


def evidence_archive(
    capital: str,
    buildings: gpd.GeoDataFrame,
    building_results: pd.DataFrame,
    building_points: pd.DataFrame,
    facades: gpd.GeoDataFrame,
    facade_seen: pd.DataFrame,
    trees: pd.DataFrame,
    building_routes: gpd.GeoDataFrame,
    parks: gpd.GeoDataFrame,
    boundaries: gpd.GeoDataFrame,
    method: dict,
    tiles: dict,
    paths: dict,
) -> tuple[str, dict]:
    t0 = time.time()
    crs = method["crs"]
    z = tiles["evidence"]["zoom"]
    res = building_results.set_index("id")
    pts = building_points.set_index("id")
    sel = buildings[buildings["scored"]].copy()
    tx, ty = web_mercator_tile(
        pts.loc[sel["id"], "lon"].values, pts.loc[sel["id"], "lat"].values, z
    )
    sel["tx"], sel["ty"] = tx, ty

    # everything in Web Mercator once
    fac_by_b = {b: g for b, g in facades.sort_values("sid").groupby("b")}
    seen = facade_seen.sort_values(["sid", "dist"])
    to_m = reproject(shapely.points(seen["sx"].values, seen["sy"].values), crs, "EPSG:3857")
    seen = seen.assign(mx=shapely.get_x(to_m), my=shapely.get_y(to_m))
    order = np.argsort(trees["tree"].values)
    tm = reproject(
        shapely.points(trees["x"].values[order], trees["y"].values[order]), crs, "EPSG:3857"
    )
    tree_ids = trees["tree"].values[order]
    tree_mx, tree_my = shapely.get_x(tm), shapely.get_y(tm)
    seen_by_sid = {
        s: (g["tree"].values, g["mx"].values, g["my"].values) for s, g in seen.groupby("sid")
    }
    route_merc = dict(
        zip(
            building_routes["id"].values,
            _merc_coords(shapely.simplify(building_routes.geometry.values, 1.0), crs),
            strict=True,
        )
    )
    park_merc = dict(
        zip(
            parks["pid"].values,
            _merc_coords(shapely.simplify(parks.geometry.values, 2.0), crs),
            strict=True,
        )
    )
    park_info = parks.set_index("pid")

    written, raw_sizes, gz_sizes, counts = [], [], [], []
    for (x, y), group in sel.groupby(["tx", "ty"]):
        frame = TileFrame(z, int(x), int(y))
        tree_index: dict[int, int] = {}
        tree_list: list = []

        def tree_ref(t, frame=frame, tree_index=tree_index, tree_list=tree_list):
            if t not in tree_index:
                tree_index[t] = len(tree_list)
                k = np.searchsorted(tree_ids, t)
                tree_list.append(frame.from_merc([tree_mx[k]], [tree_my[k]])[0].tolist())
            return tree_index[t]

        tile_parks, out = {}, {}
        point_index: dict[tuple[int, int], int] = {}
        point_list: list = []

        def point_refs(mx, my, frame=frame, point_index=point_index, point_list=point_list):
            refs = []
            for p in frame.from_merc(mx, my).tolist():
                key = (p[0], p[1])
                if key not in point_index:
                    point_index[key] = len(point_list)
                    point_list.append(p)
                if not refs or refs[-1] != point_index[key]:
                    refs.append(point_index[key])
            return refs

        for bid in group["id"].values:
            r = res.loc[bid]
            n_res = float(r.residents)
            fac_out = {"first": None, "seen": [], "from": []}
            fb = fac_by_b.get(bid)
            if fb is not None:
                for f in fb.itertuples():
                    sg = seen_by_sid.get(f.sid)
                    seen_idx, seen_from = [], []
                    if sg is not None:
                        seen_idx = [tree_ref(int(t)) for t in sg[0]]
                        seen_from = [
                            point_refs([mx], [my])[0] for mx, my in zip(sg[1], sg[2], strict=True)
                        ]
                    if fac_out["first"] is None:
                        fac_out["first"] = int(f.sid)
                    elif int(f.sid) != fac_out["first"] + len(fac_out["seen"]):
                        raise ValueError(f"facade ids of building {bid} are not consecutive")
                    fac_out["seen"].append(seen_idx)
                    fac_out["from"].append(seen_from)
            route = None
            if bid in route_merc:
                c = np.asarray(route_merc[bid].coords)
                route = point_refs(c[:, 0], c[:, 1])
            park = int(r.park) if r.park >= 0 else None
            if park is not None and str(park) not in tile_parks:
                pg = park_merc[park]
                ring = np.asarray(
                    shapely.get_parts(pg)[
                        int(np.argmax(shapely.area(shapely.get_parts(pg))))
                    ].exterior.coords
                )
                info = park_info.loc[park]
                tile_parks[str(park)] = {
                    "name": info["name"] if isinstance(info["name"], str) else None,
                    "kind": info["kind"],
                    "ha": round(float(info["area_m2"]) / 1e4, 2),
                    "ring": frame.line(ring[:, 0], ring[:, 1]),
                }
            # rounded so that the shown values agree with the rules: a walk of 300.4 m is 301 m
            # (not met), a canopy share of 0.2999 is 0.299 (not met), a share of residents behind
            # passing facades of 0.5004 is 0.501 (met: more than half)
            walk = None if not np.isfinite(r.walk_m) else math.ceil(r.walk_m - 1e-9)
            out[str(int(bid))] = {
                "rules": [int(r.r3), int(r.r30), int(r.r300)],
                "residents": round(n_res, 1),
                "share3": math.ceil(float(r.share3) * 1000 - 1e-9) / 1000,
                "canopy": math.floor(float(r.canopy) * 1000 + 1e-9) / 1000,
                "walk": walk,
                "park": park,
                "route": route,
                "facades": fac_out,
            }
        doc = {
            "v": SCHEMA_VERSION,
            "tile": [z, int(x), int(y)],
            "trees": tree_list,
            "points": point_list,
            "parks": tile_parks,
            "buildings": out,
        }
        raw = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
        gz = gzip_bytes(raw)
        written.append((z, int(x), int(y), gz))
        raw_sizes.append(len(raw))
        gz_sizes.append(len(gz))
        counts.append(len(out))
    target = capital_dir(paths, capital) / "evidence.pmtiles"
    bbox = _city_ll_bbox(boundaries, "city")
    write_pmtiles(
        target,
        written,
        TileType.UNKNOWN,
        Compression.GZIP,
        bbox,
        z,
        {
            "name": f"{capital}-evidence",
            "schema": "evidence",
            "schema_version": SCHEMA_VERSION,
            "content_type": "application/json",
            "units": "decimetres",
            "origin": "tile north-west corner, x east, y south, ground metres "
            "(Web Mercator metres x cos(latitude of the tile centre))",
        },
    )
    raw_a, gz_a = np.array(raw_sizes), np.array(gz_sizes)
    stats = {
        "tiles": len(written),
        "buildings": int(sum(counts)),
        "bytes": target.stat().st_size,
        "raw_bytes": {
            "median": int(np.median(raw_a)),
            "p95": int(np.percentile(raw_a, 95)),
            "max": int(raw_a.max()),
        },
        "gzip_bytes": {
            "median": int(np.median(gz_a)),
            "p95": int(np.percentile(gz_a, 95)),
            "max": int(gz_a.max()),
        },
        "seconds": round(time.time() - t0),
    }
    log.info(
        "evidence.pmtiles: %d tiles, %d buildings, %.1f MB, max %d kB gzip",
        len(written),
        stats["buildings"],
        stats["bytes"] / 1e6,
        gz_a.max() // 1000,
    )
    return str(target), stats


# ------------------------------------------------------------------ names (Wikidata)
def download_names(capital: str, capitals: dict, locales: list, sources: dict, paths: dict) -> dict:
    """Labels of the capital and its country in the 24 languages (fallback: ``mul``, then
    English, recorded in ``fallbacks``)."""
    cfg = capital_config(capital, capitals)
    folder = Path(paths["raw"]) / "wikidata" / capital
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "labels.json"
    ids = [cfg["wikidata"], cfg["country_wikidata"]]
    if not target.exists():
        r = requests.get(
            sources["wikidata"]["api_url"],
            headers=HEADERS,
            timeout=120,
            params={
                "action": "wbgetentities",
                "ids": "|".join(ids),
                "props": "labels",
                "languages": "|".join([*locales, "mul"]),
                "format": "json",
            },
        )
        r.raise_for_status()
        target.write_text(
            json.dumps(
                {"downloaded": now_utc(), "url": r.url, "answer": r.json()}, ensure_ascii=False
            )
        )
    data = json.loads(target.read_text())
    entities = data["answer"]["entities"]
    out, fallbacks = {}, []
    for key, qid in (("capital", ids[0]), ("country", ids[1])):
        labels = entities[qid]["labels"]
        names = {}
        for loc in locales:
            if loc in labels:
                names[loc] = labels[loc]["value"]
            elif "mul" in labels:
                names[loc] = labels["mul"]["value"]
                fallbacks.append(f"{key}:{loc}:mul")
            else:
                names[loc] = labels["en"]["value"]
                fallbacks.append(f"{key}:{loc}:en")
        out[key] = names
    return {
        **out,
        "wikidata": {"capital": ids[0], "country": ids[1]},
        "downloaded": data["downloaded"],
        "fallbacks": fallbacks,
    }


# ------------------------------------------------------------------ sources
def _iso_http_date(value: str | None) -> str | None:
    if not value:
        return None
    return parsedate_to_datetime(value).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso(value: str | None) -> str | None:
    """ISO 8601 in UTC, seconds, with Z."""
    if not value:
        return None
    return (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        .astimezone(UTC)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


def capital_sources(
    osm_extract,
    boundary_stats,
    buildings_source,
    canopy_height_source,
    population_source,
    names,
    sources,
) -> dict:
    """Version and date of every source used for one capital (summary.json › sources)."""
    imagery = canopy_height_source["imagery_dates_in_city"]
    overture = buildings_source["query"]["release"]
    return {
        "osm": {
            "version": f"Geofabrik {osm_extract['region']}-{osm_extract['extract_date']}",
            "date": _iso(osm_extract["timestamp"]),
            "relation": boundary_stats["relation"],
            "relation_version": boundary_stats["version"],
        },
        "osm_land_polygons": {
            "version": None,
            "date": _iso_http_date(boundary_stats["land_polygons"]["last_modified"]),
        },
        "overture_buildings": {"version": overture, "date": overture.split(".")[0]},
        "canopy_height": {
            "version": sources["canopy_height"]["version"],
            "date": f"{imagery['min']}/{imagery['max']}",
        },
        "ghs_pop": {
            "version": sources["ghs_pop"]["version"],
            "date": str(sources["ghs_pop"]["epoch"]),
        },
        "wikidata": {"version": None, "date": _iso(names["downloaded"])},
    }


def merge_dates(dates: list[str]) -> str:
    """One date for the release: the common value, or the ISO 8601 interval "first/last"."""
    ends = sorted({p for d in dates if d for p in d.split("/")})
    if not ends:
        return ""
    return ends[0] if len(ends) == 1 else f"{ends[0]}/{ends[-1]}"


def sources_document(release: str, records: list[dict], sources: dict) -> dict:
    """sources.json: every source with its version, date, licence and attribution."""
    out = []
    for sid, meta in sources["credits"].items():
        per = [r["sources"][sid] for r in records if sid in r.get("sources", {})]
        versions = sorted({p["version"] for p in per if p.get("version")})
        out.append(
            {
                "id": sid,
                "name": meta["name"],
                "version": ", ".join(versions) if versions else None,
                "date": merge_dates([p.get("date") for p in per]),
                "licence": meta["licence"],
                "licence_url": meta["licence_url"],
                "attribution": meta["attribution"],
                "url": meta["url"],
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "release": release,
        "sources": out,
        "capitals": {r["slug"]: r["sources"] for r in sorted(records, key=lambda r: r["slug"])},
    }


# ------------------------------------------------------------------ summary.json
def _outline_record(city, crs: str):
    """Real outline for the Home map: rings in metres from the centre (azimuthal equidistant),
    simplified to about 50 m; centre in longitude, latitude."""
    c = reproject(city.centroid, crs, "EPSG:4326")
    lon, lat = c.x, c.y
    aeqd = f"+proj=aeqd +lat_0={lat} +lon_0={lon} +units=m +datum=WGS84"
    g = reproject(city.simplify(50), crs, aeqd)
    polys = []
    for poly in shapely.get_parts(g):
        rings = [np.round(np.asarray(poly.exterior.coords), 1).tolist()]
        rings += [np.round(np.asarray(r.coords), 1).tolist() for r in poly.interiors]
        polys.append(rings)
    return [round(lon, 6), round(lat, 6)], polys


def summary(
    capital: str,
    release: str,
    capitals: dict,
    city_summary: dict,
    names: dict,
    boundaries: gpd.GeoDataFrame,
    boundary_stats: dict,
    tiles_streets_stats: dict,
    canopy_height_source: dict,
    buildings_source: dict,
    population_source: dict,
    osm_extract: dict,
    sources: dict,
    tiles: dict,
    paths: dict,
) -> tuple[dict, dict]:
    cfg = capital_config(capital, capitals)
    crs = boundaries.crs.to_string()
    city = boundaries.set_index("name").geometry["city"]
    centre, outline = _outline_record(city, crs)
    shares = {
        "met": [round(v, 4) for v in city_summary["met"]],
        "rules": {k: round(v, 4) for k, v in city_summary["rules"].items()},
    }
    doc = {
        "schema_version": SCHEMA_VERSION,
        "release": release,
        "slug": capital,
        "name": names["capital"],
        "local_name": cfg["local_name"],
        "language": cfg["language"],
        "country": {"code": cfg["country"], "name": names["country"]},
        "residents": int(round(city_summary["residents"])),
        "shares": shares,
        "suggested": city_summary["suggested"],
        "centre": centre,
        "bbox": [round(v, 5) for v in _city_ll_bbox(boundaries, "city")],
        "area_km2": boundary_stats["city_km2"],
        "label_chars": tiles_streets_stats["label_chars"],
        "zooms": {
            "grid": [tiles["grid"]["minzoom"], tiles["grid"]["maxzoom"]],
            "city": [tiles["city"]["minzoom"], tiles["city"]["maxzoom"]],
            "evidence": tiles["evidence"]["zoom"],
        },
        "sources": capital_sources(
            osm_extract,
            boundary_stats,
            buildings_source,
            canopy_height_source,
            population_source,
            names,
            sources,
        ),
    }
    record = {
        "release": release,
        "slug": capital,
        "name": names["capital"],
        "local_name": cfg["local_name"],
        "language": cfg["language"],
        "country": doc["country"],
        "residents": doc["residents"],
        "shares": shares,
        "centre": centre,
        "km": round(float(np.sqrt(city.area / 1e6)), 2),
        "outline": outline,
        "sources": doc["sources"],
    }
    return doc, record


# ------------------------------------------------------------------ ranking.json, capitals.json
def release_index(
    release: str, capitals: dict, sources: dict, paths: dict, release_record: dict | None = None
) -> tuple[dict, dict, dict]:
    """Cross-capital files, from the capitals of this release processed so far (each capital's
    ``release_record.json``). ``release_record`` (the capital just run) only orders the nodes."""
    del release_record
    records = []
    for slug in capitals:
        p = Path(paths["intermediate_root"]) / slug / "release_record.json"
        if p.exists():
            r = json.loads(p.read_text())
            if r["release"] == release:
                records.append(r)
    records.sort(key=lambda r: (-r["shares"]["met"][3], r["slug"]))
    ranking = {
        "schema_version": SCHEMA_VERSION,
        "release": release,
        "complete": len(records) == len(capitals),
        "capitals": [
            {
                "rank": i + 1,
                "slug": r["slug"],
                "name": r["name"],
                "country": r["country"],
                "residents": r["residents"],
                "shares": r["shares"],
            }
            for i, r in enumerate(records)
        ],
    }
    caps = {
        "schema_version": SCHEMA_VERSION,
        "release": release,
        "complete": len(records) == len(capitals),
        "capitals": [
            {
                "slug": r["slug"],
                "name": r["name"],
                "local_name": r["local_name"],
                "language": r["language"],
                "country": r["country"],
                "residents": r["residents"],
                "centre": r["centre"],
                "display": r["centre"],
                "km": r["km"],
                "outline": r["outline"],
            }
            for r in sorted(records, key=lambda r: r["slug"])
        ],
    }
    log.info(
        "ranking.json, capitals.json, sources.json: %d of %d capitals", len(records), len(capitals)
    )
    return ranking, caps, sources_document(release, records, sources)
