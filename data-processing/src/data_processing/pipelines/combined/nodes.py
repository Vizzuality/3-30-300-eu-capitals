"""Combined layer: number of rules met.

Each 10 m square of the city counts the rules it passes (0–3). Weighted by the residents placed in
each square, this gives the share of the city's residents meeting each rule, all three, and the
0/1/2/3 split.
"""

from __future__ import annotations

import logging

import numpy as np

from data_processing.core.geo import transformer
from data_processing.core.grid import Grid
from data_processing.pipelines.grid.nodes import raster

log = logging.getLogger(__name__)


def resident_shares(met: np.ndarray, r3, r30, r300, pop: np.ndarray) -> dict:
    """Shares of residents (``pop``) meeting 0–3 rules and each rule (inputs: city squares)."""
    total = float(pop.sum(dtype=np.float64))
    if total <= 0:
        raise ValueError("no residents in the city")
    shares = [float(pop[met == k].sum(dtype=np.float64)) / total for k in range(4)]
    return {
        "residents": total,
        "met": shares,
        "rules": {
            "3": float(pop[r3].sum(dtype=np.float64)) / total,
            "30": float(pop[r30].sum(dtype=np.float64)) / total,
            "300": float(pop[r300].sum(dtype=np.float64)) / total,
        },
    }


def suggested_place(pop: np.ndarray, grid: Grid, square_m: float, within_m: float):
    """Centre (EPSG:3035) of the most populated ``square_m`` square (aligned to the statistical
    grid) whose centre lies within ``within_m`` of the population-weighted centre of the city."""
    rows, cols = np.nonzero(pop > 0)
    w = pop[rows, cols].astype(np.float64)
    x, y = grid.centre_of(rows, cols)
    cx, cy = float((x * w).sum() / w.sum()), float((y * w).sum() / w.sum())
    bx = np.floor(x / square_m).astype(np.int64)
    by = np.floor(y / square_m).astype(np.int64)
    key = bx * 10_000_000 + by
    uk, inv = np.unique(key, return_inverse=True)
    sums = np.bincount(inv, weights=w)
    ux, uy = uk // 10_000_000, uk % 10_000_000
    mx, my = (ux + 0.5) * square_m, (uy + 0.5) * square_m
    near = np.hypot(mx - cx, my - cy) <= within_m
    if not near.any():
        raise ValueError("no populated square near the population-weighted centre")
    idx = np.nonzero(near)[0]
    best = idx[np.argmax(sums[idx])]
    return (float(mx[best]), float(my[best])), (cx, cy), float(sums[best])


def combine(
    grid: dict,
    city_mask: dict,
    water_mask: dict,
    rule3: dict,
    rule30: dict,
    rule300: dict,
    population: dict,
    method: dict,
    tiles: dict,
) -> tuple:
    g = Grid.from_dict(grid)
    city = city_mask["array"].astype(bool)
    r3 = rule3["array"].astype(bool) & city
    r30 = rule30["array"].astype(bool) & city
    r300 = rule300["array"].astype(bool) & city
    met = r3.astype(np.uint8) + r30 + r300
    met_out = np.where(city, met, 255).astype(np.uint8)
    values = np.where(city & ~water_mask["array"].astype(bool), met, tiles["grid"]["no_colour"])
    pop = np.where(city, population["array"], 0).astype(np.float64)
    s = resident_shares(met[city], r3[city], r30[city], r300[city], pop[city])
    (sx, sy), (cx, cy), spop = suggested_place(
        pop, g, method["suggested"]["square_m"], method["suggested"]["within_m"]
    )
    lon, lat = transformer(g.crs, "EPSG:4326").transform(sx, sy)
    clon, clat = transformer(g.crs, "EPSG:4326").transform(cx, cy)
    summary = {
        **s,
        "squares": int(city.sum()),
        "squares_water": int((city & water_mask["array"].astype(bool)).sum()),
        "residents_on_water_squares": float(pop[city & water_mask["array"].astype(bool)].sum()),
        "suggested": [round(lon, 6), round(lat, 6)],
        "suggested_residents": round(spop),
        "population_centre": [round(clon, 6), round(clat, 6)],
    }
    log.info(
        "residents %.0f; met 0/1/2/3 = %s; rules %s",
        s["residents"],
        [round(v, 3) for v in s["met"]],
        {k: round(v, 3) for k, v in s["rules"].items()},
    )
    return raster(g, met_out, nodata=255), raster(g, values.astype(np.uint8)), summary
