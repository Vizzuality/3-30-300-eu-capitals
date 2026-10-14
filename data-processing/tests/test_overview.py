"""The capital page's overview: the context rectangle (camera fit, least zoom, union of the
frames) and the water drawn in it (slimming away from the city, whole near it)."""

import math

import pytest
import shapely

from data_processing.check import Report, check_context_features
from data_processing.config import parameters
from data_processing.core.overview import (
    context_rectangle,
    fit,
    ground_m_per_px,
    slim_water,
    view,
    world_lonlat,
    world_px,
)
from data_processing.pipelines.overview.nodes import context_geometry, context_regions

OVERVIEW = parameters()["overview"]
FRAMES = OVERVIEW["frames"]


def test_world_pixels_round_trip():
    x, y = world_px(24.94, 60.17)
    assert world_lonlat(x, y) == pytest.approx((24.94, 60.17))
    assert world_px(0, 0) == pytest.approx((256, 256))


def test_fit_fills_the_padded_frame():
    bounds = (24.8, 60.1, 25.1, 60.3)
    cam = fit(bounds, FRAMES["desktop"], 22)
    x0, y0 = world_px(bounds[0], bounds[3])
    x1, y1 = world_px(bounds[2], bounds[1])
    s = 2 ** cam["zoom"]
    top, right, bottom, left = FRAMES["desktop"]["padding"]
    # the city fits the frame minus its padding, touching it on one axis
    inner = (FRAMES["desktop"]["width"] - left - right, FRAMES["desktop"]["height"] - top - bottom)
    assert max((x1 - x0) * s / inner[0], (y1 - y0) * s / inner[1]) == pytest.approx(1)
    # the city sits in the padded area: its left edge `left` px from the frame's
    v = view(cam, FRAMES["desktop"], cam["zoom"])
    assert (x0 - v[0]) * s >= left - 1e-6 and (v[2] - x1) * s >= right - 1e-6


def test_fit_stops_at_18_but_never_holds_a_city_back_at_9():
    tiny = (14.51, 35.895, 14.5101, 35.89505)  # 9 × 6 m
    assert fit(tiny, FRAMES["phone"], 18)["zoom"] == 18
    rome = (12.23444, 41.65564, 12.85576, 42.14103)
    z = fit(rome, FRAMES["phone"], 18)["zoom"]
    assert z < 9  # below the page's usual least zoom: the whole city still shows
    # the band's 234 px of height (386 minus 72 and 80) over Rome's 0.928 world px
    (_, y0), (_, y1) = world_px(12.2, 42.14103), world_px(12.2, 41.65564)
    assert z == pytest.approx(math.log2(234 / (y1 - y0)))


def test_fit_is_math_gl_fit_bounds():
    # math.gl fitBounds for these bounds and the phone's padding (worked by hand from its code):
    # offsets at each axis's own scale, the zoom of the tighter one
    bounds = (16.0, 48.0, 17.0, 48.5)
    cam = fit(bounds, FRAMES["phone"], 18)
    x0, y0 = world_px(16.0, 48.5)
    x1, y1 = world_px(17.0, 48.0)
    sx, sy = (412 - 32) / (x1 - x0), (386 - 152) / (y1 - y0)
    assert cam["zoom"] == pytest.approx(math.log2(min(sx, sy)))
    assert cam["cx"] == pytest.approx((x0 + x1) / 2)  # equal side paddings
    assert cam["cy"] == pytest.approx((y0 + y1) / 2 + (80 - 72) / 2 / sy)


def test_rectangle_is_both_views_one_zoom_out():
    bounds = (16.18, 48.12, 16.58, 48.32)  # about Vienna
    ctx = context_rectangle(bounds, OVERVIEW)
    w, s, e, n = ctx["bbox"]
    assert w < bounds[0] and s < bounds[1] and e > bounds[2] and n > bounds[3]
    for name, frame in FRAMES.items():
        cam = fit(bounds, frame, 18)
        least = cam["zoom"] - 1
        assert ctx["min_zoom"][name] == pytest.approx(least, abs=0.01)
        assert ctx["min_zoom"][name] >= least  # rounded up
        x0, y0, x1, y1 = view(cam, frame, least)
        (vw, vn), (ve, vs) = world_lonlat(x0, y0), world_lonlat(x1, y1)
        # every view at its least zoom stays inside the rectangle (rounded outwards)
        assert w <= vw and s <= vs and e >= ve and n >= vn
    # and the rectangle is no larger than the two views
    boxes = [view(fit(bounds, f, 18), f, ctx["min_zoom"][k] - 0.01) for k, f in FRAMES.items()]
    (bw, bn) = world_lonlat(min(b[0] for b in boxes), min(b[1] for b in boxes))
    assert w == pytest.approx(bw, abs=0.01)
    assert ctx["tile_zooms"] == [min(9, math.floor(min(ctx["min_zoom"].values()))), 12]


