"""The Home map: enlargement and nudging of the capitals' outlines and the outlines drawn, country
tints, graticule, the zooms from which islands show."""

import math

import numpy as np
import pytest
import shapely

from data_processing.check import EUROPE_LAYERS, Report, check_europe
from data_processing.config import parameters
from data_processing.core.home_layout import (
    display_outline,
    enlargement,
    home_layout,
    home_px_m,
    lonlat,
    mercator,
    nudge,
    outline_px,
)
from data_processing.core.tiles import Compression, TileType, write_pmtiles
from data_processing.pipelines.home.nodes import (
    assign_tints,
    first_zoom,
    graticule,
    land_first_zooms,
    zoom_bands,
)

HOME = parameters()["home"]
LAYOUT = HOME["layout"]
OUTLINE = {"merge_gap_px": 0.2, "min_area_px2": 4, "tolerance_px": 0.5}


def square(side_m):
    h = side_m / 2
    return [[[[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]]]]


def record(slug, lon, lat, side_km):
    return {"slug": slug, "centre": [lon, lat], "km": side_km, "outline": square(side_km * 1000)}


def test_smaller_cities_are_enlarged_more():
    assert enlargement(1, 50, LAYOUT) > enlargement(10, 50, LAYOUT) > enlargement(30, 50, LAYOUT)
    # the drawn size follows size_px * km ** exponent pixels, whatever the latitude
    for km, lat in ((1, 36), (14.5, 59), (36, 42)):
        g = outline_px(square(km * 1000), enlargement(km, lat, LAYOUT), lat, LAYOUT)
        expected = LAYOUT["size_px"] * km ** LAYOUT["size_exponent"]
        assert math.sqrt(g.area) == pytest.approx(expected, rel=1e-6)


def test_mercator_round_trip():
    lon, lat = lonlat(*mercator(16.37, 48.21))
    assert lon == pytest.approx(16.37) and lat == pytest.approx(48.21)


def test_nudge_separates_overlapping_shapes_and_leaves_the_others():
    shapes = {
        "big": shapely.box(-20, -20, 20, 20),
        "small": shapely.box(-5, -5, 5, 5),
        "far": shapely.box(-5, -5, 5, 5),
    }
    anchors = {"big": (0, 0), "small": (18, 3), "far": (500, 500)}
    pos = nudge(shapes, anchors, gap=3)
    a = shapely.affinity.translate(shapes["big"], *pos["big"])
    b = shapely.affinity.translate(shapes["small"], *pos["small"])
    assert a.distance(b) >= 3 - 1e-6
    assert tuple(pos["far"]) == (500, 500)  # nothing near it: not moved
    moved_big = np.hypot(*pos["big"])
    moved_small = np.hypot(*(pos["small"] - np.array([18, 3])))
    assert moved_small > moved_big  # the smaller outline moves more
    again = nudge(shapes, anchors, gap=3)
    assert all((pos[k] == again[k]).all() for k in shapes)  # deterministic


def test_nudge_settles_a_crowded_group():
    shapes = {k: shapely.box(-6, -6, 6, 6) for k in "abcdef"}
    anchors = {k: (i * 0.5, (i % 2) * 0.5) for i, k in enumerate("abcdef")}
    pos = nudge(shapes, anchors, gap=2)
    placed = [shapely.affinity.translate(shapes[k], *pos[k]) for k in "abcdef"]
    for i in range(len(placed)):
        for j in range(i + 1, len(placed)):
            assert placed[i].distance(placed[j]) >= 2 - 1e-6


def test_layout_gives_scale_display_and_leader():
    # two capitals 20 km apart (Vienna and Bratislava are 55 km apart): both are enlarged far
    # beyond that, so they are pushed apart, and the smaller one gets a leader line
    recs = [record("a", 16.0, 48.0, 20), record("b", 16.27, 48.0, 5), record("c", 2.35, 48.85, 10)]
    out = home_layout(recs, LAYOUT)
    assert set(out) == {"a", "b", "c"}
    assert out["c"]["display"] == [2.35, 48.85] and out["c"]["leader"] is None
    assert out["b"]["display"][0] > 16.27  # pushed east, away from a
    assert out["b"]["leader"] is not None
    assert out["b"]["scale"] > out["a"]["scale"]


