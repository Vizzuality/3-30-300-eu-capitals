"""Reading OpenStreetMap extracts: relations assembled by libosmium, selections, ways."""

import geopandas as gpd
import pytest
import shapely

from data_processing.config import parameters
from data_processing.core import osm
from data_processing.core.geo import reproject
from data_processing.pipelines.boundaries.nodes import (
    compose_territory,
    osm_polygons,
    read_boundary,
    read_osm,
)

GREEN = parameters()["method"]["rule300"]["green_tags"]

# A tiny OSM file (OPL): a lake as a multipolygon whose outer ring is split in two ways and has an
# island; a nature reserve as a boundary relation; a water relation tagged as a boundary (not
# selected); a closed pond; a park way; a footway; and a far-away highway outside the bbox.
OPL = """\
n1 v1 x10.00 y50.00
n2 v1 x10.10 y50.00
n3 v1 x10.10 y50.10
n4 v1 x10.00 y50.10
n5 v1 x10.04 y50.04
n6 v1 x10.06 y50.04
n7 v1 x10.06 y50.06
n8 v1 x10.04 y50.06
n9 v1 x10.20 y50.00
n10 v1 x10.30 y50.00
n11 v1 x10.30 y50.10
n12 v1 x10.20 y50.10
n13 v1 x10.12 y50.00
n14 v1 x10.13 y50.00
n15 v1 x10.13 y50.01
n16 v1 x13.00 y52.00
n17 v1 x13.01 y52.00
w1 v1 T Nn1,n2,n3
w2 v1 T Nn3,n4,n1
w3 v1 T Nn5,n6,n7,n8,n5
w4 v1 T Nn9,n10,n11,n12,n9
w5 v1 Tnatural=water Nn13,n14,n15,n13
w6 v1 Tleisure=park Nn13,n14,n15,n13
w7 v1 Thighway=footway,name=Stigen Nn2,n13,n9
w8 v1 Thighway=residential Nn16,n17
r1 v7 Ttype=multipolygon,natural=water,name=Sjön Mw1@outer,w2@outer,w3@inner
r2 v2 Ttype=boundary,leisure=nature_reserve,name=Reservatet Mw4@outer
r3 v1 Ttype=boundary,natural=water Mw4@outer
"""


def opl(tmp_path):
    p = tmp_path / "tiny.osm.opl"
    p.write_text(OPL)
    return str(p)


def test_selections_follow_the_tag_filters():
    assert osm.water_selected({"natural": "water"}, "way")
    assert osm.water_selected({"natural": "water", "type": "multipolygon"}, "relation")
    assert not osm.water_selected({"natural": "water", "type": "boundary"}, "relation")
    assert osm.water_selected({"landuse": "reservoir"}, "way")
    assert osm.green_selected({"leisure": "park"}, "way", GREEN)
    assert osm.green_selected({"leisure": "nature_reserve", "type": "boundary"}, "relation", GREEN)
    assert not osm.green_selected({"leisure": "park", "type": "boundary"}, "relation", GREEN)
    assert not osm.green_selected({"leisure": "pitch"}, "way", GREEN)


def test_relations_keep_versions_and_members(tmp_path):
    rels = osm.relations(opl(tmp_path))
    assert rels[1]["version"] == 7
    assert [m[2] for m in rels[1]["members"]] == ["outer", "outer", "inner"]


def test_multipolygon_with_split_outer_and_island(tmp_path):
    g = osm.area_of_relation(opl(tmp_path), 1)
    assert g is not None
    expected = shapely.box(10, 50, 10.1, 50.1).difference(shapely.box(10.04, 50.04, 10.06, 50.06))
    assert abs(g.area - expected.area) < 1e-12
    assert len(shapely.get_parts(g)[0].interiors) == 1


