import json
import random

import geopandas as gpd
import numpy as np
import pytest
import shapely
import shapely.geometry
from pmtiles.reader import MmapSource, Reader, all_tiles

from data_processing.check import Report, check_no_local_paths, check_outline, check_sources
from data_processing.config import parameters
from data_processing.core.geo import lonlat_bbox, lonlat_bounds, reproject
from data_processing.core.tiles import (
    Compression,
    TileType,
    absolute_paths,
    drop_metadata,
    write_pmtiles,
)
from data_processing.pipelines.boundaries.nodes import context_extracts_on_disk
from data_processing.pipelines.export.nodes import (
    _outline_record,
    capital_sources,
    city_outline,
    download_names,
    localized_names,
    merge_dates,
    outline_tolerance_m,
    release_index,
    sources_document,
)

P = parameters()
SOURCES = P["sources"]
NATURAL_EARTH = {"version": "5.1.1", "last_modified": "Fri, 13 May 2022 05:21:46 GMT"}


def record(slug, all3, release="r1"):
    return {
        "release": release,
        "slug": slug,
        "name": {"en": slug},
        "local_name": slug,
        "language": "xx",
        "country": {"code": "XX", "name": {"en": "X"}},
        "residents": 10,
        "shares": {"met": [0.5 - all3, 0.3, 0.2, all3], "rules": {"3": 0.5, "30": 0.5, "300": 0.5}},
        "centre": [0, 0],
        "km": 1.0,
        "outline": [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
        "sources": {"osm": {"version": "Geofabrik europe/x extract", "date": "2026-10-11"}},
    }


def test_ranking_is_partial_and_sorted(tmp_path):
    for slug, v, rel in (("b", 0.1, "r1"), ("a", 0.2, "r1"), ("c", 0.3, "old")):
        d = tmp_path / slug
        d.mkdir()
        (d / "release_record.json").write_text(json.dumps(record(slug, v, rel)))
    caps = {"a": {}, "b": {}, "c": {}, "d": {}}
    ranking, capitals, sources = release_index(
        "r1", caps, SOURCES, P["home"], {"intermediate_root": str(tmp_path)}, NATURAL_EARTH
    )
    assert [c["slug"] for c in ranking["capitals"]] == ["a", "b"]  # c belongs to another release
    assert [c["rank"] for c in ranking["capitals"]] == [1, 2]
    assert ranking["complete"] is False and capitals["complete"] is False
    assert [c["slug"] for c in capitals["capitals"]] == ["a", "b"]
    assert sorted(sources["capitals"]) == ["a", "b"]
    for c in capitals["capitals"]:
        assert c["scale"] > 0 and len(c["display"]) == 2 and "leader" in c
    ne = sources["sources"][-1]
    assert ne["id"] == "natural_earth" and ne["version"] == "5.1.1"
    assert ne["date"] == "2022-05-13T05:21:46Z" and ne["licence"] == "Public domain"


def test_osm_source_of_a_capital_with_several_extracts():
    extract = {
        "extract_date": "261011",
        "extracts": [
            {"region": "europe/slovakia", "timestamp": "2026-10-11T20:21:06Z"},
            {"region": "europe/austria", "timestamp": "2026-10-11T20:21:06Z"},
        ],
    }
    stats = {
        "relation": 1,
        "version": 2,
        "land_polygons": {"last_modified": None},
        "subtracted": [{"relation": 3, "version": 4}],
    }
    src = capital_sources(
        extract,
        stats,
        {"query": {"release": "2026-09-23.1"}},
        {"imagery_dates_in_city": {"min": "2020-01-01", "max": "2020-02-01"}},
        {},
        {"downloaded": "2026-10-12T00:00:00+00:00"},
        SOURCES,
    )
    osm = src["osm"]
    assert osm["version"] == "Geofabrik europe/slovakia-261011, europe/austria-261011"
    assert osm["date"] == "2026-10-11T20:21:06Z"
    assert osm["subtracted"] == [{"relation": 3, "relation_version": 4}]
    # with the extracts its overview's water also reads, after its own
    context = [{"region": "europe/hungary", "timestamp": "2026-10-11T20:22:00Z"}]
    src = capital_sources(
        extract,
        stats,
        {"query": {"release": "2026-09-23.1"}},
        {"imagery_dates_in_city": {"min": "2020-01-01", "max": "2020-02-01"}},
        {},
        {"downloaded": "2026-10-12T00:00:00+00:00"},
        SOURCES,
        context,
    )
    assert src["osm"]["version"] == (
        "Geofabrik europe/slovakia-261011, europe/austria-261011, europe/hungary-261011"
    )
    assert src["osm"]["date"] == "2026-10-11T20:21:06Z/2026-10-11T20:22:00Z"


def test_release_osm_version_lists_every_extract_once():
    recs = [
        {
            "slug": "a",
            "sources": {"osm": {"version": "Geofabrik europe/b-1, europe/a-1", "date": "d"}},
        },
        {
            "slug": "c",
            "sources": {"osm": {"version": "Geofabrik europe/a-1, europe/b-1", "date": "d"}},
        },
        {"slug": "d", "sources": {"osm": {"version": "Geofabrik europe/c-1", "date": "d"}}},
    ]
    doc = sources_document("r", recs, SOURCES, {"natural_earth": NATURAL_EARTH})
    osm = next(x for x in doc["sources"] if x["id"] == "osm")
    assert osm["version"] == "Geofabrik europe/a-1, europe/b-1, europe/c-1"


def test_context_extracts_are_those_on_disk_and_checked(tmp_path):
    cfg = {
        "slug": "x",
        "osm_extract": "europe/a",
        "context_extracts": ["europe/a", "europe/b", "europe/c", "europe/d"],
    }
    raw = tmp_path / "raw"
    for base, entry in (
        ("a", {"md5": "m", "header": {"timestamp": "t0"}}),
        ("b", {"md5": "m", "header": {"timestamp": "t1"}}),
        ("c", {}),  # on disk, never checked
    ):
        folder = raw / "osm" / base
        folder.mkdir(parents=True)
        (folder / f"{base}-261011.osm.pbf").write_bytes(b"")
        (folder / "manifest.json").write_text(
            json.dumps({"files": {f"{base}-261011.osm.pbf": entry}})
        )
    out = context_extracts_on_disk(cfg, {"osm": {"extract_date": "261011"}}, {"raw": str(raw)})
    # not its own (a), not unchecked (c), not missing (d)
    assert [(e["region"], e["timestamp"]) for e in out] == [("europe/b", "t1")]


def test_outline_is_in_metres_around_the_centre():
    # a 10 km square around Stockholm, in EPSG:3035
    city = shapely.box(4770000, 4045000, 4780000, 4055000)
    centre, polys = _outline_record(city, "EPSG:3035", 10.0, P["home"])
    ring = polys[0][0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    assert ring[0] == ring[-1]
    assert all(isinstance(v, int) for p in ring for v in p)  # whole metres
    assert abs(max(xs) + min(xs)) < 300 and abs(max(ys) + min(ys)) < 300  # centred
    # 100 km² (EPSG:3035 is equal-area; the square is turned a little in the local projection)
    assert abs(shapely.Polygon(ring).area / 1e8 - 1) < 0.02
    assert 17 < centre[0] < 19 and 59 < centre[1] < 60


def test_outline_leaves_out_islets_and_keeps_the_figures_full():
    # a 10 km city (a Home pixel is 10,000 / (12.5 × 10^0.4) = 318 m) with a 100 m islet
    city = shapely.MultiPolygon(
        [
            shapely.box(4770000, 4045000, 4780000, 4055000),
            shapely.box(4781000, 4045000, 4781100, 4045100),
        ]
    )
    _, polys = _outline_record(city, "EPSG:3035", 10.0, P["home"])
    assert len(polys) == 1


LOCALES = ["de", "en", "ga", "mt"]


def labels(**values):
    return {k: {"language": k, "value": v} for k, v in values.items()}


def test_names_fall_back_and_take_overrides():
    names, used = localized_names(
        labels(en="Luxembourg", de="Luxemburg", mt="Belt tal-Lussemburgu", mul="Luxembourg"),
        LOCALES,
        {"mt": "Lussemburgu"},
    )
    assert names == {"de": "Luxemburg", "en": "Luxembourg", "ga": "Luxembourg", "mt": "Lussemburgu"}
    assert used == ["ga:mul", "mt:override"]
    with pytest.raises(ValueError, match="unknown locales"):
        localized_names(labels(en="X"), LOCALES, {"xx": "Y"})


def test_names_come_from_the_city_not_the_region(tmp_path):
    # Brussels: the territory is the region (Q240), its name that of the city (Q239)
    capitals = {
        "brussels": {
            "osm_relation": 54094,
            "osm_version": 177,
            "wikidata": "Q240",
            "name_wikidata": "Q239",
            "name_overrides": {"ga": "An Bhruiséil"},
            "country_wikidata": "Q31",
        }
    }
    folder = tmp_path / "wikidata" / "brussels"
    folder.mkdir(parents=True)
    answer = {
        "entities": {
            "Q239": {"labels": labels(en="Brussels", de="Brüssel", ga="Cathair na Bruiséile")},
            "Q31": {"labels": labels(en="Belgium", de="Belgien", ga="An Bheilg", mt="Belġju")},
        }
    }
    (folder / "labels.json").write_text(
        json.dumps({"downloaded": "2026-10-15T10:00:00+00:00", "url": "u", "answer": answer})
    )
    out = download_names("brussels", capitals, LOCALES, SOURCES, {"raw": str(tmp_path)})
    assert out["capital"] == {
        "de": "Brüssel",
        "en": "Brussels",
        "ga": "An Bhruiséil",
        "mt": "Brussels",
    }
    assert out["wikidata"] == {"capital": "Q239", "country": "Q31"}
    assert out["fallbacks"] == ["capital:ga:override", "capital:mt:en"]


def test_names_of_the_capitals_are_their_cities():
    caps = P["capitals"]
    assert caps["brussels"]["wikidata"] == "Q240" and caps["brussels"]["name_wikidata"] == "Q239"
    assert caps["brussels"]["name_overrides"] == {"ga": "An Bhruiséil"}
    assert caps["luxembourg"]["name_overrides"] == {"mt": "Lussemburgu"}
    assert P["check"]["known"]["brussels"]["name_en"] == "Brussels"


def test_dates_merge_into_an_interval():
    assert merge_dates(["2026-10-11T20:21:06Z", "2026-10-11T20:21:06Z"]) == "2026-10-11T20:21:06Z"
    assert merge_dates(["2020-06-12/2020-06-25", "2019-08-01/2020-06-30"]) == (
        "2019-08-01/2020-06-30"
    )
    assert merge_dates([None, ""]) == ""


def test_sources_document_lists_every_source_with_credits():
    rec = {
        "slug": "a",
        "sources": {
            "osm": {"version": "Geofabrik europe/a extract", "date": "2026-10-11T20:21:06Z"},
            "ghs_pop": {"version": "R2023A", "date": "2020"},
        },
    }
    doc = sources_document("r1", [rec], SOURCES)
    ids = [s["id"] for s in doc["sources"]]
    assert ids == list(SOURCES["credits"])
    osm = doc["sources"][0]
    assert osm["date"] == "2026-10-11T20:21:06Z" and osm["licence"] == "ODbL 1.0"
    assert "OpenStreetMap contributors" in osm["attribution"]
    assert doc["capitals"] == {"a": rec["sources"]}


def test_check_flags_a_broken_sources_document(tmp_path):
    rec = {
        "slug": "a",
        "sources": {
            "osm": {"version": "Geofabrik europe/a-261011", "date": "2026-10-11T20:21:06Z"}
        },
    }
    doc = sources_document("r1", [rec], SOURCES)
    good = tmp_path / "good.json"
    good.write_text(json.dumps(doc))
    r = Report()
    check_sources(r, good, "r1", {"a": {"sources": rec["sources"]}}, SOURCES["credits"])
    assert [e for e in r.errors if "osm]" in e] == []
    doc["sources"][0]["date"] = "11 Oct 2026"
    doc["sources"][0]["attribution"] = ""
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(doc))
    r = Report()
    check_sources(r, bad, "r1", {"a": {"sources": rec["sources"]}}, SOURCES["credits"])
    assert any("osm]: date" in e for e in r.errors)
    assert any("osm]: attribution" in e for e in r.errors)


def test_archive_metadata_loses_the_local_paths(tmp_path):
    # enough tiles for leaf directories, so every section of the archive moves
    rng = random.Random(1)
    tiles = [
        (12, x * 7, y * 5, rng.randbytes(1 + (x * y) % 50)) for x in range(150) for y in range(150)
    ]
    path = tmp_path / "a.pmtiles"
    command = ".tools/bin/tippecanoe -o out.pmtiles -t '/home/someone/tiles' -q '/home/x.gz'"
    write_pmtiles(
        path,
        tiles,
        TileType.MVT,
        Compression.GZIP,
        (0, 0, 1, 1),
        8,
        {"name": "x", "generator_options": command, "vector_layers": []},
    )
    with path.open("rb") as f:
        reader = Reader(MmapSource(f))
        assert reader.header()["leaf_directory_length"] > 0
        report = Report()
        check_no_local_paths(report, reader.metadata(), "a.pmtiles")
        assert report.errors
    assert drop_metadata(path) == ["generator_options"]
    assert drop_metadata(path) == []  # nothing left to drop
    with path.open("rb") as f:
        reader = Reader(MmapSource(f))
        assert reader.metadata() == {"name": "x", "vector_layers": []}
        assert dict(all_tiles(reader.get_bytes)) == {(z, x, y): d for z, x, y, d in tiles}
        report = Report()
        check_no_local_paths(report, reader.metadata(), "a.pmtiles")
        assert not report.errors


def test_absolute_paths_are_found_anywhere_in_the_metadata():
    assert absolute_paths({"a": ["x", {"b": "-t '/home/u/x'"}]}) == ["-t '/home/u/x'"]
    found = absolute_paths({"a": "C:\\Users\\x", "b": "--out=/tmp/x"})
    assert found == ["C:\\Users\\x", "--out=/tmp/x"]
    assert not absolute_paths(
        {"origin": "tile north-west corner, x east", "url": "https://example.org/a/b", "r": "1/2"}
    )


OUTLINE = P["tiles"]["outline"]


def test_outline_tolerance_is_pixels_at_zoom_15():
    assert OUTLINE == {
        "zoom": 15,
        "tolerance_px": 0.75,
        "tile_px": 512,
        "decimals": 6,
    }
    # 512 px tiles at zoom 15: 2.389 m per pixel at the equator, half that at 60°
    assert outline_tolerance_m(0, OUTLINE) == pytest.approx(0.75 * 2.3887, rel=1e-4)
    assert outline_tolerance_m(60.17, OUTLINE) == pytest.approx(0.89, abs=0.005)  # Helsinki
    assert outline_tolerance_m(35.9, OUTLINE) == pytest.approx(1.45, abs=0.005)  # Valletta


X0, Y0 = 4_770_000, 4_045_000
HOLE = shapely.box(X0 + 500, Y0 + 500, X0 + 600, Y0 + 600)


def city_frame(boundary=None):
    """A city in EPSG:3035 near Stockholm: a 2 km square with a zigzag edge of 0.3 m and a
    100 m hole, a 5 × 5 m islet, and its 1 km buffer as the analysis area; its boundary is the
    city (no sea) unless given."""
    x0, y0 = 4_770_000, 4_045_000
    xs = np.linspace(x0, x0 + 2000, 2001)
    edge = [(x, y0 + (0.3 if i % 2 else 0)) for i, x in enumerate(xs)]
    main = shapely.Polygon(
        [*edge, (x0 + 2000, y0 + 2000), (x0, y0 + 2000)],
        [shapely.box(x0 + 500, y0 + 500, x0 + 600, y0 + 600).exterior.coords],
    )
    islet = shapely.box(x0 + 2100, y0, x0 + 2105, y0 + 5)
    city = shapely.MultiPolygon([main, islet])
    frame = gpd.GeoDataFrame(
        {"name": ["boundary", "city", "analysis"]},
        geometry=[city if boundary is None else boundary, city, city.buffer(1000)],
        crs="EPSG:3035",
    )
    return city, frame


def test_city_outline_is_the_city_of_the_figures():
    city, frame = city_frame()
    doc, stats = city_outline("x", "r1", frame, P["tiles"])
    assert (doc["type"], doc["schema_version"], doc["release"], doc["slug"]) == (
        "Feature",
        1,
        "r1",
        "x",
    )
    g = shapely.geometry.shape(doc["geometry"])
    assert doc["geometry"]["type"] == "MultiPolygon" and g.is_valid
    # the city, not its 1 km buffer; its islet and its hole are kept
    back = reproject(g, "EPSG:4326", "EPSG:3035")
    assert back.area == pytest.approx(city.area, rel=1e-4)
    assert stats["parts"] == 2 and stats["holes"] == 1
    # the 0.3 m zigzag is simplified away, within the tolerance (and the rounding)
    assert stats["points"] < 20 < stats["points_full"]
    assert shapely.hausdorff_distance(back.boundary, city.boundary) <= doc["tolerance_m"] + 0.15
    # RFC 7946: exteriors counter-clockwise; 6 decimals
    assert all(shapely.Polygon(p.exterior).exterior.is_ccw for p in g.geoms)
    lon = doc["geometry"]["coordinates"][0][0][0][0]
    assert lon == round(lon, 6)


def test_check_flags_a_broken_outline(tmp_path):
    _, frame = city_frame()
    doc, _ = city_outline("x", "r1", frame, P["tiles"])
    g = shapely.geometry.shape(doc["geometry"])
    summary = {"bbox": [round(v, 5) for v in g.bounds]}
    budgets = {"outline_json_warn_bytes": 100, "outline_json_max_bytes": 100_000}
    path = tmp_path / "outline.json"
    path.write_text(json.dumps(doc))
    r = Report()
    check_outline(r, path, "x", "r1", summary, budgets)
    assert not r.errors and r.warnings  # over the warning size only
    path.write_text(json.dumps({**doc, "release": "r0"}))
    r = Report()
    check_outline(r, path, "x", "r1", summary, {**budgets, "outline_json_max_bytes": 100})
    assert len(r.errors) == 2  # the release, and the size limit
    r = Report()
    check_outline(r, path, "x", "r1", {"bbox": [0, 0, 1, 1]}, budgets)
    assert any("differ from the city's" in e for e in r.errors)  # another place


def test_summary_bbox_is_the_city_itself():
    # a city turned against the meridians: its own bounds, not those of its EPSG:3035 box
    city = shapely.Polygon(
        [
            (5_100_000, 4_700_000),
            (5_110_000, 4_710_000),
            (5_100_000, 4_720_000),
            (5_090_000, 4_710_000),
        ]
    )  # a diamond near Helsinki
    tight = lonlat_bounds(city, "EPSG:3035", 5)
    loose = lonlat_bbox(city, "EPSG:3035")
    ll = reproject(city, "EPSG:3035", "EPSG:4326")
    w, s, e, n = ll.bounds
    assert tight[0] <= w and tight[1] <= s and tight[2] >= e and tight[3] >= n  # holds it
    assert max(abs(a - b) for a, b in zip(tight, ll.bounds, strict=True)) < 1e-5  # tightly
    assert loose[0] < tight[0] - 0.01 and loose[2] > tight[2] + 0.01  # the box of the box
