"""Common steps 1, 2 and the OpenStreetMap layers: draw the city, cut the sea out, add the 1 km
buffer, and read the water, green spaces and ways of the analysis area.

The outline is the capital's OpenStreetMap administrative relation, read from a dated Geofabrik
extract and checked against the version pinned in capitals.yml (the run stops if the relation has
changed). The sea is cut out with OpenStreetMap's land polygons; lakes and rivers stay in the city.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import geopandas as gpd
import pyogrio
import requests
import shapely

from data_processing.core import osm
from data_processing.core.download import HEADERS, fetch_file, read_manifest, write_manifest
from data_processing.core.geo import lonlat_bbox, polygonal, reproject

log = logging.getLogger(__name__)

# Version of the selection and storage below: a change invalidates the cached reads.
OSM_READER_VERSION = 2


def capital_config(capital: str, capitals: dict) -> dict:
    if capital not in capitals:
        raise KeyError(f"unknown capital {capital!r}; see conf/base/parameters/capitals.yml")
    cfg = dict(capitals[capital])
    if not cfg.get("osm_relation") or not cfg.get("osm_version"):
        raise ValueError(
            f"{capital}: the OpenStreetMap relation and its version must be pinned in "
            "capitals.yml before it can run"
        )
    return {"slug": capital, **cfg}


def download_osm_extract(capital: str, capitals: dict, sources: dict, paths: dict) -> dict:
    """The capital's Geofabrik extract, dated (``extract_date``, YYMMDD) or ``latest``. Kept in
    ``data/01_raw/osm/<region>/`` with its md5 checked, its header timestamp and its sha256, and
    never downloaded again once there."""
    cfg = capital_config(capital, capitals)
    src = sources["osm"]
    region = cfg.get("osm_extract")
    if not region:
        raise ValueError(f"{capital}: set osm_extract (a Geofabrik region) in capitals.yml")
    base = region.rsplit("/", 1)[-1]
    name = f"{base}-{src['extract_date']}.osm.pbf"
    url = f"{src['geofabrik_url']}/{region}-{src['extract_date']}.osm.pbf"
    folder = Path(paths["raw"]) / "osm" / base
    path = fetch_file(url, folder, name=name, allow_404=True)
    if path is None:
        raise FileNotFoundError(
            f"{url} is not (or no longer) on Geofabrik: choose another extract_date in "
            "sources.yml (Geofabrik keeps recent daily files and every 1 January)"
        )
    manifest = read_manifest(folder)
    entry = manifest["files"][name]
    if "md5" not in entry:
        r = requests.get(url + ".md5", headers=HEADERS, timeout=60)
        r.raise_for_status()
        expected = r.text.split()[0]
        h = hashlib.md5()  # noqa: S324 - Geofabrik publishes md5 checksums
        with path.open("rb") as f:
            while b := f.read(1 << 20):
                h.update(b)
        if h.hexdigest() != expected:
            path.unlink()
            raise ValueError(f"{name}: md5 differs from Geofabrik's, the file was removed")
        entry["md5"] = expected
        entry["header"] = osm.extract_header(str(path))
        write_manifest(folder, manifest)
    return {
        "file": str(path),
        "region": region,
        "url": url,
        "extract_date": src["extract_date"],
        "timestamp": entry["header"]["timestamp"],
        "sequence_number": entry["header"]["sequence_number"],
        "bytes": entry["bytes"],
        "sha256": entry["sha256"],
        "md5": entry["md5"],
        "downloaded": entry["downloaded"],
    }


def _cache(folder: Path, key: dict) -> dict | None:
    p = folder / "read.json"
    if p.exists():
        d = json.loads(p.read_text())
        if d.get("key") == key:
            return d["value"]
    return None


def _store(folder: Path, key: dict, value: dict) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "read.json").write_text(json.dumps({"key": key, "value": value}, indent=1))
    return value


def read_boundary(osm_extract: dict, capital: str, capitals: dict, paths: dict) -> dict:
    """The relation's version (checked against the pin) and its assembled outline."""
    cfg = capital_config(capital, capitals)
    rid = cfg["osm_relation"]
    folder = Path(paths["intermediate"]) / "osm" / "boundary"
    key = {"extract": osm_extract["sha256"], "relation": rid, "reader": OSM_READER_VERSION}
    value = _cache(folder, key)
    if value is None:
        rel = osm.relations(osm_extract["file"]).get(rid)
        if rel is None:
            raise ValueError(f"{capital}: relation {rid} is not in {osm_extract['file']}")
        geom = osm.area_of_relation(osm_extract["file"], rid)
        if geom is None:
            raise ValueError(f"{capital}: relation {rid} could not be assembled into an area")
        value = _store(
            folder,
            key,
            {
                "relation": rid,
                "version": rel["version"],
                "relation_timestamp": rel["timestamp"],
                "name": rel["tags"].get("name"),
                "admin_level": rel["tags"].get("admin_level"),
                "wikidata": rel["tags"].get("wikidata"),
                "geometry_sha256": hashlib.sha256(shapely.to_wkb(geom)).hexdigest(),
                "geometry": json.loads(shapely.to_geojson(geom)),
            },
        )
    if value["version"] != cfg["osm_version"]:
        raise ValueError(
            f"{capital}: relation {rid} is at version {value['version']} in the extract, "
            f"capitals.yml pins version {cfg['osm_version']}. Check the change, then update "
            "the pin."
        )
    return {**value, "osm_extract_timestamp": osm_extract["timestamp"]}


