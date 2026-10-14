"""Checks a release folder before it is published (`just check <release>`).

Failures (exit code 1) are real errors:

- a file of the bucket layout is missing, for a capital of ranking.json;
- a JSON file does not follow docs/release-format.md (ranking, capitals, sources, summary);
- grid.pmtiles: tiles that are not 512 px single-channel PNGs with values 0–4, or wrong zooms;
- city.pmtiles: not vector tiles, wrong zooms, a layer or an attribute missing;
- evidence.pmtiles: tiles that are not gzip JSON at zoom 15 or break the schema;
- outline.json: not a GeoJSON Feature of the release and the capital, not a valid MultiPolygon,
  bounds other than the city's (summary.json › bbox), or over its size limit (check.yml);
- summary.json › context: missing, or a rectangle that does not hold the city, or least zooms
  over the page's greatest zoom (they have no floor: a whole city may be fitted below 9);
- context.pmtiles: not vector tiles, zooms other than summary.json › zooms.context (which must
  reach down to the least zooms), its water or roads layer missing, a road or a place breaking
  the schema, a place outside the city, layers other than water, roads and places; its size
  over the budget is a warning;
- europe.pmtiles (once the release is complete): not vector tiles, wrong zooms, a layer missing
  or one the format does not have (`land`, dropped: the countries cover it);
- capitals.json: a capital without its place on the Home map (scale, display, leader);
- any archive whose metadata holds an absolute path (of the machine that built it);
- a known value of a capital out of its range (conf/base/parameters/check.yml).

Sizes are warnings only (budgets in check.yml): vector tiles over the warning size, those over
the aim, and evidence tiles over the warning size (gzipped) are listed; the largest sizes are
printed.
"""

from __future__ import annotations

import gzip
import io
import json
import math
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import shapely
import shapely.geometry
from PIL import Image
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, TileType

from data_processing.config import PROJECT, parameters
from data_processing.core.tiles import absolute_paths

LAYERS = {
    "land": set(),
    "water": {"kind"},
    "shore": {"kind"},
    "water_marks": set(),
    "parks": {"pid", "kind", "ha", "name"},
    "streets": {"rank", "path", "name", "id"},
    "street_labels": {"name", "angle", "z", "len", "w", "rank", "slen"},
    "canopy": set(),
    "buildings": {"id", "score", "r3", "r30", "r300", "scored", "cx", "cy"},
    "facades": {"sid", "b", "ok", "n", "orient", "res"},
    "trees": {"id", "h"},
}
# Layers a capital can lack: Tippecanoe leaves out a layer without features
OPTIONAL_LAYERS = {"water_marks": "no water 30 m or more from a shore"}
LOCALES = 24
BUILDING_KEYS = {"rules", "residents", "share3", "canopy", "walk", "park", "route", "facades"}
EUROPE_LAYERS = {
    "sea": set(),
    "countries": {"code", "eu", "tint"},
    "borders": set(),
    "coastline": {"kind"},
    "graticule": {"axis", "deg"},
    "sea_marks": set(),
}


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.notes: list[str] = []

    def check(self, ok: bool, msg: str) -> bool:
        if not ok:
            self.errors.append(msg)
        return ok

    def note(self, msg: str) -> None:
        self.notes.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _names(r: Report, names, where: str, locales: list[str]) -> None:
    ok = (
        isinstance(names, dict)
        and set(names) == set(locales)
        and all(isinstance(v, str) and v for v in names.values())
    )
    r.check(ok, f"{where}: names must be given in the {LOCALES} locales")


def _shares(r: Report, shares, where: str) -> None:
    met = shares.get("met") if isinstance(shares, dict) else None
    rules = shares.get("rules") if isinstance(shares, dict) else None
    if not r.check(
        isinstance(met, list) and len(met) == 4, f"{where}: shares.met is not 4 numbers"
    ):
        return
    r.check(all(0 <= v <= 1 for v in met), f"{where}: shares.met outside 0–1")
    r.check(abs(sum(met) - 1) <= 0.0005, f"{where}: shares.met sums to {sum(met)}")
    r.check(
        isinstance(rules, dict) and set(rules) == {"3", "30", "300"},
        f"{where}: shares.rules must have keys 3, 30, 300",
    )
    if isinstance(rules, dict):
        r.check(all(0 <= v <= 1 for v in rules.values()), f"{where}: shares.rules outside 0–1")
        # each rule's share cannot be below the share meeting all three
        r.check(
            all(v + 1e-4 >= met[3] for v in rules.values()),
            f"{where}: a rule's share is below the share meeting all three",
        )


