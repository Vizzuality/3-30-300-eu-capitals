"""The overview's reference layers: road strokes, their selection and repair, and the choice of
the district levels."""

import shapely
import shapely.ops

from data_processing.config import parameters
from data_processing.core.orientation import (
    MergeStats,
    Piece,
    _dedupe_centres,
    choose_levels,
    first_zoom,
    geometric_dangling_ends,
    label_point,
    merge_dual_carriageways,
    road_class,
    thin_by_spacing,
)
from data_processing.pipelines.overview.orientation import parse_tier, shorten

ROADS = parameters()["overview"]["roads"]
PLACES = parameters()["overview"]["places"]


def test_roads_are_chosen_by_class_only():
    for cls in ("motorway", "trunk", "primary", "secondary", "tertiary"):
        assert road_class({"highway": cls}) == cls
    # ramps and slip roads: an interchange's detail, left out
    for link in ("motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"):
        assert road_class({"highway": link}) is None
    for minor in ("residential", "unclassified", "service", "footway", "path", "cycleway"):
        assert road_class({"highway": minor}) is None
    assert road_class({"highway": "primary", "area": "yes"}) is None  # a square
    assert road_class({"railway": "rail"}) is None


def test_main_roads_show_first():
    assert [first_zoom(c, 7, 10) for c in ("motorway", "trunk", "primary")] == [7, 7, 7]
    assert [first_zoom(c, 7, 10) for c in ("secondary", "tertiary")] == [10, 10]


def piece(coords, key="Ring", oneway=True, cls="secondary"):
    return Piece(shapely.LineString(coords), cls, False, 10, key=key, oneway=oneway)


def test_dual_carriageways_are_drawn_as_one_line_and_stay_joined():
    # two carriageways 20 m apart, the other way round, 1 km; a street ends on the first one
    pieces = [
        piece([(0, 0), (1000, 0)]),
        piece([(1000, 20), (0, 20)]),
        piece([(500, -300), (500, 0)], key="Side", oneway=False),
        piece([(2000, 0), (2500, 0)], key="Alone"),  # one-way with no partner: as it is
    ]
    out, st = merge_dual_carriageways(pieces, ROADS)
    duals = [p for p in out if p.dual]
    assert st.pairs == 1 and len(duals) == 1
    centre = duals[0].geom
    assert abs(centre.length - 1000) < 20 and all(abs(y - 10) < 1 for _, y in centre.coords)
    side = next(p for p in out if p.key == "Side")
    assert centre.distance(shapely.Point(side.geom.coords[-1])) < 0.5  # extended to the centre
    assert any(p.key == "Alone" and not p.dual for p in out)

    def inside(pt):  # around the carriageways (the side street's far end is where it ends)
        return 0 < pt.x < 1000 and pt.y > -100

    assert geometric_dangling_ends(out, inside, lambda pt: False) == 0


def test_carriageways_chained_through_a_u_are_merged():
    # one line up one side and back down the other, 15 m apart
    u = piece([(0, 0), (800, 0), (800, 15), (0, 15)])
    out, st = merge_dual_carriageways([u], ROADS)
    assert st.pairs == 1 and sum(p.dual for p in out) == 1


def test_carriageways_too_far_apart_stay_two_lines():
    pieces = [piece([(0, 0), (1000, 0)]), piece([(1000, 200), (0, 200)])]
    out, st = merge_dual_carriageways(pieces, ROADS)
    assert st.pairs == 0 and not any(p.dual for p in out)


def test_levels_are_the_first_with_10_to_30_areas_then_the_next_finer():
    none = {}
    assert choose_levels({9: 12, 10: 97}, none, PLACES) == (("admin", 9), ("admin", 10))  # Berlin
    assert choose_levels({8: 1, 9: 21, 10: 131}, none, PLACES) == (("admin", 9), ("admin", 10))
    # no admin level fits: suburbs, then the admin level with the fewest areas above them
    tallinn = choose_levels({9: 8, 10: 84}, {"suburb": 8}, PLACES)
    assert tallinn == (("place", "suburb"), ("admin", 10))
    helsinki = choose_levels({9: 6, 10: 45, 11: 103}, {"suburb": 91}, PLACES)
    assert helsinki == (("place", "suburb"), ("admin", 10))  # 30 suburbs kept, then 45 areas
    # else the finer place nodes, whichever are more
    amsterdam = choose_levels({10: 2}, {"suburb": 8, "neighbourhood": 74, "quarter": 48}, PLACES)
    assert amsterdam == (("place", "suburb"), ("place", "neighbourhood"))
    assert choose_levels({9: 15}, {"suburb": 60}, PLACES) == (("admin", 9), ("place", "suburb"))
    assert choose_levels({9: 15}, {"quarter": 40}, PLACES) == (("admin", 9), ("place", "quarter"))
    assert choose_levels({}, none, PLACES) == (None, None)
    assert parse_tier("admin_level=9") == ("admin", 9)
    assert parse_tier("place=suburb") == ("place", "suburb")


