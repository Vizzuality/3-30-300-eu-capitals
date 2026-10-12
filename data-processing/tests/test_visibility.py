import numpy as np
import shapely

from data_processing.core.visibility import (
    Scene,
    building_edges,
    segments_intersect,
    visible_counts,
    visible_pairs,
)


def test_segments_intersect_cases():
    assert segments_intersect(0, 0, 10, 10, 0, 10, 10, 0)  # crossing
    assert segments_intersect(0, 0, 10, 0, 10, 0, 10, 5)  # touching at an end
    assert not segments_intersect(0, 0, 10, 0, 0, 1, 10, 1)  # parallel
    assert not segments_intersect(0, 0, 4, 0, 6, 0, 10, 0)  # collinear, apart
    assert segments_intersect(0, 0, 6, 0, 4, 0, 10, 0)  # collinear, overlapping


def test_building_edges_include_courtyards():
    poly = shapely.Polygon([(0, 0), (10, 0), (10, 10), (0, 10)], [[(4, 4), (6, 4), (6, 6), (4, 6)]])
    edges, src = building_edges([poly])
    assert len(edges) == 8 and set(src) == {0}


def scene(trees, buildings):
    tx = np.array([t[0] for t in trees], float)
    ty = np.array([t[1] for t in trees], float)
    return Scene(tx, ty, buildings, 0.0, 200.0, 20, 20, 10.0, 10.0)


def test_a_building_blocks_the_view_and_water_does_not():
    wall = shapely.box(48, 90, 52, 110)
    s = scene([(60, 100), (40, 100), (50, 120)], [wall])
    # viewer west of the wall: sees the tree on its side and the one north, not the one behind
    n = visible_counts(s, [30.0], [100.0], radius=30)
    assert n.tolist() == [2]


def test_radius_is_inclusive():
    s = scene([(130, 100), (130.01, 100)], [])
    assert visible_counts(s, [100.0], [100.0], radius=30).tolist() == [1]


def test_own_building_does_not_block_a_square_inside_it():
    house = shapely.box(90, 90, 110, 110)
    s = scene([(120, 100), (80, 100), (100, 125)], [house])
    inside = (np.array([100.0]), np.array([100.0]))
    assert visible_counts(s, *inside, radius=30).tolist() == [0]
    assert visible_counts(s, *inside, own1=[0], radius=30).tolist() == [3]


def test_cap_stops_counting():
    s = scene([(100 + i, 100) for i in range(1, 8)], [])
    assert visible_counts(s, [100.0], [100.0], radius=30, cap=3).tolist() == [3]
    assert visible_counts(s, [100.0], [100.0], radius=30).tolist() == [7]


def test_visible_pairs_lists_original_tree_ids():
    wall = shapely.box(108, 50, 110, 150)
    s = scene([(120, 100), (90, 100), (100, 80)], [wall])
    viewer, tree, dist = visible_pairs(s, [100.0, 130.0], [100.0, 100.0], radius=30)
    seen = {(int(v), int(t)) for v, t in zip(viewer, tree, strict=True)}
    assert seen == {(0, 1), (0, 2), (1, 0)}
    assert np.all(dist <= 30)
