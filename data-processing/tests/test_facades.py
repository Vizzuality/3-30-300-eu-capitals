import numpy as np
import shapely

from data_processing.core.facades import polygon_walls, wall_samples

ARGS = dict(simplify=0.5, corner_deg=25, min_length=3, round_piece=15)


def test_rectangle_has_four_walls_with_the_outside_on_the_right():
    house = shapely.box(0, 0, 20, 10)
    walls = polygon_walls(house, **ARGS)
    assert len(walls) == 4
    for w in walls:
        pts, outward, length = wall_samples(w, 5, 1)
        assert not shapely.contains_xy(house, pts[:, 0], pts[:, 1]).any()
        assert np.allclose(np.hypot(*(pts - pts.mean(axis=0)).T).max() <= length, True)


def test_walls_shorter_than_3_m_are_dropped():
    # a 2 m step in a 20 m wall: the step is a separate wall and is dropped
    poly = shapely.Polygon([(0, 0), (20, 0), (20, 10), (10, 10), (10, 12), (0, 12)])
    lengths = sorted(
        round(float(np.hypot(*np.diff(w, axis=0).T).sum()), 1) for w in polygon_walls(poly, **ARGS)
    )
    assert 2.0 not in lengths
    assert lengths == [10.0, 10.0, 10.0, 12.0, 20.0]


def test_gentle_turns_do_not_split_a_wall():
    poly = shapely.Polygon([(0, 0), (10, 0), (20, 2), (30, 0), (30, 10), (0, 10)])
    # 11.3° turns at (10, 0) and (30, 0)… only the right angles split
    walls = polygon_walls(poly, **{**ARGS, "simplify": 0})
    assert len(walls) == 4


def test_round_building_is_cut_into_pieces():
    tower = shapely.Point(0, 0).buffer(10, 32)
    walls = polygon_walls(tower, **ARGS)
    assert len(walls) == 4  # 62.8 m / 15 m


def test_courtyard_walls_look_into_the_courtyard():
    block = shapely.Polygon(
        [(0, 0), (40, 0), (40, 40), (0, 40)], [[(10, 10), (30, 10), (30, 30), (10, 30)]]
    )
    walls = polygon_walls(block, **ARGS)
    assert len(walls) == 8
    courtyard = shapely.box(10, 10, 30, 30)
    inner = [w for w in walls if shapely.LineString(w).within(courtyard.buffer(0.01))]
    assert len(inner) == 4
    for w in inner:
        pts, _, _ = wall_samples(w, 5, 1)
        assert shapely.contains_xy(courtyard, pts[:, 0], pts[:, 1]).all()


def test_sample_spacing():
    w = np.array([[0.0, 0.0], [12.0, 0.0]])
    pts, outward, length = wall_samples(w, 5, 1)
    assert length == 12 and len(pts) == 2  # round(12 / 5)
    assert np.allclose(pts, [[3, -1], [9, -1]])
    assert outward[1] < 0  # walking east, the right is south