def test_thinning_keeps_the_first_points_far_enough_apart():
    pts = [(x * 100.0, 0.0) for x in range(50)]
    kept = thin_by_spacing(pts, list(range(50)), 10)
    assert len(kept) <= 10 and kept[0] == 0
    assert all(abs(pts[a][0] - pts[b][0]) >= 400 for a in kept for b in kept if a != b)
    assert thin_by_spacing(pts[:5], [4, 3, 2, 1, 0], 10) == [4, 3, 2, 1, 0]


def test_label_point_is_inside_a_concave_area():
    u = shapely.Polygon(
        [(0, 0), (300, 0), (300, 300), (200, 300), (200, 100), (100, 100), (100, 300), (0, 300)]
    )
    p = label_point(u)
    assert u.contains(p)
    assert not u.centroid.within(shapely.box(100, 100, 200, 300)) or not u.contains(u.centroid)


def test_district_names_are_written_as_people_say_them():
    caps = parameters()["capitals"]

    def rules(slug):
        return caps[slug]["places"]["name_rules"]

    assert shorten("Paris 18e Arrondissement", rules("paris")) == "18e"
    assert shorten("Paris 1er Arrondissement", rules("paris")) == "1er"
    keep = set(caps["paris"]["places"]["name_keep"])
    for before, after in (
        ("Quartier de Belleville", "Belleville"),
        ("Quartier de la Roquette", "La Roquette"),
        ("Quartier de l'Odéon", "L'Odéon"),
        ("Quartier des Halles", "Les Halles"),
        ("Quartier du Val-de-Grâce", "Le Val-de-Grâce"),
        ("Quartier d'Auteuil", "Auteuil"),
        ("Quartier Saint-Ambroise", "Saint-Ambroise"),
        ("Quartier Les Halles", "Les Halles"),
        ("Quartier de l'Europe", "Quartier de l'Europe"),  # kept: it would read as the continent
        ("Quartier du Combat", "Quartier du Combat"),
        ("Bonne-Nouvelle", "Bonne-Nouvelle"),
    ):
        assert shorten(before, rules("paris"), keep) == after
    assert shorten("Bratislava-Petržalka", rules("bratislava")) == "Petržalka"
    # no rule drops a language: Brussels keeps its bilingual names
    assert "places" not in caps["brussels"]
    # a rule never empties a name
    assert shorten("Bratislava-", rules("bratislava")) == "Bratislava-"
    assert "name_rules" not in (caps["stockholm"].get("places") or {})


def test_carriageways_pair_across_a_tunnel_portal():
    # the eastbound carriageway goes underground at x = 500, the westbound one at x = 700
    pieces = [
        Piece(shapely.LineString([(0, 0), (500, 0)]), "trunk", False, 7, key="E 4.25", oneway=True),
        Piece(
            shapely.LineString([(500, 0), (1000, 0)]), "trunk", True, 7, key="E 4.25", oneway=True
        ),
        Piece(
            shapely.LineString([(1000, 20), (700, 20)]), "trunk", True, 7, key="E 4.25", oneway=True
        ),
        Piece(
            shapely.LineString([(700, 20), (0, 20)]), "trunk", False, 7, key="E 4.25", oneway=True
        ),
    ]
    out, st = merge_dual_carriageways(pieces, ROADS)
    duals = [p for p in out if p.dual]
    assert st.pairs == 1 and not [p for p in out if p.oneway and p.geom.length > 50]
    under = shapely.union_all([p.geom for p in duals if p.tunnel])
    assert 650 < under.bounds[0] < 750  # a tunnel only where both carriageways are


