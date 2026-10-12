import numpy as np

from data_processing.core.grid import Grid
from data_processing.pipelines.combined.nodes import resident_shares, suggested_place
from data_processing.pipelines.residents.nodes import spread_population


def test_people_go_to_squares_with_buildings_in_proportion_to_their_area():
    cell = np.array([1, 1, 1, 1, 2, 2])
    pop = np.array([100, 100, 100, 100, 6, 6], float)
    barea = np.array([0, 30, 10, 0, 0, 0], float)
    out, evenly = spread_population(cell, pop, barea)
    assert np.allclose(out, [0, 75, 25, 0, 3, 3])
    assert evenly.tolist() == [False] * 4 + [True] * 2
    # every person of every cell is placed once
    assert np.isclose(out.sum(), 106)


def test_shares_are_weighted_by_residents():
    met = np.array([0, 1, 3, 3])
    pop = np.array([10.0, 30, 60, 0])
    r3 = np.array([False, True, True, True])
    r30 = np.array([False, False, True, True])
    r300 = np.array([False, False, True, True])
    s = resident_shares(met, r3, r30, r300, pop)
    assert np.allclose(s["met"], [0.1, 0.3, 0.0, 0.6])
    assert np.isclose(s["rules"]["3"], 0.9) and np.isclose(s["rules"]["30"], 0.6)
    assert np.isclose(sum(s["met"]), 1)


def test_suggested_place_is_the_most_populated_500_m_square_near_the_centre():
    g = Grid(0.0, 5000.0, 500, 500)
    pop = np.zeros(g.shape)
    pop[250, 250] = 100  # centre of the area
    pop[260:265, 240:245] = 10  # a dense block 100 m away (250 people)
    pop[5, 5] = 10_000  # far away: outside 2 km of the weighted centre? (it pulls it)
    (sx, sy), _, total = suggested_place(pop[:, :], g, 500.0, 2000.0)
    assert sx % 500 == 250 and sy % 500 == 250  # a 500 m square's centre
