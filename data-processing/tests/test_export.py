import json

import shapely

from data_processing.check import Report, check_sources
from data_processing.config import parameters
from data_processing.pipelines.export.nodes import (
    _outline_record,
    merge_dates,
    release_index,
    sources_document,
)

SOURCES = parameters()["sources"]


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
        "r1", caps, SOURCES, {"intermediate_root": str(tmp_path)}
    )
    assert [c["slug"] for c in ranking["capitals"]] == ["a", "b"]  # c belongs to another release
    assert [c["rank"] for c in ranking["capitals"]] == [1, 2]
    assert ranking["complete"] is False and capitals["complete"] is False
    assert [c["slug"] for c in capitals["capitals"]] == ["a", "b"]
    assert sorted(sources["capitals"]) == ["a", "b"]


def test_outline_is_in_metres_around_the_centre():
    # a 10 km square around Stockholm, in EPSG:3035
    city = shapely.box(4770000, 4045000, 4780000, 4055000)
    centre, polys = _outline_record(city, "EPSG:3035")
    ring = polys[0][0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    assert ring[0] == ring[-1]
    assert abs(max(xs) + min(xs)) < 300 and abs(max(ys) + min(ys)) < 300  # centred
    # 100 km² (EPSG:3035 is equal-area; the square is turned a little in the local projection)
    assert abs(shapely.Polygon(ring).area / 1e8 - 1) < 0.02
    assert 17 < centre[0] < 19 and 59 < centre[1] < 60


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
