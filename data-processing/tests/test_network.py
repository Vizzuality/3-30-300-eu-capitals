import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from data_processing.config import parameters
from data_processing.core.network import (
    Network,
    crosses_water,
    first_dry,
    is_walkable,
    network_points,
    source_intervals,
    walk_distances,
)
from data_processing.pipelines.rule300.nodes import access_fringe

RULE = parameters()["method"]["rule300"]


def test_walkable_ways():
    assert is_walkable({"highway": "footway"}, RULE)
    assert is_walkable({"highway": "cycleway"}, RULE)  # shared paths are walkable unless foot=no
    assert is_walkable({"highway": "residential"}, RULE)
    assert not is_walkable({"highway": "motorway"}, RULE)
    assert not is_walkable({"highway": "footway", "foot": "no"}, RULE)
    assert not is_walkable({"highway": "service", "access": "private"}, RULE)
    assert is_walkable({"highway": "service", "access": "private", "foot": "yes"}, RULE)
    assert not is_walkable({"highway": "trunk", "motorroad": "yes"}, RULE)
    assert not is_walkable({"route": "ferry"}, RULE)  # ferries are not part of the network
    assert not is_walkable({"highway": "pedestrian", "area": "yes"}, RULE)


def line_network():
    """A straight path from x=0 to x=400 (nodes every 100 m) and a branch."""
    x = np.array([0.0, 100, 200, 300, 400, 200])
    y = np.array([0.0, 0, 0, 0, 0, 100])
    u = np.array([0, 1, 2, 3, 2])
    v = np.array([1, 2, 3, 4, 5])
    return Network(x, y, u, v, np.hypot(x[u] - x[v], y[u] - y[v]), np.arange(5))


def test_distances_from_the_stretch_near_a_park():
    net = line_network()
    park = shapely.box(390, -50, 450, 50)  # touches the end of the path
    fringe = np.array([park.buffer(20)], dtype=object)
    iv = source_intervals(net, fringe, np.array([7]))
    assert len(iv) == 1 and iv.iloc[0]["park"] == 7
    assert abs(iv.iloc[0]["s0"] - 70) < 1e-6  # 370 m: 20 m before the park
    d = walk_distances(net, iv)
    assert d.node[4] == 0.0
    assert abs(d.node[0] - 370) < 0.01
    assert abs(d.node[5] - (170 + 100)) < 0.01
    pts = network_points(net, d, iv, 5.0)
    # a point on the source stretch is at distance 0
    on = (pts.seg == 3) & (pts.s > 75)
    assert np.all(pts.dist[on] == 0)


def test_unreachable_network_is_infinite():
    net = line_network()
    iv = pd.DataFrame({"seg": [], "s0": [], "s1": [], "park": []})
    iv = iv.astype({"seg": int, "park": int})
    fringe = np.array([shapely.box(1000, 1000, 1010, 1010)], dtype=object)
    iv = source_intervals(net, fringe, np.array([0]))
    assert len(iv) == 0


def test_straight_legs_never_cross_water():
    water = np.zeros((50, 50), np.uint8)
    water[:, 20:25] = 1  # a 10 m wide canal at x = 40–50 (2 m pixels, origin 0, 100)
    assert crosses_water(10.0, 50.0, 80.0, 50.0, water, 0.0, 100.0, 2.0, 2.0)
    assert not crosses_water(10.0, 50.0, 30.0, 50.0, water, 0.0, 100.0, 2.0, 2.0)
    # a path point on the quay itself is not cut off by its own pixel
    assert not crosses_water(30.0, 50.0, 40.5, 50.0, water, 0.0, 100.0, 2.0, 2.0)


def test_first_dry_skips_candidates_across_water():
    water = np.zeros((50, 50), np.uint8)
    water[:, 20:25] = 1
    px = np.array([55.0, 20.0])  # nearest across the canal, then one on the same bank
    py = np.array([50.0, 50.0])
    cand = np.array([[0, 1]])
    d = np.array([[20.0, 15.0]])
    best = first_dry(
        np.array([35.0]), np.array([50.0]), cand, d, px, py, water, 0.0, 100.0, 2.0, 2.0
    )
    assert best.tolist() == [1]


def test_fringe_does_not_reach_across_a_canal():
    park = shapely.box(0, 0, 100, 100)
    canal = shapely.box(100, -500, 110, 500)  # 10 m wide, along the park's east side
    parks = gpd.GeoDataFrame({"pid": [5]}, geometry=[park], crs="EPSG:3035")
    water = gpd.GeoDataFrame({"kind": ["inland"]}, geometry=[canal], crs="EPSG:3035")
    pieces, owner = access_fringe(parks, water, 20.0)
    fringe = shapely.union_all(pieces)
    assert set(owner) == {5}
    assert fringe.contains(shapely.Point(-15, 50))  # same bank, 15 m from the park
    assert not fringe.contains(shapely.Point(115, 50))  # other bank, 15 m away across water
    assert not fringe.contains(shapely.Point(105, 50))  # on the water