def download_land_polygons(sources: dict, paths: dict) -> dict:
    folder = Path(paths["raw"]) / "osm_land_polygons"
    path = fetch_file(sources["land_polygons"]["url"], folder)
    entry = read_manifest(folder)["files"][path.name]
    return {"file": str(path), "layer_path": sources["land_polygons"]["layer_path"], **entry}


def read_land(land: dict, bbox_lonlat, crs: str) -> shapely.Geometry:
    path = f"/vsizip/{land['file']}/{land['layer_path']}"
    df = pyogrio.read_dataframe(path, bbox=tuple(bbox_lonlat))
    if df.crs is None or df.crs.to_epsg() != 4326:
        raise ValueError(f"unexpected CRS for the land polygons: {df.crs}")
    geoms = reproject(df.geometry.values, "EPSG:4326", crs)
    return polygonal(shapely.union_all(shapely.make_valid(geoms)))


def build_boundaries(boundary_source: dict, land: dict, method: dict) -> tuple:
    """Boundary, city (boundary minus the sea), analysis area (city + 1 km) and the sea."""
    crs = method["crs"]
    boundary = reproject(shapely.geometry.shape(boundary_source["geometry"]), "EPSG:4326", crs)
    boundary = polygonal(boundary)
    reach = boundary.buffer(method["buffer_m"] + 500)
    land_geom = read_land(land, lonlat_bbox(reach, crs, pad_deg=0.01), crs)
    city = polygonal(boundary.intersection(land_geom))
    analysis = polygonal(city.buffer(method["buffer_m"]))
    frame = shapely.box(*analysis.bounds).buffer(200, join_style="mitre")
    sea = polygonal(frame.difference(land_geom))
    gdf = gpd.GeoDataFrame(
        {"name": ["boundary", "city", "analysis", "sea"]},
        geometry=[boundary, city, analysis, sea],
        crs=crs,
    )
    stats = {
        **{k: v for k, v in boundary_source.items() if k != "geometry"},
        "land_polygons": {
            "url": land["url"],
            "last_modified": land.get("last_modified"),
            "downloaded": land.get("downloaded"),
            "sha256": land.get("sha256"),
        },
        "boundary_km2": round(boundary.area / 1e6, 3),
        "city_km2": round(city.area / 1e6, 3),
        "sea_removed_km2": round((boundary.area - city.area) / 1e6, 3),
        "analysis_km2": round(analysis.area / 1e6, 3),
    }
    log.info(
        "city %.1f km² (boundary %.1f km², sea removed %.1f km²)",
        stats["city_km2"],
        stats["boundary_km2"],
        stats["sea_removed_km2"],
    )
    return gdf, stats