def test_least_zoom_follows_a_large_city_below_9():
    ctx = context_rectangle((22.95, 42.43, 23.75, 42.93), OVERVIEW)  # about Sofia
    assert ctx["min_zoom"]["phone"] < 8 and ctx["min_zoom"]["desktop"] < 9
    # its tiles start at the floor of the least zoom, so the phone's view loads them
    assert ctx["tile_zooms"][0] == math.floor(ctx["min_zoom"]["phone"])


def test_tiles_reach_the_zoom_a_small_city_is_seen_at():
    ctx = context_rectangle((14.5055, 35.8932, 14.5207, 35.9036), OVERVIEW)  # about Valletta
    assert ctx["min_zoom"]["desktop"] > 14
    assert ctx["tile_zooms"] == [9, 15]


def test_slimming_leaves_out_narrow_and_small_water():
    m = 10.0  # metres per pixel
    lake = shapely.box(0, 0, 1000, 1000)
    canal = shapely.box(1000, 400, 3000, 415)  # 1.5 px wide
    river = shapely.box(0, 2000, 3000, 2030)  # 3 px wide
    pond = shapely.box(5000, 0, 5025, 25)  # 2.5 × 2.5 px
    out = slim_water(shapely.union_all([lake, canal, river, pond]), m, 2, 3)
    assert out.intersects(shapely.Point(500, 500)) and out.intersects(shapely.Point(1500, 2015))
    assert not out.intersects(shapely.Point(2000, 407)) and not out.intersects(
        shapely.Point(5012, 12)
    )
    assert out.area == pytest.approx(lake.area + river.area, rel=0.01)


def test_water_near_the_city_is_kept_whole():
    lat = 52.5
    canal = shapely.box(0, 0, 3000, 10)  # 10 m: under 2 px at zoom 11 (about 28 m)
    near = shapely.box(0, -500, 1000, 500)
    drawn, tol = context_geometry(canal, near, lat, [9, 12], OVERVIEW["water"])
    assert drawn.intersects(shapely.Point(500, 5)) and not drawn.intersects(shapely.Point(2000, 5))
    assert tol == pytest.approx(0.75 * ground_m_per_px(lat, 12))
    assert ground_m_per_px(0, 12) == pytest.approx(2 * math.pi * 6378137 / (512 * 4096))


def test_context_regions_follow_the_capital():
    cfg = {
        "slug": "x",
        "osm_extract": ["europe/a", "europe/b"],
        "context_extracts": ["europe/b", "europe/c"],
    }
    assert context_regions(cfg) == ["europe/a", "europe/b", "europe/c"]
    assert context_regions({"slug": "y", "osm_extract": "europe/a"}) == ["europe/a"]


def test_check_refuses_places_outside_the_city_and_bad_roads():
    city = shapely.box(0, 0, 1, 1)
    road = {"properties": {"class": "primary", "tunnel": 0, "dual": 1}}
    place = {
        "properties": {"name": "Mitte", "tier": 1, "rank": 100, "w": 30.5},
        "geometry": {"type": "Point", "coordinates": [0.5, 0.5]},
    }
    r = Report()
    check_context_features(r, "x", [road], [place], city)
    assert not r.errors
    outside = {**place, "geometry": {"type": "Point", "coordinates": [2, 2]}}
    bad_road = {"properties": {"class": "residential", "tunnel": 0, "dual": 0}}
    r = Report()
    check_context_features(r, "x", [bad_road], [outside], city)
    assert len(r.errors) == 2
    # one name, the local one: no name_en
    english = {**place, "properties": {**place["properties"], "name_en": "Middle"}}
    r = Report()
    check_context_features(r, "x", [road], [english], city)
    assert r.errors