def test_carriageways_pair_across_classes_and_take_the_better_class():
    # the westbound carriageway has a block tagged a class lower (Drottningholmsvägen)
    pieces = [
        piece([(0, 0), (1000, 0)]),
        piece([(1000, 20), (520, 20)]),
        piece([(520, 20), (480, 20)], cls="tertiary"),
        piece([(480, 20), (0, 20)]),
    ]
    out, st = merge_dual_carriageways(pieces, ROADS)
    duals = [p for p in out if p.dual]
    assert st.pairs == 1 and {p.cls for p in duals} == {"secondary"}
    assert not [p for p in out if p.oneway and not p.dual]
    assert abs(shapely.union_all([p.geom for p in duals]).length - 1000) < 20


def test_short_one_way_stubs_between_stretches_of_a_centreline_are_dropped():
    # one carriageway is broken for a block (another street takes it): the other side's block,
    # left alone, would be a box's wall between the two stretches of the centreline
    def road(gap):
        return [
            piece([(0, 0), (500 - gap / 2, 0)]),
            piece([(500 + gap / 2, 0), (1000, 0)]),
            piece([(1000, 20), (0, 20)]),
        ]

    out, st = merge_dual_carriageways(road(60), ROADS)
    assert st.pairs == 2 and st.stubs_dropped == 1
    assert not [p for p in out if p.oneway and not p.dual]
    centre = shapely.line_merge(shapely.union_all([p.geom for p in out if p.dual]))
    assert centre.geom_type == "LineString" and abs(centre.length - 1000) < 20  # one line
    # longer than stub_max_m (120 m, twice merge_max_m): the carriageway is kept
    out, st = merge_dual_carriageways(road(300), ROADS)
    assert st.stubs_dropped == 0 and [p for p in out if p.oneway and p.geom.length > 300]


def test_a_roundabout_of_one_way_ways_is_kept():
    # Lindhagensplan: a ring of one-way ways, its own name, beside a merged road
    ring = shapely.Point(500, 100).buffer(40).exterior
    arcs = [shapely.ops.substring(ring, a, a + ring.length / 4) for a in range(0, 250, 63)]
    pieces = [piece([(0, 0), (1000, 0)]), piece([(1000, 20), (0, 20)])]
    pieces += [piece(list(a.coords), key="Lindhagensplan") for a in arcs if a.length > 1]
    out, st = merge_dual_carriageways(pieces, ROADS)
    kept = [p for p in out if p.key == "Lindhagensplan"]
    assert st.stubs_dropped == 0 and not any(p.dual for p in kept)
    assert abs(sum(p.geom.length for p in kept) - ring.length) < 1


def test_a_centreline_drawn_twice_is_drawn_once():
    def dual(coords, key="Ring"):
        return Piece(shapely.LineString(coords), "secondary", False, 10, True, key, name=key)

    out = _dedupe_centres(
        [
            dual([(0, 0), (65, 0)]),
            dual([(20, 0), (23, 0)]),  # on the longer one
            dual([(0, 0), (65, 0)]),  # the same line again
            dual([(0, 0), (65, 0)], key="Other"),  # another road on it: kept
        ],
        MergeStats(),
    )
    assert sorted((p.key, round(p.geom.length)) for p in out) == [("Other", 65), ("Ring", 65)]


def test_a_short_pair_continuing_a_merged_stretch_is_merged():
    # Drottningholmsvägen at Fridhemsplan: the eastbound carriageway forks 70 m before the road
    # ends (a branch of the same road), so its last block pairs over under merge_min_m
    pieces = [
        piece([(0, 0), (500, 0)]),
        piece([(500, 0), (570, 0)]),
        piece([(500, 0), (545, -20)], cls="tertiary"),  # the branch
        piece([(570, 20), (0, 20)]),
    ]
    out, st = merge_dual_carriageways(pieces, ROADS)
    assert st.pairs == 2 and st.short_pairs == 1
    centre = shapely.line_merge(shapely.union_all([p.geom for p in out if p.dual]))
    assert centre.geom_type == "LineString" and centre.length > 550  # one line to the end
    left = [p for p in out if p.oneway and not p.dual]
    assert all(p.geom.bounds[1] < -1 for p in left)  # only the branch is left
    # a short pair on its own (nothing merged to continue) stays two lines
    out, st = merge_dual_carriageways([piece([(0, 0), (70, 0)]), piece([(70, 20), (0, 20)])], ROADS)
    assert st.pairs == 0
