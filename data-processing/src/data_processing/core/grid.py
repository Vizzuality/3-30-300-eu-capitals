"""The shared 10 m grid on which every layer is computed.

Every layer is computed on the same squares: EPSG:3035 (ETRS89-LAEA), 10 m, with the origin on
multiples of 100 m so that the grid lines up with Europe's statistical grid. Rows go from north to
south, columns from west to east; square ``(i, j)`` has its centre at
``(x0 + (j + 0.5) * res, y1 - (i + 0.5) * res)``.

A 1 m grid with the same origin (``fine``) carries the canopy height: each 10 m square holds exactly
10 x 10 of its pixels.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np
from rasterio.transform import Affine, from_origin


@dataclass(frozen=True)
class Grid:
    x0: float  # west edge, metres
    y1: float  # north edge, metres
    width: int  # squares, west to east
    height: int  # squares, north to south
    res: float = 10.0
    crs: str = "EPSG:3035"

    @classmethod
    def around(cls, bounds, res: float = 10.0, snap: float = 100.0, crs: str = "EPSG:3035"):
        """Smallest grid that covers ``bounds`` (minx, miny, maxx, maxy) with edges on ``snap``."""
        minx, miny, maxx, maxy = bounds
        x0 = math.floor(minx / snap) * snap
        y0 = math.floor(miny / snap) * snap
        x1 = math.ceil(maxx / snap) * snap
        y1 = math.ceil(maxy / snap) * snap
        return cls(x0, y1, round((x1 - x0) / res), round((y1 - y0) / res), res, crs)

    @classmethod
    def from_dict(cls, d: dict) -> Grid:
        return cls(**{k: d[k] for k in ("x0", "y1", "width", "height", "res", "crs")})

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def shape(self) -> tuple[int, int]:
        return (self.height, self.width)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return (
            self.x0,
            self.y1 - self.height * self.res,
            self.x0 + self.width * self.res,
            self.y1,
        )

    @property
    def transform(self) -> Affine:
        return from_origin(self.x0, self.y1, self.res, self.res)

    def fine(self, res: float) -> Grid:
        """The same extent at a finer resolution (``res`` must divide the square size)."""
        k = round(self.res / res)
        if abs(k * res - self.res) > 1e-9:
            raise ValueError(f"{res} m does not divide {self.res} m")
        return Grid(self.x0, self.y1, self.width * k, self.height * k, res, self.crs)

    def centres(self) -> tuple[np.ndarray, np.ndarray]:
        """x of each column centre and y of each row centre."""
        xs = self.x0 + (np.arange(self.width) + 0.5) * self.res
        ys = self.y1 - (np.arange(self.height) + 0.5) * self.res
        return xs, ys

    def centre_of(self, i, j):
        return self.x0 + (np.asarray(j) + 0.5) * self.res, self.y1 - (
            np.asarray(i) + 0.5
        ) * self.res

    def index_of(self, x, y):
        """(row, column) of the square containing each point (may fall outside the grid)."""
        j = np.floor((np.asarray(x) - self.x0) / self.res).astype(np.int64)
        i = np.floor((self.y1 - np.asarray(y)) / self.res).astype(np.int64)
        return i, j

    def contains_index(self, i, j) -> np.ndarray:
        i, j = np.asarray(i), np.asarray(j)
        return (i >= 0) & (i < self.height) & (j >= 0) & (j < self.width)


def disc_offsets(radius: float, res: float) -> np.ndarray:
    """Boolean kernel of the squares whose centres lie within ``radius`` of the centre square's."""
    r = int(radius // res)
    yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
    return (xx * res) ** 2 + (yy * res) ** 2 <= radius**2