def test_tints_differ_between_neighbours():
    geoms = {
        "A": shapely.box(0, 0, 100_000, 100_000),
        "B": shapely.box(100_000, 0, 200_000, 100_000),
        "C": shapely.box(0, 100_000, 200_000, 200_000),
        "D": shapely.box(500_000, 0, 600_000, 100_000),
    }
    t = assign_tints(geoms)
    assert len({t["A"], t["B"], t["C"]}) == 3  # all three touch each other
    assert set(t.values()) <= {0, 1, 2}


def test_graticule_every_ten_degrees():
    lines = graticule([-32, 24, 50, 73], 10)
    meridians = [d for a, d, _ in lines if a == "meridian"]
    parallels = [d for a, d, _ in lines if a == "parallel"]
    assert meridians == [-30, -20, -10, 0, 10, 20, 30, 40, 50]
    assert parallels == [30, 40, 50, 60, 70]


def test_home_pixel_is_the_outline_pixel():
    # a Home pixel of the drawn outline, in metres on the ground: the inverse of outline_px's factor
    for km, lat in ((0.9, 35.9), (14.3, 60.2), (35.7, 41.9)):
        ground_m_per_px = LAYOUT["reference_m_per_px"] * math.cos(math.radians(lat))
        k = enlargement(km, lat, LAYOUT) / ground_m_per_px
        assert home_px_m(km, LAYOUT) == pytest.approx(1 / k)


def wavy_box(x0, y0, x1, y1, amplitude, n=400):
    """A box whose bottom edge zigzags by ``amplitude``."""
    xs = np.linspace(x0, x1, n)
    bottom = [(x, y0 + (amplitude if i % 2 else 0)) for i, x in enumerate(xs)]
    return shapely.Polygon([*bottom, (x1, y1), (x0, y1)])


def test_display_outline_drops_what_is_too_small_to_see():
    px = 100.0  # metres per Home pixel
    main = shapely.box(0, 0, 5000, 5000)  # 50 × 50 px
    hole = shapely.box(1000, 1000, 2000, 2000)  # 10 × 10 px: a hole one sees (Frederiksberg)
    pinhole = shapely.box(3000, 3000, 3150, 3150)  # 1.5 × 1.5 px: filled by the edge
    city = shapely.MultiPolygon(
        [
            shapely.Polygon(main.exterior, [hole.exterior, pinhole.exterior]),
            shapely.box(8000, 0, 8400, 400),  # an island of 4 × 4 px: kept
            shapely.box(8000, 3000, 8150, 3150),  # an islet of 1.5 × 1.5 px: dropped
        ]
    )
    out = display_outline(city, px, OUTLINE)
    parts = sorted(shapely.get_parts(out), key=lambda p: -p.area)
    assert len(parts) == 2
    assert len(parts[0].interiors) == 1
    assert shapely.Polygon(parts[0].interiors[0]).area == pytest.approx(hole.area)
    assert parts[1].area == pytest.approx(400 * 400)


def test_display_outline_keeps_the_largest_part_of_a_tiny_city():
    out = display_outline(shapely.box(0, 0, 100, 100), 100.0, OUTLINE)  # 1 px²
    assert len(out.geoms) == 1 and out.area == pytest.approx(100 * 100)


def test_display_outline_closes_channels_too_narrow_to_see():
    px = 100.0
    # two quarters 10 m apart (0.1 px: a canal) become one; an island 300 m out (3 px) stays apart
    city = shapely.MultiPolygon(
        [
            shapely.box(0, 0, 2000, 2000),
            shapely.box(2010, 0, 4000, 2000),
            shapely.box(4300, 0, 6000, 2000),
        ]
    )
    out = display_outline(city, px, OUTLINE)
    assert len(out.geoms) == 2
    assert out.area == pytest.approx(city.area + 10 * 2000, rel=1e-3)


