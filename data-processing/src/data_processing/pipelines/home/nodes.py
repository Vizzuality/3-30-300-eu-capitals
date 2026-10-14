"""The Home map (``europe.pmtiles``): sea, countries and their borders, the coastline with two
ripple lines, a graticule and hatch marks on the open sea, from Natural Earth's 1:50m countries
(public domain), as vector tiles for zooms 0-7.

Countries of the release's capitals are flagged ``eu`` and given one of three tints, chosen so that
neighbours differ where they can. Natural Earth draws Northern Cyprus as a country of its own; the
map draws the whole island as Cyprus (``merge_into``), an EU member state in full. Islands too
small to see at a zoom are left out of its tiles: each piece of land appears from the first zoom at
which it covers ``islands.min_area_px2`` pixels (the largest of each country of the release at
every zoom), and the sea, the coast, its ripples and the hatch
marks of each zoom are drawn around the land shown there. Layers and attributes are documented in
docs/release-format.md.
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
import zipfile
from pathlib import Path

import numpy as np
import pyogrio
import shapely

from data_processing.core.download import fetch_file, read_manifest
from data_processing.core.geo import polygon_parts, polygonal, reproject
from data_processing.core.tiles import drop_metadata
from data_processing.core.water import hatch_marks
from data_processing.pipelines.context.nodes import _write

log = logging.getLogger(__name__)

WORK_CRS = "EPSG:3035"  # distances (ripples, open sea)
MAP_CRS = "EPSG:3857"  # the Home map's projection (hatch marks lie along its rows)


def download_natural_earth(sources: dict, paths: dict) -> dict:
    """Natural Earth's 1:50m countries, kept in ``data/01_raw/natural_earth/`` with its manifest;
    the version is the one the archive states (``*.VERSION.txt``) and must match the pin."""
    ne = sources["natural_earth"]
    folder = Path(paths["raw"]) / "natural_earth"
    path = fetch_file(ne["url"], folder)
    stem = path.name.removesuffix(".zip")
    with zipfile.ZipFile(path) as z:
        version = z.read(f"{stem}.VERSION.txt").decode("ascii", "replace").strip()
    if version != ne["version"]:
        raise ValueError(
            f"{path.name} is Natural Earth {version}, sources.yml pins {ne['version']}: check the "
            "new version, then update the pin"
        )
    entry = read_manifest(folder)["files"][path.name]
    return {"file": str(path), "layer": stem, "version": version, **entry}


def _rings(geom) -> list:
    return [g for g in shapely.get_parts(polygonal(geom)) if not g.is_empty]


def assign_tints(geoms: dict, n: int = 3, touch_m: float = 8000.0) -> dict:
    """One of ``n`` tints per country (largest first), avoiding the tints of countries within
    ``touch_m`` (neighbours, and coasts facing each other closely); when every tint is taken,
    the one least used around it."""
    tints: dict = {}
    for key in sorted(geoms, key=lambda k: (-geoms[k].area, k)):
        near = [tints[o] for o in tints if geoms[key].distance(geoms[o]) <= touch_m]
        counts = [near.count(t) for t in range(n)]
        tints[key] = int(np.argmin(counts))
    return tints


def graticule(frame_lonlat, step: float = 10.0) -> list:
    """Meridians and parallels every ``step`` degrees inside the frame, as (axis, degree, line)."""
    w, s, e, n = frame_lonlat
    out = []
    for lon in np.arange(np.ceil(w / step) * step, e + 1e-9, step):
        out.append(("meridian", float(lon), shapely.LineString([(lon, s), (lon, n)])))
    for lat in np.arange(np.ceil(s / step) * step, n + 1e-9, step):
        line = shapely.LineString([(x, lat) for x in np.linspace(w, e, 50)])
        out.append(("parallel", float(lat), line))
    return out


def _feature(geom, props: dict, layer: str, zooms: tuple[int, int]) -> dict:
    return {
        "type": "Feature",
        "geometry": json.loads(shapely.to_geojson(geom)),
        "properties": props,
        "tippecanoe": {"layer": layer, "minzoom": zooms[0], "maxzoom": zooms[1]},
    }


EARTH_M = 2 * np.pi * 6378137.0  # Web Mercator's circumference


def first_zoom(area_m2: float, lat: float, min_px2: float, tile_px: int, zooms: tuple[int, int]):
    """The first zoom (within ``zooms``) at which land of ``area_m2`` at latitude ``lat`` covers
    ``min_px2`` pixels of ``tile_px`` px tiles, or None when it never does there. Web Mercator
    enlarges it by 1 / cos(lat); each zoom by 4 in area."""
    for z in range(zooms[0], zooms[1] + 1):
        ground_m_per_px = EARTH_M / (tile_px * 2**z) * np.cos(np.radians(lat))
        if area_m2 / ground_m_per_px**2 >= min_px2:
            return z
    return None


def land_first_zooms(land, release_countries: dict, islands: dict, zooms: tuple[int, int]):
    """The pieces of ``land`` (EPSG:3035: islands, continents), the first zoom each shows from
    (``first_zoom``; None: never) and a function giving the piece a part of a country lies in.
    The largest piece of each country of the release shows at every zoom (Malta covers 4 px²
    only from zoom 4): a capital's country never vanishes from the map."""
    pieces = shapely.get_parts(land)
    lats = shapely.get_y(reproject(shapely.centroid(pieces), WORK_CRS, "EPSG:4326"))
    first = [
        first_zoom(p.area, lat, islands["min_area_px2"], islands["tile_px"], zooms)
        for p, lat in zip(pieces, lats, strict=True)
    ]
    tree = shapely.STRtree(pieces)

    def piece_of(part) -> int:
        return int(tree.query_nearest(part.representative_point())[0])

    for geom in release_countries.values():
        first[piece_of(max(polygon_parts(geom), key=lambda p: p.area))] = zooms[0]
    return pieces, first, piece_of


