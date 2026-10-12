"""Contextual layers, the things behind a result drawn on the map (water, parks, streets and
their names, canopy, trees, buildings and facades), as Tippecanoe input.

Each node writes newline-delimited GeoJSON (EPSG:4326) where every feature carries its
``tippecanoe`` layer and zoom range; the export pipeline turns them into ``city.pmtiles``.
Layers and attributes are documented in docs/release-format.md.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import shapely
from rasterio.features import shapes
from rasterio.windows import Window

from data_processing.core.download import fetch_file
from data_processing.core.geo import polygon_parts, polygonal, reproject
from data_processing.core.labels import Measure, label_candidates
from data_processing.core.network import read_ways
from data_processing.core.water import hatch_marks, shore_lines

log = logging.getLogger(__name__)

# Streets drawn on the map: streets, and paths that are not sidewalks
# or crossings; service roads and steps are left out. Rank 1 = most important.
STREET_RANK = {
    "motorway": 1,
    "trunk": 1,
    "primary": 2,
    "secondary": 3,
    "tertiary": 4,
    "unclassified": 5,
    "residential": 5,
    "living_street": 6,
    "pedestrian": 6,
}
PATHS = {"footway", "path", "cycleway"}
PATH_RANK = 8


def _write(path: Path, features) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for f in features:
            fh.write(json.dumps(f, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    tmp.replace(path)
    return n


def feature(geom, props: dict, layer: str, minzoom: int, maxzoom: int = 16) -> dict:
    return {
        "type": "Feature",
        "geometry": json.loads(shapely.to_geojson(geom)),
        "properties": props,
        "tippecanoe": {"layer": layer, "minzoom": minzoom, "maxzoom": maxzoom},
    }


def _ll(geoms, crs):
    return reproject(geoms, crs, "EPSG:4326")


def _area(boundaries: gpd.GeoDataFrame):
    return boundaries.set_index("name").geometry["analysis"]


# ------------------------------------------------------------------ water and land
def water_features(
    water: gpd.GeoDataFrame, boundaries: gpd.GeoDataFrame, method: dict, tiles: dict, paths: dict
) -> tuple[str, dict]:
    crs = method["crs"]
    area = _area(boundaries)
    wet = polygonal(shapely.union_all(water.geometry.values)).intersection(area)
    wet = polygonal(wet)
    land = polygonal(area.difference(wet))
    z = tiles["layers"]
    small = tiles["water_min_overview_m2"]
    feats = [feature(_ll(land, crs), {}, "land", z["land"])]
    open_water = polygonal(wet.buffer(-6, join_style="round"))
    for kind, geom in ((0, wet), (1, open_water)):
        for part in polygon_parts(geom):
            mz = z["water"] if part.area >= small else z["water_small"]
            feats.append(feature(_ll(part, crs), {"kind": kind}, "water", mz))
    for kind, line in shore_lines(wet, area):
        if not line.is_empty:
            mz = z["shore"] if kind == 0 else z["ripples"]
            feats.append(feature(_ll(line, crs), {"kind": kind}, "shore", mz))
    marks = hatch_marks(polygonal(wet.buffer(-30)))
    if marks:
        ml = _ll(shapely.MultiLineString(marks), crs)
        for m in shapely.get_parts(ml):
            feats.append(feature(m, {}, "water_marks", z["water_marks"]))
    out = Path(paths["intermediate"]) / "tiles" / "water.geojsonseq"
    n = _write(out, feats)
    stats = {"features": n, "water_km2": round(wet.area / 1e6, 3), "hatch_marks": len(marks)}
    log.info("water layers: %d features, %d hatch marks", n, len(marks))
    return str(out), stats


# ------------------------------------------------------------------ parks
def park_features(
    parks: gpd.GeoDataFrame, boundaries: gpd.GeoDataFrame, method: dict, tiles: dict, paths: dict
) -> str:
    area = _area(boundaries)
    feats = []
    for row in parks.itertuples():
        g = polygonal(row.geometry.intersection(area))
        if g.is_empty:
            continue
        props = {
            "pid": int(row.pid),
            "kind": row.kind,
            "ha": round(row.area_m2 / 1e4, 2),
            "name": row.name if isinstance(row.name, str) else "",
        }
        feats.append(feature(_ll(g, method["crs"]), props, "parks", tiles["layers"]["parks"]))
    out = Path(paths["intermediate"]) / "tiles" / "parks.geojsonseq"
    _write(out, feats)
    return str(out)


# ------------------------------------------------------------------ streets and names
def download_fonts(sources: dict, paths: dict) -> dict:
    folder = Path(paths["raw"]) / "fonts"
    f = sources["fonts"]
    return {
        "figtree": str(fetch_file(f["figtree"], folder, name="Figtree.ttf")),
        "noto_sans": str(fetch_file(f["noto_sans"], folder, name="NotoSans.ttf")),
    }


def street_class(tags: dict) -> tuple[int, int] | None:
    """(rank, is_path) of a way drawn on the map, or None."""
    hw = tags.get("highway", "")
    base = hw.removesuffix("_link")
    if base in STREET_RANK:
        return STREET_RANK[base], 0
    if (
        hw in PATHS
        and tags.get("footway") not in ("sidewalk", "crossing")
        and tags.get("cycleway") != "crossing"
        and tags.get("path") not in ("sidewalk", "crossing")
    ):
        return PATH_RANK, 1
    return None


def street_features(
    osm_features: dict,
    parks: gpd.GeoDataFrame,
    boundaries: gpd.GeoDataFrame,
    fonts: dict,
    method: dict,
    tiles: dict,
    paths: dict,
) -> tuple[str, dict]:
    t0 = time.time()
    crs = method["crs"]
    area = _area(boundaries)
    area_ll = _ll(area, crs)
    ways = read_ways(osm_features["highways"])
    feats = []
    for w in ways:
        tags = w.get("tags", {})
        cls = street_class(tags)
        if cls is None:
            continue
        coords = [(p["lon"], p["lat"]) for p in w["geometry"] if p is not None]
        if len(coords) < 2:
            continue
        g = shapely.LineString(coords).intersection(area_ll)
        if g.is_empty:
            continue
        props = {"rank": cls[0], "path": cls[1], "name": tags.get("name", ""), "id": w["id"]}
        feats.append(feature(g, props, "streets", tiles["layers"]["streets"]))
    area_merc = reproject(area, crs, "EPSG:3857")
    labels, widths = label_candidates(
        ways, area_merc, Measure(fonts["figtree"], fonts["noto_sans"])
    )
    out = Path(paths["intermediate"]) / "tiles" / "streets.geojsonseq"
    _write(out, feats + labels)
    names = "".join(widths) + "".join(n_ for n_ in parks["name"].dropna())
    stats = {
        "street_features": len(feats),
        "label_candidates": {
            str(z): sum(1 for f in labels if f["properties"]["z"] == z) for z in (15, 16)
        },
        "named_streets": len(widths),
        "label_chars": "".join(sorted(set(names) - {" "})),
        "seconds": round(time.time() - t0),
    }
    log.info("streets: %d features, %d label candidates", len(feats), len(labels))
    return str(out), stats


# ------------------------------------------------------------------ canopy and trees
def canopy_features(
    canopy_height_source: dict,
    boundaries: gpd.GeoDataFrame,
    method: dict,
    sources: dict,
    tiles: dict,
    paths: dict,
    band_rows: int = 1000,
) -> tuple:
    """1 m pixels with vegetation >= 3 m turned into shapes, simplified (``canopy_simplify_m``),
    without the shapes smaller than ``canopy_min_area_m2``."""
    t0 = time.time()
    crs = method["crs"]
    area = _area(boundaries)
    hmin = method["rule30"]["canopy_min_height_m"]
    nodata = sources["canopy_height"]["nodata"]
    tol = tiles["canopy_simplify_m"]
    min_area = tiles["canopy_min_area_m2"]
    shapely.prepare(area)
    out = Path(paths["intermediate"]) / "tiles" / "canopy.geojsonseq"
    out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with rasterio.open(canopy_height_source["file"]) as src, out.open("w") as fh:
        for r in range(0, src.height, band_rows):
            h = min(band_rows, src.height - r)
            a = src.read(1, window=Window(0, r, src.width, h))
            tall = ((a != nodata) & (a >= hmin)).astype(np.uint8)
            tr = src.window_transform(Window(0, r, src.width, h))
            geoms = [
                shapely.geometry.shape(g)
                for g, v in shapes(tall, mask=tall == 1, transform=tr)
                if v == 1
            ]
            if not geoms:
                continue
            geoms = shapely.simplify(np.array(geoms, dtype=object), tol, preserve_topology=True)
            geoms = geoms[shapely.area(geoms) >= min_area]
            inside = shapely.intersects(area, geoms)
            geoms = geoms[inside]
            cut = ~shapely.contains_properly(area, geoms)
            geoms[cut] = shapely.intersection(geoms[cut], area)
            geoms = geoms[~shapely.is_empty(geoms)]
            for raw in _ll(geoms, crs):
                g = polygonal(raw)
                if g.is_empty:
                    continue
                fh.write(
                    json.dumps(
                        feature(g, {}, "canopy", tiles["layers"]["canopy"]), separators=(",", ":")
                    )
                    + "\n"
                )
                n += 1
    log.info("canopy: %d shapes (%.0f s)", n, time.time() - t0)
    return str(out), {"shapes": n, "seconds": round(time.time() - t0)}


def tree_features(
    trees: pd.DataFrame, boundaries: gpd.GeoDataFrame, method: dict, tiles: dict, paths: dict
) -> str:
    area = _area(boundaries)
    keep = shapely.contains_xy(area, trees["x"].values, trees["y"].values)
    t = trees[keep]
    pts = reproject(shapely.points(t["x"].values, t["y"].values), method["crs"], "EPSG:4326")
    xy = shapely.get_coordinates(pts)
    z = tiles["layers"]["trees"]
    feats = (
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(x, 7), round(y, 7)]},
            "properties": {"id": int(i), "h": int(h)},
            "tippecanoe": {"layer": "trees", "minzoom": z, "maxzoom": 16},
        }
        for (x, y), i, h in zip(xy, t["tree"].values, t["height"].values, strict=True)
    )
    out = Path(paths["intermediate"]) / "tiles" / "trees.geojsonseq"
    _write(out, feats)
    return str(out)


# ------------------------------------------------------------------ buildings and facades
def lonlat_points(x, y, crs: str, decimals: int = 7):
    pts = reproject(shapely.points(x, y), crs, "EPSG:4326")
    xy = np.round(shapely.get_coordinates(pts), decimals)
    return xy[:, 0], xy[:, 1]


def building_features(
    buildings: gpd.GeoDataFrame,
    building_results: pd.DataFrame,
    facades: gpd.GeoDataFrame,
    method: dict,
    tiles: dict,
    paths: dict,
) -> tuple[str, pd.DataFrame]:
    """Buildings (id, score, r3, r30, r300, scored, cx, cy) and facades (sid, b, ok, n, orient,
    res: the building's residents shared by facade length).
    ``cx``, ``cy`` (longitude, latitude of the representative point, 7 decimals) also choose the
    building's evidence tile, so the returned table keeps them for the export."""
    crs = method["crs"]
    res = building_results.set_index("id")
    b = buildings[["id", "cx", "cy", "geometry"]].copy()
    lon, lat = lonlat_points(b["cx"].values, b["cy"].values, crs)
    b["lon"], b["lat"] = lon, lat
    z = tiles["layers"]
    geoms = _ll(b.geometry.values, crs)
    feats = []
    for row, g in zip(b.itertuples(), geoms, strict=True):
        r = res.loc[row.id]
        props = {
            "id": int(row.id),
            "score": int(r.score),
            "r3": int(r.r3),
            "r30": int(r.r30),
            "r300": int(r.r300),
            "scored": int(r.scored),
            "cx": float(row.lon),
            "cy": float(row.lat),
        }
        feats.append(feature(g, props, "buildings", z["buildings"]))
    fgeoms = _ll(facades.geometry.values, crs)
    total = facades.groupby("b")["length"].transform("sum").values
    fres = res["residents"].reindex(facades["b"].values).values * facades["length"].values / total
    for row, g, r_ in zip(facades.itertuples(), fgeoms, fres, strict=True):
        props = {
            "sid": int(row.sid),
            "b": int(row.b),
            "ok": int(row.ok),
            "n": int(row.n),
            "orient": str(row.orient),
            "res": round(float(r_), 1),
        }
        feats.append(feature(g, props, "facades", z["facades"]))
    out = Path(paths["intermediate"]) / "tiles" / "buildings.geojsonseq"
    _write(out, feats)
    return str(out), pd.DataFrame({"id": b["id"].values, "lon": lon, "lat": lat})
