"""Canopy height download (shared by rule 3, rule 30 and the canopy layer)."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

from data_processing.core.canopy import build_chm
from data_processing.core.download import fetch_file, now_utc, read_manifest, write_manifest
from data_processing.core.geo import lonlat_bbox
from data_processing.core.grid import Grid

log = logging.getLogger(__name__)


def download_canopy_height(
    capital: str, grid: dict, boundaries: gpd.GeoDataFrame, method: dict, sources: dict, paths: dict
) -> dict:
    src = sources["canopy_height"]
    folder = Path(paths["raw"]) / "canopy_height" / capital
    g = Grid.from_dict(grid)
    fine = g.fine(method["chm_res_m"])
    index = fetch_file(f"{src['base_url']}/tiles.geojson", folder)
    tiles_gdf = gpd.read_file(index)
    bbox = shapely.box(*lonlat_bbox(shapely.box(*g.bounds), g.crs))
    tiles = sorted(tiles_gdf[tiles_gdf.intersects(bbox)]["tile"].astype(str))

    target = folder / "chm_1m_3035.tif"
    manifest = read_manifest(folder)
    query = {"tiles": tiles, "grid": fine.to_dict()}
    entry = manifest["files"].get(target.name)
    if not (entry and target.exists() and entry.get("query") == query):
        seconds = build_chm(src["base_url"], tiles, fine, target, nodata=src["nodata"])
        manifest = read_manifest(folder)
        manifest["files"][target.name] = {
            "url": f"{src['base_url']}/chm/<quadkey>.tif",
            "query": query,
            "downloaded": now_utc(),
            "seconds": round(seconds),
            "bytes": target.stat().st_size,
        }
        write_manifest(folder, manifest)

    # imagery acquisition dates of the area (per-polygon metadata of each tile)
    area = boundaries.set_index("name").geometry["city"]
    city_ll = gpd.GeoSeries([area], crs=method["crs"]).to_crs(4326).iloc[0]
    parts = []
    for t in tiles:
        p = fetch_file(f"{src['base_url']}/metadata/{t}.geojson", folder)
        parts.append(gpd.read_file(p))
    meta = pd.concat(parts, ignore_index=True)
    meta = meta[meta.intersects(city_ll)]
    dates = pd.to_datetime(meta["acq_date"]).dt.strftime("%Y-%m-%d")
    return {
        "file": str(target),
        "tiles": tiles,
        "imagery_dates_in_city": {
            "min": dates.min(),
            "max": dates.max(),
            "n_polygons": int(len(dates)),
        },
        "downloaded": read_manifest(folder)["files"][target.name]["downloaded"],
        "index": json.loads((folder / "manifest.json").read_text())["files"]["tiles.geojson"],
    }
