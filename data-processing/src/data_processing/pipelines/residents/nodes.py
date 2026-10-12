"""Common step 4: place the population in buildings.

GHS-POP counts people per 100 m cell (Mollweide). Each 10 m square takes the GHS cell that contains
its centre. Within each GHS cell, the people are spread over the squares that contain buildings
(Overture footprints, all buildings), in proportion to the building area in each square; a cell
with people but no building spreads them evenly over its squares. A building's residents are then
the people of each square it covers, shared between the buildings of that square by their area.
"""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import rasterio
import shapely
from rasterio.windows import Window

from data_processing.core.download import fetch_file, now_utc, read_manifest, write_manifest
from data_processing.core.geo import lonlat_bbox, polygonal, transformer
from data_processing.core.grid import Grid
from data_processing.pipelines.grid.nodes import raster

log = logging.getLogger(__name__)


# ------------------------------------------------------------------ buildings (Overture)
def download_buildings(
    capital: str, boundaries: gpd.GeoDataFrame, method: dict, sources: dict, paths: dict
) -> dict:
    """Overture buildings whose bounding box meets the analysis area's, from the pinned release."""
    ov = sources["overture"]
    folder = Path(paths["raw"]) / "overture_buildings" / capital
    target = folder / "buildings.parquet"
    area = boundaries.set_index("name").geometry["analysis"]
    w, s, e, n = lonlat_bbox(area, method["crs"], pad_deg=0.002)
    manifest = read_manifest(folder)
    entry = manifest["files"].get(target.name)
    query = {"release": ov["release"], "bbox": [round(v, 6) for v in (w, s, e, n)]}
    if entry and target.exists() and entry.get("query") == query:
        return {"file": str(target), **entry}
    fs = pafs.S3FileSystem(anonymous=True, region=ov["s3_region"])
    dset = ds.dataset(f"{ov['s3_bucket']}/{ov['s3_prefix']}", filesystem=fs, format="parquet")
    flt = (
        (pc.field("bbox", "xmin") < e)
        & (pc.field("bbox", "xmax") > w)
        & (pc.field("bbox", "ymin") < n)
        & (pc.field("bbox", "ymax") > s)
    )
    tbl = dset.to_table(
        columns=["id", "geometry"], filter=flt, batch_readahead=32, fragment_readahead=16
    )
    folder.mkdir(parents=True, exist_ok=True)
    pq.write_table(tbl, target, compression="zstd")
    manifest["files"][target.name] = {
        "url": f"s3://{ov['s3_bucket']}/{ov['s3_prefix']}",
        "query": query,
        "downloaded": now_utc(),
        "rows": tbl.num_rows,
        "bytes": target.stat().st_size,
    }
    write_manifest(folder, manifest)
    log.info("Overture %s: %d buildings", ov["release"], tbl.num_rows)
    return {"file": str(target), **manifest["files"][target.name]}


def prepare_buildings(
    buildings_source: dict, boundaries: gpd.GeoDataFrame, method: dict
) -> gpd.GeoDataFrame:
    """Valid footprints over the analysis area, with a sequential id (exact as a 32-bit float),
    a representative point (always inside) and whether that point is in the city (scored)."""
    df = pd.read_parquet(buildings_source["file"])
    geom = gpd.GeoSeries.from_wkb(df["geometry"], crs="EPSG:4326").to_crs(method["crs"])
    b = boundaries.set_index("name").geometry
    gdf = gpd.GeoDataFrame(
        {"overture_id": df["id"].astype(str)}, geometry=geom.values, crs=method["crs"]
    )
    gdf["geometry"] = [polygonal(g) for g in gdf.geometry.values]
    gdf = gdf[~gdf.geometry.is_empty]
    gdf = gdf[gdf.intersects(b["analysis"])]
    gdf = gdf.drop_duplicates("overture_id").sort_values("overture_id").reset_index(drop=True)
    gdf.insert(0, "id", np.arange(1, len(gdf) + 1, dtype=np.int32))
    rp = gdf.geometry.representative_point()
    gdf["cx"] = rp.x.values
    gdf["cy"] = rp.y.values
    gdf["scored"] = shapely.contains_xy(b["city"], gdf["cx"].values, gdf["cy"].values)
    gdf["area_m2"] = gdf.geometry.area
    if len(gdf) >= 16_777_216:
        raise ValueError("building ids would not be exact as 32-bit floats")
    log.info(
        "buildings: %d over the analysis area, %d in the city", len(gdf), int(gdf.scored.sum())
    )
    return gdf