def test_features_in_the_bbox(tmp_path):
    rels = osm.relations(opl(tmp_path))
    wanted = {
        r
        for r, d in rels.items()
        if osm.water_selected(d["tags"], "relation")
        or osm.green_selected(d["tags"], "relation", GREEN)
    }
    assert wanted == {1, 2}

    def keep(tags):
        t = dict(tags)
        out = set()
        if "highway" in t:
            out.add("highway")
        if osm.water_selected(t, "way") or osm.green_selected(t, "way", GREEN):
            out.add("area")
        return out

    f = osm.read_features(opl(tmp_path), (9.9, 49.9, 10.5, 50.5), wanted, keep)
    assert [w["id"] for w in f["ways"]] == [7]  # the far-away street is left out
    assert f["ways"][0]["nodes"] == [2, 13, 9]
    assert {i for i, _, _ in f["closed"]} == {5, 6}
    assert {i for i, _, _ in f["areas"]} == {1, 2}  # r3 is not a selected relation
    reserve = next(g for i, _, g in f["areas"] if i == 2)
    assert abs(reserve.area - 0.01) < 1e-12
    # libosmium leaves the relation's `type` out of the area's tags: relation areas must be
    # chosen by relation id (as read_osm does), never by the area's tags
    lake_tags = next(t for i, t, _ in f["areas"] if i == 1)
    assert "type" not in lake_tags and lake_tags["natural"] == "water"


def test_read_osm_keeps_selected_relations(tmp_path):
    method = parameters()["method"]
    area = reproject(shapely.box(10.0, 50.0, 10.3, 50.1), "EPSG:4326", "EPSG:3035")
    boundaries = gpd.GeoDataFrame({"name": ["analysis"]}, geometry=[area], crs="EPSG:3035")
    extract = {"file": opl(tmp_path), "sha256": "test", "timestamp": "2026-10-11T00:00:00Z"}
    paths = {"intermediate": str(tmp_path / "cap")}
    f = read_osm({"extracts": [extract]}, boundaries, method, paths)
    water = osm_polygons(f["water"], "EPSG:3035")
    green = osm_polygons(f["green"], "EPSG:3035")
    assert set(zip(water.osm_type, water.osm_id, strict=True)) == {("relation", 1), ("way", 5)}
    assert set(zip(green.osm_type, green.osm_id, strict=True)) == {("relation", 2), ("way", 6)}
    lake = water[water.osm_id == 1].iloc[0]
    assert lake["tags"]["type"] == "multipolygon"  # the relation's own tags
    assert f["counts"]["highway_ways"] == 1


def test_territory_minus_a_relation():
    # Nicosia: the merged municipality minus the UN buffer zone that crosses it
    municipality = shapely.box(0, 0, 10, 10)
    buffer_zone = shapely.box(-5, 6, 15, 7)  # a band across the whole territory
    t = compose_territory(municipality, [buffer_zone])
    assert t.area == pytest.approx(90)
    assert len(shapely.get_parts(t)) == 2  # south and north of the band
    assert compose_territory(municipality).equals(municipality)


def test_read_boundary_cuts_out_and_pins_subtracted_relations(tmp_path):
    # r1 (the lake polygon, as a stand-in territory) minus r2 (the reserve, disjoint) and the
    # pins of both are checked
    extract = {"extracts": [{"file": opl(tmp_path), "sha256": "t", "timestamp": "x"}]}
    caps = {"x": {"osm_relation": 1, "osm_version": 7, "osm_subtract": []}}
    paths = {"intermediate": str(tmp_path / "x")}
    b = read_boundary(extract, "x", caps, paths)
    assert b["version"] == 7 and b["subtracted"] == []
    caps["x"]["osm_subtract"] = [{"relation": 2, "version": 2}]
    b = read_boundary(extract, "x", caps, paths)
    assert [s["relation"] for s in b["subtracted"]] == [2]
    caps["x"]["osm_subtract"] = [{"relation": 2, "version": 3}]
    with pytest.raises(ValueError, match="relation 2 is at version 2"):
        read_boundary(extract, "x", caps, paths)


def test_features_from_several_extracts_are_kept_once():
    poly = shapely.box(0, 0, 1, 1)
    a = {
        "ways": [{"id": 1}, {"id": 2}],
        "closed": [(5, {}, poly)],
        "areas": [(9, {}, poly)],
        "areas_invalid": 1,
        "invalid_ids": [8],
    }
    b = {
        "ways": [{"id": 2}, {"id": 3}],
        "closed": [(5, {}, poly), (6, {}, poly)],
        "areas": [(8, {}, poly), (9, {}, poly)],
        "areas_invalid": 0,
        "invalid_ids": [],
    }
    m = osm.merge_features([a, b])
    assert [w["id"] for w in m["ways"]] == [1, 2, 3]
    assert [c[0] for c in m["closed"]] == [5, 6]
    assert [x[0] for x in m["areas"]] == [9, 8]
    assert m["areas_invalid"] == 0  # 8 could not be assembled in a, but was in b
