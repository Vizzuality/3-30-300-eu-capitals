"""OpenStreetMap from a Geofabrik extract (``.osm.pbf``), read with pyosmium.

Multipolygon and boundary relations are assembled by libosmium's area assembler (the one behind
the osmium tool), which uses the member roles and repairs nothing silently: a relation it cannot
close produces no area, and is counted. Closed ways are turned into polygons directly.

Reading is done in passes over the file:

1. relations only (seconds): their tags, members and versions, to choose the relations whose
   areas are needed;
2. the boundary relation's area (one pass with node locations);
3. every feature of the analysis area: ways with a ``highway`` tag (with their node ids, for the
   network's topology), closed ways and relation areas of water and green spaces.

The selections are written out in ``water_selected`` and ``green_selected``.
"""

from __future__ import annotations

import json
import logging

import osmium
import shapely
from osmium.osm import osm_entity_bits

log = logging.getLogger(__name__)

WATER_TAGS = (("natural", "water"), ("waterway", "riverbank"), ("landuse", "reservoir"))


def extract_header(path: str) -> dict:
    with osmium.io.Reader(path, osm_entity_bits.NOTHING) as r:
        h = r.header()
        return {
            "timestamp": h.get("osmosis_replication_timestamp") or h.get("timestamp"),
            "sequence_number": h.get("osmosis_replication_sequence_number"),
            "generator": h.get("generator"),
        }


def relations(path: str) -> dict[int, dict]:
    """Every relation of the file: tags, version and members (type, ref, role)."""
    out = {}
    for o in osmium.FileProcessor(path, osm_entity_bits.RELATION):
        out[o.id] = {
            "tags": dict(o.tags),
            "version": o.version,
            "timestamp": o.timestamp.isoformat() if o.timestamp else None,
            "members": [(m.type, m.ref, m.role) for m in o.members],
        }
    return out


def water_selected(tags: dict, kind: str) -> bool:
    """way[natural=water], relation[natural=water][type=multipolygon], same for
    waterway=riverbank and landuse=reservoir."""
    if not any(tags.get(k) == v for k, v in WATER_TAGS):
        return False
    return kind == "way" or tags.get("type") == "multipolygon"


def green_selected(tags: dict, kind: str, green_tags: dict) -> bool:
    """way[k=v] and relation[k=v][type=multipolygon] for every green tag, plus
    relation[leisure=nature_reserve][type=boundary]."""
    if not any(tags.get(k) in vs for k, vs in green_tags.items()):
        return False
    if kind == "way":
        return True
    t = tags.get("type")
    return t == "multipolygon" or (t == "boundary" and tags.get("leisure") == "nature_reserve")


def _area_geometry(area, wkb: osmium.geom.WKBFactory):
    try:
        return shapely.from_wkb(wkb.create_multipolygon(area))
    except (RuntimeError, shapely.errors.GEOSException):
        return None


def areas_of_relations(path: str, rids) -> dict:
    """Assembled (Multi)Polygons of some relations (EPSG:4326), in one pass; a relation that
    cannot be closed is missing from the result."""
    rids = set(rids)
    wkb = osmium.geom.WKBFactory()
    fp = (
        osmium.FileProcessor(path)
        .with_areas(osmium.filter.IdFilter(sorted(rids)))
        .with_filter(osmium.filter.EntityFilter(osm_entity_bits.AREA))
    )
    out = {}
    for o in fp:
        if o.is_area() and not o.from_way() and o.orig_id() in rids:
            geom = _area_geometry(o, wkb)
            if geom is not None:
                out[o.orig_id()] = geom
    return out


def area_of_relation(path: str, rid: int):
    """Assembled (Multi)Polygon of one relation (EPSG:4326), or None if it cannot be closed."""
    return areas_of_relations(path, [rid]).get(rid)


def _envelope_hits(lons, lats, bbox) -> bool:
    w, s, e, n = bbox
    return min(lons) <= e and max(lons) >= w and min(lats) <= n and max(lats) >= s