def check_summary(r: Report, path: Path, slug: str, release: str, locales: list[str]) -> dict:
    s = json.loads(path.read_text())
    w = f"{slug}/summary.json"
    for key in (
        "schema_version",
        "release",
        "slug",
        "name",
        "local_name",
        "language",
        "country",
        "residents",
        "shares",
        "suggested",
        "centre",
        "bbox",
        "context",
        "area_km2",
        "label_chars",
        "zooms",
        "sources",
    ):
        r.check(key in s, f"{w}: missing {key}")
    r.check(s.get("schema_version") == 1, f"{w}: schema_version is not 1")
    r.check(s.get("release") == release, f"{w}: release is {s.get('release')}")
    r.check(s.get("slug") == slug, f"{w}: slug is {s.get('slug')}")
    _names(r, s.get("name"), f"{w} name", locales)
    _names(r, s.get("country", {}).get("name"), f"{w} country.name", locales)
    r.check(isinstance(s.get("residents"), int) and s["residents"] > 0, f"{w}: residents")
    _shares(r, s.get("shares"), w)
    bbox = s.get("bbox", [0, 0, 0, 0])
    lon, lat = s.get("suggested", [None, None])
    r.check(
        lon is not None and bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3],
        f"{w}: suggested {s.get('suggested')} is outside the city's bounding box",
    )
    return s


def check_index(r: Report, folder: Path, release: str, locales: list[str]) -> list[str]:
    ranking = json.loads((folder / "ranking.json").read_text())
    caps = json.loads((folder / "capitals.json").read_text())
    for doc, name in ((ranking, "ranking.json"), (caps, "capitals.json")):
        r.check(doc.get("schema_version") == 1, f"{name}: schema_version is not 1")
        r.check(doc.get("release") == release, f"{name}: release is {doc.get('release')}")
        r.check(isinstance(doc.get("complete"), bool), f"{name}: complete is not a boolean")
    slugs = [c["slug"] for c in ranking["capitals"]]
    r.check(
        sorted(slugs) == sorted(c["slug"] for c in caps["capitals"]),
        "ranking.json and capitals.json list different capitals",
    )
    prev = 2.0
    for i, c in enumerate(ranking["capitals"]):
        w = f"ranking.json[{c.get('slug')}]"
        r.check(c.get("rank") == i + 1, f"{w}: rank")
        _names(r, c.get("name"), w, locales)
        _shares(r, c.get("shares"), w)
        r.check(c["shares"]["met"][3] <= prev, f"{w}: not sorted by the share meeting all three")
        prev = c["shares"]["met"][3]
    for c in caps["capitals"]:
        w = f"capitals.json[{c.get('slug')}]"
        for key in (
            "slug",
            "name",
            "local_name",
            "language",
            "country",
            "residents",
            "centre",
            "display",
            "km",
            "scale",
            "leader",
            "outline",
        ):
            r.check(key in c, f"{w}: missing {key}")
        rings = [ring for poly in c.get("outline") or [[[]]] for ring in poly]
        r.check(
            all(len(ring) >= 4 and ring[0] == ring[-1] for ring in rings),
            f"{w}: outline rings must be closed",
        )
        r.check(isinstance(c.get("scale"), int | float) and c["scale"] >= 1, f"{w}: scale")
        leader = c.get("leader")
        r.check(leader is None or len(leader) == 2, f"{w}: leader is not null or [lon, lat]")
    if not ranking.get("complete"):
        r.note(f"ranking.json and capitals.json are partial: {len(slugs)} of 27 capitals")
    europe = folder / "europe.pmtiles"
    if ranking.get("complete"):
        r.check(europe.exists(), "europe.pmtiles is missing")
    elif not europe.exists():
        r.note("europe.pmtiles (the Home map) is not written yet")
    return slugs