# ------------------------------------------------------------------ population (GHS-POP)
def _ghs_tiles(grid: Grid, ghs: dict) -> list[tuple[int, int]]:
    t = transformer(grid.crs, ghs["crs"])
    minx, miny, maxx, maxy = grid.bounds
    fx, fy = np.meshgrid(np.linspace(minx, maxx, 21), np.linspace(miny, maxy, 21))
    x, y = t.transform(fx.ravel(), fy.ravel())
    x0, y0 = ghs["tile_origin"]
    size = ghs["tile_size"]
    cols = range(int((min(x) - x0) // size) + 1, int((max(x) - x0) // size) + 2)
    rows = range(int((y0 - max(y)) // size) + 1, int((y0 - min(y)) // size) + 2)
    return [(r, c) for r in rows for c in cols]


def download_population(grid: dict, sources: dict, paths: dict) -> dict:
    ghs = sources["ghs_pop"]
    g = Grid.from_dict(grid)
    folder = Path(paths["raw"]) / "ghs_pop"
    files = {}
    for r, c in _ghs_tiles(g, ghs):
        name = f"{ghs['release']}_R{r}_C{c}.zip"
        p = fetch_file(ghs["base_url"] + name, folder, allow_404=True)
        if p is not None:
            files[f"R{r}_C{c}"] = str(p)
    if not files:
        raise RuntimeError("no GHS-POP tile covers the grid")
    m = read_manifest(folder)["files"]
    return {
        "release": ghs["release"],
        "tiles": files,
        "sha256": {k: m[Path(v).name]["sha256"] for k, v in files.items()},
    }


def ghs_cells(grid: Grid, ghs: dict, population_source: dict) -> tuple[np.ndarray, np.ndarray]:
    """For every square, the id of the GHS cell containing its centre, and the cell's people."""
    t = transformer(grid.crs, ghs["crs"])
    xs, ys = grid.centres()
    X, Y = np.meshgrid(xs, ys)
    mx, my = t.transform(X.ravel(), Y.ravel())
    x0, y0 = ghs["tile_origin"]
    res = 100.0
    gj = np.floor((np.asarray(mx) - x0) / res).astype(np.int64)
    gi = np.floor((y0 - np.asarray(my)) / res).astype(np.int64)
    n_per_tile = round(ghs["tile_size"] / res)
    cell = gi * (n_per_tile * 1000) + gj
    pop = np.zeros(cell.shape, np.float64)
    tr, tc = gi // n_per_tile + 1, gj // n_per_tile + 1
    for key, path in population_source["tiles"].items():
        r, c = (int(v[1:]) for v in key.split("_"))
        sel = (tr == r) & (tc == c)
        if not sel.any():
            continue
        li = gi[sel] - (r - 1) * n_per_tile
        lj = gj[sel] - (c - 1) * n_per_tile
        i0, i1, j0, j1 = li.min(), li.max() + 1, lj.min(), lj.max() + 1
        name = Path(path).stem + ".tif"
        with rasterio.open(f"/vsizip/{path}/{name}") as src:
            # tile georeference must match the GHSL tiling schema
            assert abs(src.transform.a - res) < 1e-6
            assert abs(src.transform.c - (x0 + (c - 1) * ghs["tile_size"])) < 1
            assert abs(src.transform.f - (y0 - (r - 1) * ghs["tile_size"])) < 1
            a = src.read(1, window=Window(j0, i0, j1 - j0, i1 - i0)).astype(np.float64)
            nodata = src.nodata
        if nodata is not None:
            a[a == nodata] = 0
        a[~np.isfinite(a) | (a < 0)] = 0
        pop[sel] = a[li - i0, lj - j0]
    return cell.reshape(grid.shape), pop.reshape(grid.shape)


def building_square_areas(
    buildings: gpd.GeoDataFrame, grid: Grid, chunk: int = 2_000_000
) -> pd.DataFrame:
    """Area of each building inside each square it covers (exact, vector)."""
    geoms = buildings.geometry.values
    b = shapely.bounds(geoms)
    i0, j0 = grid.index_of(b[:, 0], b[:, 3])
    i1, j1 = grid.index_of(b[:, 2], b[:, 1])
    i0, j0 = np.clip(i0, 0, grid.height - 1), np.clip(j0, 0, grid.width - 1)
    i1, j1 = np.clip(i1, 0, grid.height - 1), np.clip(j1, 0, grid.width - 1)
    ni, nj = i1 - i0 + 1, j1 - j0 + 1
    counts = ni * nj
    bidx = np.repeat(np.arange(len(geoms)), counts)
    start = np.repeat(np.cumsum(counts) - counts, counts)
    k = np.arange(len(bidx)) - start
    ii = i0[bidx] + k // nj[bidx]
    jj = j0[bidx] + k % nj[bidx]
    out_b, out_sq, out_a = [], [], []
    shapely.prepare(geoms)
    for c0 in range(0, len(bidx), chunk):
        sl = slice(c0, c0 + chunk)
        x, y = grid.centre_of(ii[sl], jj[sl])
        h = grid.res / 2
        boxes = shapely.box(x - h, y - h, x + h, y + h)
        a = shapely.area(shapely.intersection(geoms[bidx[sl]], boxes))
        keep = a > 0
        out_b.append(bidx[sl][keep])
        out_sq.append((ii[sl] * grid.width + jj[sl])[keep])
        out_a.append(a[keep])
    return pd.DataFrame(
        {
            "b": np.concatenate(out_b),
            "sq": np.concatenate(out_sq),
            "area": np.concatenate(out_a),
        }
    )


def spread_population(cell: np.ndarray, pop: np.ndarray, barea: np.ndarray):
    """People per square. ``cell``: GHS cell of each square; ``pop``: that cell's people (the
    same value on each of its squares); ``barea``: building area in each square. A cell's people
    go to its squares in proportion to building area, or evenly when it has no building.
    Returns the people per square and whether each square's cell was spread evenly."""
    _, inv = np.unique(cell, return_inverse=True)
    cell_pop = np.zeros(inv.max() + 1)
    np.maximum.at(cell_pop, inv, pop)
    cell_barea = np.bincount(inv, weights=barea, minlength=len(cell_pop))
    cell_n = np.bincount(inv, minlength=len(cell_pop))
    evenly = cell_barea[inv] <= 0
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(evenly, cell_pop[inv] / cell_n[inv], cell_pop[inv] * barea / cell_barea[inv])
    return out, evenly


def place_population(
    grid: dict, city_mask: dict, buildings: gpd.GeoDataFrame, population_source: dict, sources: dict
) -> tuple:
    g = Grid.from_dict(grid)
    cell, pop = ghs_cells(g, sources["ghs_pop"], population_source)
    pairs = building_square_areas(buildings, g)
    barea = np.bincount(pairs.sq.values, weights=pairs.area.values, minlength=g.width * g.height)

    pop10, spread_evenly = spread_population(cell.ravel(), pop.ravel(), barea)
    pop10 = pop10.reshape(g.shape)

    share = pairs.area.values / barea[pairs.sq.values]
    residents = np.bincount(
        pairs.b.values, weights=pop10.ravel()[pairs.sq.values] * share, minlength=len(buildings)
    )
    bres = pd.DataFrame({"id": buildings["id"].values, "residents": residents})

    city = city_mask["array"].astype(bool)
    stats = {
        "ghs_release": population_source["release"],
        "residents_in_city": float(pop10[city].sum()),
        "residents_in_grid": float(pop10.sum()),
        "residents_in_buildings_in_city": float(residents[buildings["scored"].values].sum()),
        "people_spread_evenly_in_city": float(
            np.where(spread_evenly.reshape(g.shape), pop10, 0)[city].sum()
        ),
        "ghs_cells_in_grid": int(len(np.unique(cell))),
        "building_square_pairs": int(len(pairs)),
    }
    log.info(
        "residents in the city: %.0f (%.0f in scored buildings)",
        stats["residents_in_city"],
        stats["residents_in_buildings_in_city"],
    )
    return raster(g, pop10.astype(np.float32)), bres, stats