def zoom_bands(first: list[int], zooms: tuple[int, int]) -> list[tuple[int, int]]:
    """The zoom ranges over which the land shown stays the same, from the first zooms of its
    pieces: [(z0, z1), ...] covering ``zooms``."""
    starts = sorted({zooms[0], *(z for z in first if zooms[0] < z <= zooms[1])})
    return [(a, b - 1) for a, b in zip(starts, starts[1:], strict=False)] + [(starts[-1], zooms[1])]


def europe_features(
    natural_earth_source: dict, capitals: dict, home: dict, paths: dict
) -> tuple[str, dict]:
    """The Home map's features (EPSG:4326, Tippecanoe input)."""
    t0 = time.time()
    frame_ll = shapely.box(*home["frame"])
    frame = reproject(shapely.segmentize(frame_ll, 0.5), "EPSG:4326", WORK_CRS)
    df = pyogrio.read_dataframe(
        f"/vsizip/{natural_earth_source['file']}/{natural_earth_source['layer']}.shp",
        bbox=tuple(home["frame"]),
        columns=["ISO_A2_EH", "ADM0_A3", "NAME_EN"],
    )
    eu_codes = {c["country"] for c in capitals.values()}
    countries = {}
    for code, a3, geom in zip(df["ISO_A2_EH"], df["ADM0_A3"], df.geometry, strict=True):
        key = code if isinstance(code, str) and len(code) == 2 else a3
        key = home["merge_into"].get(key, key)
        g = polygonal(reproject(shapely.make_valid(geom), "EPSG:4326", WORK_CRS))
        g = polygonal(g.intersection(frame))
        if g.is_empty:
            continue
        if key in countries:
            g = polygonal(shapely.union_all([countries[key], g]))
        countries[key] = g
    missing = eu_codes - set(countries)
    if missing:
        raise ValueError(f"Natural Earth has no country for {sorted(missing)}")
    land = polygonal(shapely.union_all(list(countries.values())))
    eu = {k: g for k, g in countries.items() if k in eu_codes}
    tints = assign_tints(eu)

    def ll(g):
        return reproject(g, WORK_CRS, "EPSG:4326")

    zooms = (home["minzoom"], home["maxzoom"])
    pieces, first, piece_of = land_first_zooms(land, eu, home["islands"], zooms)

    def first_of(part):
        """The first zoom of the piece of land a part of a country lies in."""
        return first[piece_of(part)]

    bands = zoom_bands([z for z in first if z is not None], zooms)
    # the land appearing at each zoom, and all the land shown from each band on
    appears = {
        z: polygonal(shapely.union_all([p for p, f in zip(pieces, first, strict=True) if f == z]))
        for z in sorted({f for f in first if f is not None})
    }
    shown_from = {
        a: polygonal(shapely.union_all([g for z, g in appears.items() if z <= a])) for a, _ in bands
    }

    feats = [
        _feature(ll(polygonal(frame.difference(shown_from[band[0]]))), {}, "sea", band)
        for band in bands
    ]
    drawn = []
    for key in sorted(countries):
        props = {"code": key, "eu": int(key in eu_codes), "tint": tints.get(key, 0)}
        by_zoom: dict = {}
        for part in polygon_parts(countries[key]):
            z = first_of(part)
            if z is not None:
                by_zoom.setdefault(z, []).append(part)
        for z in sorted(by_zoom):
            geom = shapely.MultiPolygon(by_zoom[z])
            feats.append(_feature(ll(geom), props, "countries", (z, zooms[1])))
            drawn.append(geom)
    # borders: country outlines that are not coast, from the zoom their land appears
    coast = land.boundary
    edges = shapely.union_all([g.boundary for g in drawn])
    borders = edges.difference(coast.buffer(home["border_coast_gap_m"]))
    for z, g in appears.items():
        part = borders.intersection(g.buffer(1))
        if not part.is_empty:
            feats.append(_feature(ll(part), {}, "borders", (z, zooms[1])))
    inner = frame.buffer(-1)
    for band in bands:
        shown = shown_from[band[0]]
        coastline = shown.boundary.intersection(inner)
        feats.append(_feature(ll(coastline), {"kind": 0}, "coastline", band))
        for kind, d in enumerate(home["ripples_m"], start=1):
            ripple = shown.buffer(d).boundary.intersection(inner)
            feats.append(_feature(ll(ripple), {"kind": kind}, "coastline", band))
    for axis, deg, line in graticule(home["frame"], home["graticule_deg"]):
        feats.append(_feature(line, {"axis": axis, "deg": deg}, "graticule", zooms))
    # hatch marks on the open sea, on a grid along the map's rows
    sx, sy = home["marks"]["spacing_m"]
    n_marks = 0
    for band in bands:
        far = frame.difference(shown_from[band[0]].buffer(home["marks"]["min_shore_m"]))
        far = polygonal(reproject(far, WORK_CRS, MAP_CRS))
        marks = hatch_marks(far, sx, sy, home["marks"]["length_m"])
        n_marks = max(n_marks, len(marks))
        if marks:
            lines = reproject(shapely.MultiLineString(marks), MAP_CRS, "EPSG:4326")
            feats.append(_feature(lines, {}, "sea_marks", band))
    out = Path(paths["intermediate_root"]) / "europe" / "tiles" / "europe.geojsonseq.gz"
    n = _write(out, feats)
    stats = {
        "features": n,
        "countries": len(countries),
        "eu_countries": len(eu),
        "tints": {k: tints[k] for k in sorted(tints)},
        "sea_marks": n_marks,
        "land_pieces": len(pieces),
        "land_pieces_never_shown": sum(z is None for z in first),
        "land_pieces_by_first_zoom": {
            str(z): sum(f == z for f in first) for z in range(zooms[0], zooms[1] + 1)
        },
        "zoom_bands": bands,
        "seconds": round(time.time() - t0),
    }
    log.info("Home map: %d countries (%d of the release)", len(countries), len(eu))
    return str(out), stats


def europe_archive(
    europe_tiles: str, home: dict, paths: dict, tippecanoe_dir: str
) -> tuple[str, dict]:
    t0 = time.time()
    target = Path(paths["release"]) / "europe.pmtiles"
    target.parent.mkdir(parents=True, exist_ok=True)
    exe = Path(tippecanoe_dir) / "tippecanoe"
    if not exe.exists():
        raise FileNotFoundError(
            f"{exe} not found: run `just install-tippecanoe` (felt/tippecanoe v2.82.0)"
        )
    cmd = [str(exe), "-o", str(target), "--force", *home["tippecanoe_flags"], "--name=europe"]
    subprocess.run([*cmd, "-q", europe_tiles], check=True)
    drop_metadata(target)  # Tippecanoe's command line, with this machine's absolute paths
    stats = {
        "bytes": target.stat().st_size,
        "flags": home["tippecanoe_flags"],
        "seconds": round(time.time() - t0),
    }
    log.info("europe.pmtiles: %.1f MB", stats["bytes"] / 1e6)
    return str(target), stats