def check_europe(r: Report, path: Path, home: dict) -> dict:
    f, reader = _reader(path)
    h = reader.header()
    meta = reader.metadata()
    w = "europe.pmtiles"
    check_no_local_paths(r, meta, w)
    r.check(h["tile_type"] == TileType.MVT, f"{w}: tile type is not MVT")
    r.check(
        h["min_zoom"] == home["minzoom"] and h["max_zoom"] == home["maxzoom"],
        f"{w}: zooms {h['min_zoom']}–{h['max_zoom']}",
    )
    layers = {v["id"]: set(v.get("fields", {})) for v in meta.get("vector_layers", [])}
    extra = sorted(set(layers) - set(EUROPE_LAYERS))
    r.check(not extra, f"{w}: layers not in the format: {extra}")
    for name, fields in EUROPE_LAYERS.items():
        if r.check(name in layers, f"{w}: layer {name} is missing"):
            r.check(fields <= layers[name], f"{w}: layer {name} lacks {fields - layers[name]}")
    sizes = [len(data) for _, data in all_tiles(reader.get_bytes)]
    f.close()
    return {"tiles": len(sizes), "max_bytes": max(sizes, default=0), "bytes": path.stat().st_size}


def _reader(path: Path):
    f = path.open("rb")
    return f, Reader(MmapSource(f))


def check_no_local_paths(r: Report, meta: dict, where: str) -> None:
    found = absolute_paths(meta)
    r.check(not found, f"{where}: metadata holds absolute paths: {found}")


def check_outline(
    r: Report, path: Path, slug: str, release: str, summary: dict, budgets: dict
) -> dict:
    """capitals/<slug>/outline.json: the city limits, a GeoJSON Feature (docs/release-format.md)."""
    w = f"{slug}/outline.json"
    size = path.stat().st_size
    r.check(
        size <= budgets["outline_json_max_bytes"],
        f"{w}: {size // 1000} kB, over the {budgets['outline_json_max_bytes'] // 1000} kB limit",
    )
    if size > budgets["outline_json_warn_bytes"]:
        r.warn(f"{w}: {size // 1000} kB")
    doc = json.loads(path.read_text())
    r.check(doc.get("type") == "Feature", f"{w}: not a GeoJSON Feature")
    r.check(doc.get("schema_version") == 1, f"{w}: schema_version is not 1")
    r.check(doc.get("release") == release, f"{w}: release is {doc.get('release')}")
    r.check(doc.get("slug") == slug, f"{w}: slug is {doc.get('slug')}")
    r.check(isinstance(doc.get("tolerance_m"), int | float), f"{w}: tolerance_m")
    geometry = doc.get("geometry") or {}
    if not r.check(geometry.get("type") == "MultiPolygon", f"{w}: geometry is not a MultiPolygon"):
        return {"bytes": size}
    g = shapely.geometry.shape(geometry)
    r.check(g.is_valid, f"{w}: invalid geometry ({shapely.is_valid_reason(g)})")
    # the city's: its bounds are the summary's box (the city's own, rounded outwards to 5
    # decimals), give or take the simplification (under 1.5 m) and the rounding
    bbox = summary.get("bbox", [0, 0, 0, 0])
    r.check(
        all(abs(a - b) <= 1e-4 for a, b in zip(g.bounds, bbox, strict=True)),
        f"{w}: bounds {[round(v, 5) for v in g.bounds]} differ from the city's {bbox}",
    )
    return {
        "bytes": size,
        "points": int(shapely.get_num_coordinates(g)),
        "parts": len(g.geoms),
        "holes": int(sum(len(p.interiors) for p in g.geoms)),
    }


CONTEXT_LAYERS = {
    "water": set(),
    "roads": {"class", "tunnel", "dual"},
    "places": {"name", "tier", "rank", "w"},
}
ROAD_CLASSES = {"motorway", "trunk", "primary", "secondary", "tertiary"}


def check_context_features(r: Report, w: str, roads: list, places: list, city) -> None:
    """Attributes of the roads and places of a context archive (decoded features), and every
    place inside the city (``city``: the outline's geometry, longitude and latitude)."""
    for f in roads:
        p = f["properties"]
        ok = (
            p.get("class") in ROAD_CLASSES and p.get("tunnel") in (0, 1) and p.get("dual") in (0, 1)
        )
        if not r.check(ok, f"{w}: a road breaks the schema: {p}"):
            break
    near_city = city.buffer(1e-4)  # the outline is simplified by about a metre
    for f in places:
        p = f["properties"]
        ok = (
            isinstance(p.get("name"), str)
            and p["name"]
            and p.get("tier") in (1, 2)
            and isinstance(p.get("rank"), int)
            and p["rank"] >= 0
            and isinstance(p.get("w"), int | float)
            and p["w"] > 0
            and set(p) == CONTEXT_LAYERS["places"]  # no other name: the local one only
        )
        if not r.check(ok, f"{w}: place {p} breaks the schema"):
            break
        pt = shapely.geometry.shape(f["geometry"])
        r.check(near_city.covers(pt), f"{w}: place {p.get('name')!r} is outside the city")