def read_osm(osm_extract: dict, boundaries: gpd.GeoDataFrame, method: dict, paths: dict) -> dict:
    """Water, green spaces and every way with a highway tag over the analysis area (its bounding
    box plus 0.005°, which covers the 200 m margin kept around green spaces), with the same
    selections as before: water and green spaces as closed ways and as multipolygon relations
    (nature reserves also as boundary relations), assembled by libosmium."""
    area = boundaries.set_index("name").geometry["analysis"]
    bbox = [round(v, 6) for v in lonlat_bbox(area, method["crs"], pad_deg=0.005)]
    green_tags = method["rule300"]["green_tags"]
    folder = Path(paths["intermediate"]) / "osm" / "features"
    key = {
        "extract": osm_extract["sha256"],
        "bbox": bbox,
        "green_tags": green_tags,
        "reader": OSM_READER_VERSION,
    }
    value = _cache(folder, key)
    if value is not None:
        return value
    rels = osm.relations(osm_extract["file"])
    water_rel = {r for r, d in rels.items() if osm.water_selected(d["tags"], "relation")}
    green_rel = {
        r for r, d in rels.items() if osm.green_selected(d["tags"], "relation", green_tags)
    }

    def keep_way(tags):
        t = dict(tags)
        out = set()
        if "highway" in t:
            out.add("highway")
        if osm.water_selected(t, "way") or osm.green_selected(t, "way", green_tags):
            out.add("area")
        return out

    f = osm.read_features(osm_extract["file"], bbox, water_rel | green_rel, keep_way)
    # relation areas carry the relation's own tags (libosmium leaves out `type`), and are chosen
    # by the relation ids selected above
    rows = [("way", i, t, g) for i, t, g in f["closed"]]
    rows += [("relation", i, rels[i]["tags"], g) for i, _, g in f["areas"]]

    def frame(selected) -> gpd.GeoDataFrame:
        sel = [r for r in rows if selected(r)]
        return gpd.GeoDataFrame(
            {
                "osm_type": [r[0] for r in sel],
                "osm_id": [r[1] for r in sel],
                "tags": [osm.tags_json(r[2]) for r in sel],
            },
            geometry=[r[3] for r in sel],
            crs="EPSG:4326",
        )

    water = frame(
        lambda r: r[1] in water_rel if r[0] == "relation" else osm.water_selected(r[2], "way")
    )
    green = frame(
        lambda r: (
            r[1] in green_rel if r[0] == "relation" else osm.green_selected(r[2], "way", green_tags)
        )
    )
    folder.mkdir(parents=True, exist_ok=True)
    water.to_parquet(folder / "water.parquet")
    green.to_parquet(folder / "green.parquet")
    with (folder / "highways.jsonl").open("w", encoding="utf-8") as fh:
        for w in f["ways"]:
            fh.write(json.dumps(w, ensure_ascii=False, separators=(",", ":")) + "\n")
    in_bbox_rel = {r[1] for r in rows if r[0] == "relation"}
    value = {
        "water": str(folder / "water.parquet"),
        "green": str(folder / "green.parquet"),
        "highways": str(folder / "highways.jsonl"),
        "extract_timestamp": osm_extract["timestamp"],
        "bbox": bbox,
        "counts": {
            "highway_ways": len(f["ways"]),
            "water_areas": len(water),
            "green_areas": len(green),
            "relations_selected_in_extract": len(water_rel | green_rel),
            "relation_areas_in_bbox": len(in_bbox_rel),
            "relation_areas_invalid_in_extract": f["areas_invalid"],
        },
    }
    log.info("OpenStreetMap: %s", value["counts"])
    return _store(folder, key, value)


def osm_polygons(path: str, crs: str) -> gpd.GeoDataFrame:
    """Polygons read by ``read_osm`` (closed ways and assembled relations), with their tags."""
    gdf = gpd.read_parquet(path)
    gdf["tags"] = [json.loads(t) for t in gdf["tags"]]
    gdf = gdf.to_crs(crs)
    gdf["geometry"] = [polygonal(g) for g in gdf.geometry]
    return gdf[~gdf.geometry.is_empty].reset_index(drop=True)


def build_water(osm_features: dict, boundaries: gpd.GeoDataFrame, method: dict) -> gpd.GeoDataFrame:
    """Water over the analysis area: OSM water areas plus the sea, as one layer of polygons."""
    crs = method["crs"]
    b = boundaries.set_index("name").geometry
    frame = shapely.box(*b["analysis"].bounds).buffer(200, join_style="mitre")
    inland = osm_polygons(osm_features["water"], crs)
    inland_geom = polygonal(shapely.union_all(inland.geometry.values)).intersection(frame)
    rows = [("sea", polygonal(b["sea"]))]
    rows.append(("inland", polygonal(inland_geom.difference(b["sea"]))))
    gdf = gpd.GeoDataFrame({"kind": [k for k, _ in rows]}, geometry=[g for _, g in rows], crs=crs)
    log.info(
        "water: %d OSM areas, inland %.1f km², sea %.1f km² (in the frame)",
        len(inland),
        rows[1][1].area / 1e6,
        rows[0][1].area / 1e6,
    )
    return gdf
