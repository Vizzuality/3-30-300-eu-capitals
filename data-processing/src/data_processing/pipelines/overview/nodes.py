"""The capital page's overview: the water of its context rectangle (``context.pmtiles``).

Every water in the rectangle (summary.json › context): the sea (outside OpenStreetMap's land
polygons) and the lakes and rivers of the Geofabrik extracts on disk, with the pipeline's water
selection. Away from the city and its 1 km band it is slimmed for the overview (``slim_water``);
in the band it is kept whole, as ``city.pmtiles`` has it. Then simplified for the archive's last
zoom. Extracts that the rectangle needs but that are not on disk are left out and listed
(``capitals.yml`` › ``context_extracts``): never downloaded here.
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
from pathlib import Path

import geopandas as gpd
import shapely

from data_processing.core import osm
from data_processing.core.geo import polygon_parts, polygonal, reproject
from data_processing.core.overview import ground_m_per_px, slim_water
from data_processing.core.tiles import drop_metadata
from data_processing.pipelines.boundaries.nodes import (
    capital_config,
    context_regions,
    extract_file,
    read_land,
)
from data_processing.pipelines.context.nodes import _write
from data_processing.pipelines.export.nodes import capital_dir

log = logging.getLogger(__name__)


def read_water(files: list[str], bbox) -> list:
    """Water areas (EPSG:4326) whose envelope meets ``bbox``, from several extracts, each kept
    once: closed ways and assembled multipolygons with the pipeline's water selection."""
    parts = []
    for f in files:
        rels = osm.relations(f)
        water_rel = {r for r, d in rels.items() if osm.water_selected(d["tags"], "relation")}

        def keep_way(tags):
            return {"area"} if osm.water_selected(dict(tags), "way") else set()

        parts.append(osm.read_features(f, bbox, water_rel, keep_way))
    feats = osm.merge_features(parts)
    return [g for _, _, g in feats["closed"]] + [g for _, _, g in feats["areas"]]


def context_geometry(water, near, lat: float, tile_zooms, w: dict):
    """The water drawn: slimmed away from ``near`` (the city and its 1 km band), whole in it,
    simplified to ``tolerance_px`` at the archive's last zoom (EPSG:3035 metres)."""
    slim = slim_water(
        water, ground_m_per_px(lat, w["slim_zoom"]), w["min_width_px"], w["min_piece_px"]
    )
    drawn = polygonal(shapely.union_all([slim, water.intersection(near)]))
    tol = w["tolerance_px"] * ground_m_per_px(lat, max(w["tolerance_zoom"], tile_zooms[1]))
    return polygonal(shapely.simplify(drawn, tol, preserve_topology=True)), tol


def context_water(
    capital: str,
    summary_json: dict,
    boundaries: gpd.GeoDataFrame,
    land_polygons_source: dict,
    capitals: dict,
    sources: dict,
    overview: dict,
    paths: dict,
) -> tuple[str, dict]:
    t0 = time.time()
    cfg = capital_config(capital, capitals)
    crs = boundaries.crs.to_string()
    ctx = summary_json["context"]
    bbox, tile_zooms = ctx["bbox"], summary_json["zooms"]["context"]
    lat = (bbox[1] + bbox[3]) / 2
    box = reproject(shapely.segmentize(shapely.box(*bbox), 0.01), "EPSG:4326", crs)
    land = read_land(land_polygons_source, bbox, crs).intersection(box)
    sea = polygonal(box.difference(land))
    used, missing = [], []
    for region in context_regions(cfg):
        f = extract_file(region, sources, paths)
        (used if f.exists() else missing).append((region, f))
    geoms = read_water([str(f) for _, f in used], bbox)
    inland = reproject(polygonal(shapely.union_all(shapely.make_valid(geoms))), "EPSG:4326", crs)
    water = polygonal(shapely.union_all([sea, polygonal(inland).intersection(box)]))
    near = boundaries.set_index("name").geometry["analysis"]
    drawn, tol = context_geometry(water, near, lat, tile_zooms, overview["water"])
    ll = reproject(drawn, crs, "EPSG:4326")
    feats = (
        {
            "type": "Feature",
            "geometry": json.loads(shapely.to_geojson(p)),
            "properties": {},
            "tippecanoe": {"layer": "water", "minzoom": tile_zooms[0], "maxzoom": tile_zooms[1]},
        }
        for p in polygon_parts(ll)
    )
    out = Path(paths["intermediate"]) / "tiles" / "context.geojsonseq.gz"
    n = _write(out, feats)
    stats = {
        "bbox": bbox,
        "tile_zooms": tile_zooms,
        "extracts": [r for r, _ in used],
        "missing_extracts": [r for r, _ in missing],
        "osm_water_areas": len(geoms),
        "sea_km2": round(sea.area / 1e6, 1),
        "water_km2": round(water.area / 1e6, 1),
        "drawn_km2": round(drawn.area / 1e6, 1),
        "pieces": n,
        "points": int(shapely.get_num_coordinates(drawn)),
        "tolerance_m": round(tol, 2),
        "seconds": round(time.time() - t0),
    }
    if missing:
        log.warning("%s: extracts not on disk, left out: %s", capital, stats["missing_extracts"])
    log.info("context water: %s", {k: v for k, v in stats.items() if k != "bbox"})
    return str(out), stats


def context_archive(
    capital: str,
    context_tiles: str,
    context_orientation_tiles: str,
    summary_json: dict,
    overview: dict,
    paths: dict,
    tippecanoe_dir: str,
) -> tuple[str, dict]:
    """capitals/<slug>/context.pmtiles (layers water, roads, places), by Tippecanoe at the zooms of
    summary.json › zooms.context (the metadata without Tippecanoe's command line)."""
    t0 = time.time()
    target = capital_dir(paths, capital) / "context.pmtiles"
    target.parent.mkdir(parents=True, exist_ok=True)
    exe = Path(tippecanoe_dir) / "tippecanoe"
    if not exe.exists():
        raise FileNotFoundError(
            f"{exe} not found: run `just install-tippecanoe` (felt/tippecanoe v2.82.0)"
        )
    z0, z1 = summary_json["zooms"]["context"]
    flags = [f"-Z{z0}", f"-z{z1}", *overview["tippecanoe_flags"]]
    cmd = [str(exe), "-o", str(target), "--force", *flags, f"--name={capital}-context", "-q"]
    subprocess.run([*cmd, context_tiles, context_orientation_tiles], check=True)
    drop_metadata(target)  # Tippecanoe's command line, with this machine's absolute paths
    stats = {"bytes": target.stat().st_size, "flags": flags, "seconds": round(time.time() - t0)}
    log.info("context.pmtiles: %.0f kB", stats["bytes"] / 1000)
    return str(target), stats
