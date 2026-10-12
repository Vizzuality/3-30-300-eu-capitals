import numpy as np
import pytest

from data_processing.core.grid import Grid, disc_offsets


def test_grid_snaps_outward_to_100_m():
    g = Grid.around((4760951.3, 4039712.0, 4789049.9, 4063612.5))
    assert (g.x0, g.y1) == (4760900, 4063700)
    minx, miny, maxx, maxy = g.bounds
    assert minx <= 4760951.3 and miny <= 4039712.0 and maxx >= 4789049.9 and maxy >= 4063612.5
    assert all(v % 100 == 0 for v in g.bounds)


def test_centres_and_index_round_trip():
    g = Grid(1000.0, 2000.0, 5, 4)
    x, y = g.centre_of(np.array([0, 3]), np.array([0, 4]))
    assert x.tolist() == [1005.0, 1045.0]
    assert y.tolist() == [1995.0, 1965.0]
    i, j = g.index_of(x, y)
    assert i.tolist() == [0, 3] and j.tolist() == [0, 4]


def test_square_edge_belongs_to_the_square_east_and_south():
    g = Grid(0.0, 100.0, 10, 10)
    i, j = g.index_of(10.0, 90.0)  # a corner shared by four squares
    assert (int(i), int(j)) == (1, 1)


def test_fine_grid_nests_exactly():
    g = Grid(0.0, 100.0, 10, 10)
    f = g.fine(1.0)
    assert f.shape == (100, 100) and f.bounds == g.bounds
    with pytest.raises(ValueError):
        g.fine(3.0)


def test_disc_includes_squares_exactly_at_the_radius():
    k = disc_offsets(500.0, 10.0)
    assert k.shape == (101, 101)
    assert k[50, 0] and k[0, 50]  # 500 m away exactly: inside
    assert not k[0, 0]
    assert k.sum() == 7845  # squares whose centre lies within 500 m (pinned)