def read_features(path: str, bbox, area_relations: set[int], keep_way) -> dict:
    """Features whose envelope meets ``bbox`` (west, south, east, north):

    - ``ways``: ways for which ``keep_way(tags)`` contains "highway", as dicts (id, tags, nodes,
      geometry [{lon, lat}]);
    - ``closed``: closed ways for which ``keep_way(tags)`` contains "area": (id, tags, polygon);
    - ``areas``: assembled areas of the relations in ``area_relations``: (id, tags, polygon).
    """
    wkb = osmium.geom.WKBFactory()
    fp = (
        osmium.FileProcessor(path)
        .with_areas(osmium.filter.IdFilter(sorted(area_relations)))
        .with_filter(osmium.filter.EntityFilter(osm_entity_bits.WAY | osm_entity_bits.AREA))
        .with_filter(
            osmium.filter.KeyFilter("highway", "natural", "waterway", "landuse", "leisure")
        )
    )
    ways, closed, areas = [], [], []
    failed = []
    for o in fp:
        if o.is_area():
            if o.from_way() or o.orig_id() not in area_relations:
                continue
            g = _area_geometry(o, wkb)
            if g is None:
                failed.append(o.orig_id())
                continue
            if shapely.intersects(g, shapely.box(*bbox)):
                areas.append((o.orig_id(), dict(o.tags), g))
            continue
        what = keep_way(o.tags)
        if not what:
            continue
        nodes = [(n.ref, n.lon, n.lat) for n in o.nodes if n.location.valid()]
        if len(nodes) < 2:
            continue
        lons = [n[1] for n in nodes]
        lats = [n[2] for n in nodes]
        if not _envelope_hits(lons, lats, bbox):
            continue
        if "highway" in what:
            ways.append(
                {
                    "id": o.id,
                    "tags": dict(o.tags),
                    "nodes": [n[0] for n in nodes],
                    "geometry": [{"lon": n[1], "lat": n[2]} for n in nodes],
                }
            )
        if "area" in what and o.is_closed() and len(nodes) >= 4:
            closed.append((o.id, dict(o.tags), shapely.Polygon(list(zip(lons, lats, strict=True)))))
    return {
        "ways": ways,
        "closed": closed,
        "areas": areas,
        "areas_invalid": len(failed),
        "invalid_ids": failed,
    }


def merge_features(parts: list[dict]) -> dict:
    """Features read from several extracts (``read_features`` of each), every object once: the
    first copy of each way and relation area is kept (neighbouring extracts overlap along their
    edges, and each holds the ways and multipolygons crossing its edge whole). A relation counts
    as invalid only when no extract could assemble it."""
    out = {"ways": [], "closed": [], "areas": []}
    for kind, key in (("ways", lambda w: w["id"]), ("closed", lambda c: c[0])):
        seen = set()
        for p in parts:
            for item in p[kind]:
                if key(item) not in seen:
                    seen.add(key(item))
                    out[kind].append(item)
    seen = set()
    for p in parts:
        for item in p["areas"]:
            if item[0] not in seen:
                seen.add(item[0])
                out["areas"].append(item)
    invalid = set()
    for p in parts:
        invalid |= set(p.get("invalid_ids", ()))
    out["invalid_ids"] = sorted(invalid - seen)
    out["areas_invalid"] = len(out["invalid_ids"])
    return out


def tags_json(tags: dict) -> str:
    return json.dumps(tags, ensure_ascii=False, sort_keys=True)


def read_main_roads_and_places(
    path: str, bbox, place_bbox, classes: set[str], place_kinds: set[str]
) -> dict:
    """The overview's reference layers, in one pass with node locations:

    - ``roads``: ways whose ``highway`` is one of ``classes`` and whose envelope meets ``bbox``,
      as dicts (id, tags, nodes, lon, lat);
    - ``places``: nodes whose ``place`` is one of ``place_kinds`` inside ``place_bbox``, as dicts
      (id, tags, lon, lat).
    """
    fp = (
        osmium.FileProcessor(path)
        .with_locations()
        .with_filter(osmium.filter.KeyFilter("highway", "place"))
    )
    roads, places = [], []
    pw, ps, pe, pn = place_bbox
    for o in fp:
        if o.is_node():
            if o.tags.get("place") in place_kinds and o.location.valid():
                lon, lat = o.location.lon, o.location.lat
                if pw <= lon <= pe and ps <= lat <= pn:
                    places.append({"id": o.id, "tags": dict(o.tags), "lon": lon, "lat": lat})
            continue
        if not o.is_way() or o.tags.get("highway") not in classes:
            continue
        nodes = [(n.ref, n.lon, n.lat) for n in o.nodes if n.location.valid()]
        if len(nodes) < 2:
            continue
        lons = [n[1] for n in nodes]
        lats = [n[2] for n in nodes]
        if not _envelope_hits(lons, lats, bbox):
            continue
        roads.append(
            {
                "id": o.id,
                "tags": dict(o.tags),
                "nodes": [n[0] for n in nodes],
                "lon": lons,
                "lat": lats,
            }
        )
    return {"roads": roads, "places": places}


def admin_relations(rels: dict, above_level: int, max_level: int = 11) -> dict[int, int]:
    """Administrative boundary relations finer than ``above_level`` (up to ``max_level``): their
    admin level, by relation id."""
    out = {}
    for rid, d in rels.items():
        t = d["tags"]
        if t.get("boundary") != "administrative" or t.get("type") not in (
            "boundary",
            "multipolygon",
        ):
            continue
        try:
            level = int(t.get("admin_level", ""))
        except ValueError:
            continue
        if above_level < level <= max_level:
            out[rid] = level
    return out