def test_display_outline_is_simplified_to_half_a_pixel():
    px = 100.0
    city = wavy_box(0, 0, 5000, 5000, amplitude=20)  # zigzag of 0.2 px
    out = display_outline(city, px, OUTLINE)
    assert out.is_valid
    assert shapely.get_num_coordinates(out) < 20 < shapely.get_num_coordinates(city)
    assert shapely.hausdorff_distance(out.boundary, city.boundary) <= 0.5 * px + 1e-6


def test_islands_show_from_the_zoom_they_cover_enough_pixels():
    zooms = (0, 7)
    # 4 px² of 512 px tiles: at zoom 4 and latitude 36° (Malta) a pixel is 3.96 km wide
    m = 2 * math.pi * 6378137.0 / (512 * 2**4) * math.cos(math.radians(36))
    assert first_zoom(4 * m * m * 1.01, 36, 4, 512, zooms) == 4  # Gozo, 67 km²
    assert first_zoom(4 * m * m * 0.99, 36, 4, 512, zooms) == 5
    assert first_zoom(4 * m * m * 4.1, 36, 4, 512, zooms) == 3  # four times larger: a zoom earlier
    assert first_zoom(1e12, 50, 4, 512, zooms) == 0  # a continent
    assert first_zoom(1e3, 50, 4, 512, zooms) is None  # a rock: never
    # the same area further north covers more of the map (Web Mercator)
    assert first_zoom(4 * m * m * 0.99, 60, 4, 512, zooms) == 4


def test_a_country_of_the_release_never_vanishes():
    # EPSG:3035 near Malta (36° N): a continent, a 250 km² island state of the release and its
    # 60 km² neighbour island, and a foreign islet of the same size
    continent = shapely.box(4_000_000, 1_600_000, 5_000_000, 2_000_000)
    malta = shapely.box(4_700_000, 1_440_000, 4_715_811, 1_455_811)  # 250 km²
    gozo = shapely.box(4_680_000, 1_450_000, 4_687_746, 1_457_746)  # 60 km²
    islet = shapely.box(4_400_000, 1_450_000, 4_407_746, 1_457_746)  # 60 km², not of the release
    land = shapely.MultiPolygon([continent, malta, gozo, islet])
    release = {"MT": shapely.MultiPolygon([malta, gozo])}
    pieces, first, piece_of = land_first_zooms(land, release, HOME["islands"], (0, 7))
    zoom = {round(pieces[i].area / 1e6): first[i] for i in range(len(pieces))}
    assert zoom[400_000] == 0
    assert zoom[250] == 0  # alone, it would show from zoom 4
    assert first[piece_of(gozo)] == first[piece_of(islet)] == 5
    assert piece_of(malta.buffer(-10)) != piece_of(gozo.buffer(-10))


def test_zoom_bands_cover_the_zooms():
    assert zoom_bands([0, 3, 3, 4, 5], (0, 7)) == [(0, 2), (3, 3), (4, 4), (5, 7)]
    assert zoom_bands([2], (0, 7)) == [(0, 1), (2, 7)]
    assert zoom_bands([], (0, 7)) == [(0, 7)]


def test_home_parameters_are_pinned():
    assert HOME["outline"] == OUTLINE
    assert HOME["islands"] == {"min_area_px2": 4, "tile_px": 512}
    assert "--simplification=8" in HOME["tippecanoe_flags"]


def test_check_refuses_a_land_layer(tmp_path):
    path = tmp_path / "europe.pmtiles"
    layers = [{"id": k, "fields": {f: "String" for f in v}} for k, v in EUROPE_LAYERS.items()]
    for extra, failed in (([], False), ([{"id": "land", "fields": {}}], True)):
        write_pmtiles(
            path,
            [(0, 0, 0, b"x")],
            TileType.MVT,
            Compression.GZIP,
            (-32, 24, 50, 73),
            0,
            {"name": "europe", "vector_layers": layers + extra},
        )
        report = Report()
        check_europe(report, path, {"minzoom": 0, "maxzoom": 0})
        assert bool(report.errors) == failed
