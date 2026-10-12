import numpy as np

from data_processing.core.grid import Grid
from data_processing.pipelines.rule30.nodes import disc_sums, passes_threshold, point_canopy


def test_threshold_is_inclusive_and_exact():
    assert passes_threshold([30], [100], 0.30).tolist() == [True]
    assert passes_threshold([2999], [10000], 0.30).tolist() == [False]
    assert passes_threshold([3], [10], 0.3).tolist() == [True]
    # 0.1 + 0.2 style float error must not flip the result
    assert passes_threshold([300000003], [1000000010], 0.3).tolist() == [True]
    assert passes_threshold([0], [0], 0.30).tolist() == [False]  # all water: no neighbourhood


def test_disc_sums_are_exact_integers():
    rng = np.random.default_rng(1)
    a = rng.integers(0, 101, size=(120, 130)).astype(np.uint8)
    s = disc_sums(a, 50.0, 10.0)
    i, j = 60, 70
    yy, xx = np.mgrid[-5:6, -5:6]
    k = (xx * 10) ** 2 + (yy * 10) ** 2 <= 2500
    assert s[i, j] == int(a[i - 5 : i + 6, j - 5 : j + 6][k].sum())


def test_point_canopy_matches_square_disc_at_square_centres():
    g = Grid(0.0, 1300.0, 130, 130)
    rng = np.random.default_rng(2)
    c = rng.integers(0, 101, size=g.shape).astype(np.uint8)
    land = np.full(g.shape, 100, np.uint8)
    cs, ls = point_canopy([655.0], [645.0], {"array": c}, {"array": land}, g.to_dict(), 500.0)
    ref = disc_sums(c, 500.0, 10.0)
    i, j = g.index_of(655.0, 645.0)
    assert cs[0] == ref[int(i), int(j)]
    assert ls[0] == 100 * 7845