def _decode(decode: Path, path: Path, z: int, layer: str) -> list:
    out = subprocess.run(
        [str(decode), f"--minimum-zoom={z}", f"--maximum-zoom={z}", f"--layer={layer}", str(path)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    feats = []
    for tile in json.loads(out).get("features", []):
        for layer_fc in tile.get("features", []):
            feats.extend(layer_fc.get("features", []))
    return feats


def check_context(
    r: Report,
    path: Path,
    slug: str,
    summary: dict,
    budgets: dict,
    max_zoom: float,
    decode: Path | None = None,
    city_geom=None,
) -> dict:
    """summary.json › context and capitals/<slug>/context.pmtiles (docs/release-format.md)."""
    w = f"{slug}/summary.json context"
    ctx = summary.get("context") or {}
    bbox, city = ctx.get("bbox"), summary.get("bbox", [0, 0, 0, 0])
    if r.check(isinstance(bbox, list) and len(bbox) == 4, f"{w}: bbox"):
        r.check(
            bbox[0] <= city[0] and bbox[1] <= city[1] and bbox[2] >= city[2] and bbox[3] >= city[3],
            f"{w}: {bbox} does not hold the city {city}",
        )
    mz = ctx.get("min_zoom") or {}
    r.check(
        set(mz) == {"desktop", "phone"} and all(0 < v <= max_zoom for v in mz.values()),
        f"{w}: min_zoom {mz}",
    )
    tile_zooms = summary.get("zooms", {}).get("context")
    r.check(
        isinstance(tile_zooms, list) and mz and tile_zooms[0] <= math.floor(min(mz.values())),
        f"{w}: zooms.context {tile_zooms} do not reach the least zoom {mz}",
    )
    w = f"{slug}/context.pmtiles"
    f, reader = _reader(path)
    h, meta = reader.header(), reader.metadata()
    check_no_local_paths(r, meta, w)
    r.check(h["tile_type"] == TileType.MVT, f"{w}: tile type is not MVT")
    r.check(
        [h["min_zoom"], h["max_zoom"]] == tile_zooms,
        f"{w}: zooms {h['min_zoom']}–{h['max_zoom']}, summary.json says {tile_zooms}",
    )
    layers = {v["id"]: set(v.get("fields", {})) for v in meta.get("vector_layers", [])}
    r.check(set(layers) <= set(CONTEXT_LAYERS), f"{w}: layers {sorted(layers)}")
    for name in ("water", "roads"):
        r.check(name in layers, f"{w}: layer {name} is missing")
    if "places" not in layers:
        r.note(f"{w}: no places (no district level in the city)")
    for name, fields in CONTEXT_LAYERS.items():
        if name in layers:
            r.check(fields <= layers[name], f"{w}: layer {name} lacks {fields - layers[name]}")
    sizes = [len(data) for _, data in all_tiles(reader.get_bytes)]
    f.close()
    if decode is not None and decode.exists() and city_geom is not None:
        z = tile_zooms[1] if isinstance(tile_zooms, list) else h["max_zoom"]
        roads = _decode(decode, path, z, "roads") if "roads" in layers else []
        places = _decode(decode, path, z, "places") if "places" in layers else []
        check_context_features(r, w, roads, places, city_geom)
    size = path.stat().st_size
    if size > budgets["context_pmtiles_warn_bytes"]:
        r.warn(f"{w}: {size // 1000} kB")
    if max(sizes, default=0) > budgets["vector_tile_warn_bytes"]:
        r.warn(f"{w}: a tile is {max(sizes) // 1000} kB")
    return {"bytes": size, "tiles": len(sizes), "max_bytes": max(sizes, default=0)}


def check_grid(r: Report, path: Path, budgets: dict, grid: dict) -> dict:
    f, reader = _reader(path)
    h = reader.header()
    w = f"{path.parent.name}/grid.pmtiles"
    check_no_local_paths(r, reader.metadata(), w)
    r.check(h["tile_type"] == TileType.PNG, f"{w}: tile type is not PNG")
    r.check(
        h["min_zoom"] == grid["minzoom"] and h["max_zoom"] == grid["maxzoom"],
        f"{w}: zooms {h['min_zoom']}–{h['max_zoom']}",
    )
    n, biggest, values = 0, 0, Counter()
    for (z, x, y), data in all_tiles(reader.get_bytes):
        n += 1
        biggest = max(biggest, len(data))
        im = Image.open(io.BytesIO(data))
        if not r.check(
            im.mode == "L" and im.size == (grid["tile_px"], grid["tile_px"]),
            f"{w}: tile {z}/{x}/{y} is {im.mode} {im.size}",
        ):
            continue
        a = np.asarray(im)
        u, c = np.unique(a, return_counts=True)
        values.update(dict(zip(u.tolist(), c.tolist(), strict=True)))
        r.check(not (a == grid["no_colour"]).all(), f"{w}: empty tile {z}/{x}/{y} is stored")
    r.check(set(values) <= set(range(5)), f"{w}: unexpected values {sorted(values)}")
    if biggest > budgets["vector_tile_warn_bytes"]:
        r.warn(f"{w}: a tile is {biggest // 1000} kB")
    f.close()
    return {"tiles": n, "max_bytes": biggest, "values": dict(values)}


def check_city(r: Report, path: Path, budgets: dict, tippecanoe_dir: Path) -> dict:
    f, reader = _reader(path)
    h = reader.header()
    meta = reader.metadata()
    w = f"{path.parent.name}/city.pmtiles"
    check_no_local_paths(r, meta, w)
    r.check(h["tile_type"] == TileType.MVT, f"{w}: tile type is not MVT")
    r.check(
        h["min_zoom"] == 10 and h["max_zoom"] == 16, f"{w}: zooms {h['min_zoom']}–{h['max_zoom']}"
    )
    layers = {v["id"]: set(v.get("fields", {})) for v in meta.get("vector_layers", [])}
    for name, fields in LAYERS.items():
        if name in OPTIONAL_LAYERS and name not in layers:
            r.note(f"{w}: no {name} ({OPTIONAL_LAYERS[name]})")
            continue
        if r.check(name in layers, f"{w}: layer {name} is missing"):
            r.check(fields <= layers[name], f"{w}: layer {name} lacks {fields - layers[name]}")
    sizes, over_aim, biggest = [], [], (0, None)
    for (z, x, y), data in all_tiles(reader.get_bytes):
        sizes.append(len(data))
        if len(data) > budgets["vector_tile_aim_bytes"]:
            over_aim.append(f"{z}/{x}/{y} ({len(data) // 1000} kB)")
        if len(data) > biggest[0]:
            biggest = (len(data), (z, x, y))
        if len(data) > budgets["vector_tile_warn_bytes"]:
            r.warn(f"{w}: tile {z}/{x}/{y} is {len(data) // 1000} kB")
    f.close()
    if over_aim:
        aim = budgets["vector_tile_aim_bytes"] // 1000
        r.note(f"{w}: {len(over_aim)} tiles over the {aim} kB aim, e.g. {', '.join(over_aim[:5])}")
    # decode the biggest tile with tippecanoe-decode: every layer's features carry their fields
    decode = tippecanoe_dir / "tippecanoe-decode"
    sample = {}
    if decode.exists() and biggest[1]:
        z, x, y = biggest[1]
        out = subprocess.run(
            [str(decode), str(path), str(z), str(x), str(y)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        doc = json.loads(out)
        for layer in doc.get("features", []):
            name = layer["properties"]["layer"]
            feats = layer["features"]
            sample[name] = len(feats)
            missing = Counter()
            for ft in feats:
                missing.update(LAYERS.get(name, set()) - set(ft["properties"]))
            r.check(
                not missing, f"{w}: tile {z}/{x}/{y} layer {name} features lack {dict(missing)}"
            )
    return {
        "tiles": len(sizes),
        "max_bytes": biggest[0],
        "max_tile": biggest[1],
        "median_bytes": int(np.median(sizes)),
        "over_aim": len(over_aim),
        "biggest_tile_features": sample,
    }


def _tile_of(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def check_evidence(r: Report, path: Path, budgets: dict, zoom: int) -> dict:
    f, reader = _reader(path)
    h = reader.header()
    meta = reader.metadata()
    w = f"{path.parent.name}/evidence.pmtiles"
    check_no_local_paths(r, meta, w)
    r.check(h["tile_type"] == TileType.UNKNOWN, f"{w}: tile type is not unknown")
    r.check(h["tile_compression"] == Compression.GZIP, f"{w}: tiles are not gzip")
    r.check(h["min_zoom"] == zoom and h["max_zoom"] == zoom, f"{w}: zoom is not {zoom} only")
    r.check(
        meta.get("schema") == "evidence" and meta.get("schema_version") == 1,
        f"{w}: metadata schema",
    )
    raw_max = gz_max = n_b = 0
    over = []
    for (z, x, y), data in all_tiles(reader.get_bytes):
        raw = gzip.decompress(data)
        raw_max, gz_max = max(raw_max, len(raw)), max(gz_max, len(data))
        if len(data) > budgets["evidence_tile_gzip_warn_bytes"]:
            over.append(f"{z}/{x}/{y} ({len(data) // 1000} kB)")
        doc = json.loads(raw)
        r.check(doc.get("v") == 1 and doc.get("tile") == [z, x, y], f"{w}: {z}/{x}/{y} header")
        ntrees, npoints = len(doc["trees"]), len(doc["points"])
        for bid, b in doc["buildings"].items():
            n_b += 1
            fac = b.get("facades", {})
            seen, frm = fac.get("seen", []), fac.get("from", [])
            route = b.get("route")
            walk = b.get("walk")
            ok = (
                set(b) == BUILDING_KEYS
                and set(fac) == {"first", "seen", "from"}
                and (fac["first"] is None) == (len(seen) == 0)
                and len(seen) == len(frm)
                and all(len(a) == len(c) for a, c in zip(seen, frm, strict=True))
                and all(0 <= i < ntrees for a in seen for i in a)
                and all(0 <= i < npoints for a in frm for i in a)
                and (route is None or (len(route) >= 2 and all(0 <= i < npoints for i in route)))
                and (route is None or walk is not None)
                and b["rules"][2] == int(walk is not None and walk <= 300)
                and b["rules"][1] == int(b["canopy"] >= 0.3)
                and b["rules"][0] == int(b["share3"] > 0.5)
                and (b["park"] is None or str(b["park"]) in doc["parks"])
                and 0 <= b["canopy"] <= 1
                and b["residents"] >= 0
            )
            r.check(ok, f"{w}: building {bid} in {z}/{x}/{y} breaks the schema")
    f.close()
    if over:
        limit = budgets["evidence_tile_gzip_warn_bytes"] // 1000
        r.warn(f"{w}: {len(over)} tiles over {limit} kB gzipped: {', '.join(over[:10])}")
    r.note(f"{w}: largest tile {gz_max // 1000} kB gzipped, {raw_max // 1000} kB as plain JSON")
    return {"buildings": n_b, "raw_max_bytes": raw_max, "gzip_max_bytes": gz_max}


ISO_DATE = re.compile(r"^\d{4}(-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?)?$")
NEEDS_VERSION = {"osm", "overture_buildings", "canopy_height", "ghs_pop", "natural_earth"}


def check_sources(r: Report, path: Path, release: str, summaries: dict, credits: dict) -> None:
    doc = json.loads(path.read_text())
    w = "sources.json"
    r.check(doc.get("schema_version") == 1, f"{w}: schema_version is not 1")
    r.check(doc.get("release") == release, f"{w}: release is {doc.get('release')}")
    ids = [s.get("id") for s in doc.get("sources", [])]
    r.check(ids == list(credits), f"{w}: sources are {ids}, expected {list(credits)}")
    for s in doc.get("sources", []):
        sw = f"{w}[{s.get('id')}]"
        for key in ("name", "licence", "licence_url", "attribution", "url", "date"):
            r.check(isinstance(s.get(key), str) and s[key], f"{sw}: {key} is missing")
        if s.get("id") in NEEDS_VERSION:
            r.check(isinstance(s.get("version"), str) and s["version"], f"{sw}: version")
        dates = str(s.get("date", "")).split("/")
        r.check(
            len(dates) <= 2 and all(ISO_DATE.match(d) for d in dates),
            f"{sw}: date {s.get('date')!r} is not ISO 8601",
        )
    caps = doc.get("capitals", {})
    r.check(set(caps) == set(summaries), f"{w}: capitals {sorted(caps)} ≠ {sorted(summaries)}")
    for slug, summary in summaries.items():
        r.check(
            caps.get(slug) == summary.get("sources"),
            f"{w}: the sources of {slug} differ from its summary.json",
        )


def check_known(r: Report, slug: str, summary: dict, known: dict) -> None:
    """Known values of a capital (each optional): boundary relation and version, English name,
    area and residents (ranges), shares (ranges) and where the suggested place falls."""
    k = known.get(slug)
    if not k:
        return
    w = f"{slug} known values"
    src = summary["sources"]["osm"]
    r.check(
        src["relation"] == k["osm_relation"] and src["relation_version"] == k["osm_version"],
        f"{w}: boundary is relation {src.get('relation')} v{src.get('relation_version')}",
    )
    if "name_en" in k:
        r.check(summary["name"]["en"] == k["name_en"], f"{w}: English name")
    for key in ("residents", "area_km2"):
        if key in k:
            lo, hi = k[key]
            r.check(lo <= summary[key] <= hi, f"{w}: {key} {summary[key]}, expected {lo}–{hi}")
    for i, (lo, hi) in enumerate(k.get("met", [])):
        v = summary["shares"]["met"][i]
        r.check(lo <= v <= hi, f"{w}: share meeting {i} rules is {v}, expected {lo}–{hi}")
    for rule, (lo, hi) in k.get("rules", {}).items():
        v = summary["shares"]["rules"][str(rule)]
        r.check(lo <= v <= hi, f"{w}: share meeting rule {rule} is {v}, expected {lo}–{hi}")
    if "suggested_within" in k:
        w_, s_, e_, n_ = k["suggested_within"]
        lon, lat = summary["suggested"]
        r.check(
            w_ <= lon <= e_ and s_ <= lat <= n_,
            f"{w}: suggested {summary['suggested']} is not in {k['suggested_name']}",
        )


def main(release: str) -> int:
    params = parameters(release=release)
    folder = PROJECT / "data" / "03_primary" / "releases" / release
    r = Report()
    if not folder.exists():
        print(f"no release folder {folder}")
        return 1
    tiles = params["tiles"]
    budgets = params["check"]["budgets"]
    locales = params["locales"]
    results = {}
    for name in ("ranking.json", "capitals.json", "sources.json"):
        r.check((folder / name).exists(), f"{name} is missing")
    slugs = check_index(r, folder, release, locales) if not r.errors else []
    summaries = {}
    for slug in slugs:
        d = folder / "capitals" / slug
        missing = [
            n
            for n in (
                "grid.pmtiles",
                "city.pmtiles",
                "evidence.pmtiles",
                "outline.json",
                "context.pmtiles",
                "summary.json",
            )
            if not (d / n).exists()
        ]
        if not r.check(not missing, f"{slug}: missing {missing}"):
            continue
        summary = check_summary(r, d / "summary.json", slug, release, locales)
        summaries[slug] = summary
        results[slug] = {
            "grid": check_grid(r, d / "grid.pmtiles", budgets, tiles["grid"]),
            "city": check_city(r, d / "city.pmtiles", budgets, PROJECT / params["tippecanoe_dir"]),
            "evidence": check_evidence(
                r, d / "evidence.pmtiles", budgets, tiles["evidence"]["zoom"]
            ),
            "outline": check_outline(r, d / "outline.json", slug, release, summary, budgets),
            "context": check_context(
                r,
                d / "context.pmtiles",
                slug,
                summary,
                budgets,
                params["overview"]["max_zoom"],
                PROJECT / params["tippecanoe_dir"] / "tippecanoe-decode",
                shapely.geometry.shape(json.loads((d / "outline.json").read_text())["geometry"]),
            ),
        }
        check_known(r, slug, summary, params["check"]["known"])
    if (folder / "europe.pmtiles").exists():
        results["europe"] = check_europe(r, folder / "europe.pmtiles", params["home"])
    if (folder / "sources.json").exists():
        check_sources(r, folder / "sources.json", release, summaries, params["sources"]["credits"])
    print(json.dumps(results, indent=1, default=str))
    for n in r.notes:
        print(f"note: {n}")
    for n in r.warnings:
        print(f"WARNING: {n}")
    for e in r.errors:
        print(f"FAIL: {e}")
    print(
        f"{'FAILED' if r.errors else 'OK'}: {release} ({len(slugs)} capital(s), "
        f"{len(r.errors)} failure(s), {len(r.warnings)} warning(s))"
    )
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
