import math

import numpy as np
from rasterio.transform import from_origin

from data_processing.check import _tile_of
from data_processing.core.geo import web_mercator_tile
from data_processing.core.labels import reading_angle, straight_stretches
from data_processing.core.tiles import TileFrame, render_grid_tile, tile_bounds
from data_processing.inspect_evidence import to_lonlat


def test_evidence_coordinates_round_trip():
    frame = TileFrame(15, 18013, 9550)
    minx, miny, maxx, maxy = tile_bounds(15, 18013, 9550)
    mx, my = minx + 123.45, maxy - 321.0
    p = frame.from_merc([mx], [my])[0]
    lon, lat = to_lonlat((15, 18013, 9550), p)
    r = 6378137.0
    lon0, lat0 = math.degrees(mx / r), math.degrees(math.atan(math.sinh(my / r)))
    assert abs(lon - lon0) < 2e-6 and abs(lat - lat0) < 2e-6  # within a decimetre


def test_evidence_tile_of_a_point_matches_the_client_formula():
    lons = np.array([18.0712, 18.0, 17.95])
    lats = np.array([59.3151, 59.33, 59.2])
    x, y = web_mercator_tile(lons, lats, 15)
    for lo, la, xx, yy in zip(lons, lats, x, y, strict=True):
        assert _tile_of(lo, la, 15) == (xx, yy)


def test_grid_tile_takes_the_nearest_square():
    values = np.array([[0, 1], [2, 3]], np.uint8)
    t = from_origin(0.0, 20.0, 10.0, 10.0)
    px = render_grid_tile(values, t, "EPSG:3857", 0, 0, 0, 8, 4)
    assert set(np.unique(px)) <= {0, 1, 2, 3, 4}
    assert (px == 4).sum() >= 60  # the world tile is almost entirely outside the grid


def test_names_never_read_upside_down():
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (-1, -1), (1, -1)]:
        a = reading_angle(dx, dy)
        assert -90 < a <= 90


def test_straight_stretches_split_at_bends():
    pts = np.array([[0, 0], [100, 0], [200, 0], [200, 100]], float)
    s = straight_stretches(pts, 2.0)
    assert len(s) == 2
