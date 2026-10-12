"""Pinned values: a change here must be a deliberate change of method or of boundary."""

import numpy as np
import pytest
from kedro.io.core import DatasetError
from rasterio.transform import from_origin

from data_processing.config import parameters
from data_processing.datasets import GridRasterDataset, JSONDataset, NpzDataset, PathDataset
from data_processing.pipelines.boundaries.nodes import capital_config

P = parameters()


def test_stockholm_boundary_is_pinned():
    cfg = capital_config("stockholm", P["capitals"])
    assert cfg["osm_relation"] == 398021 and cfg["osm_version"] == 98
    assert cfg["wikidata"] == "Q1754" and cfg["country_wikidata"] == "Q34"


def test_unpinned_capital_does_not_run():
    with pytest.raises(ValueError):
        capital_config("madrid", P["capitals"])


def test_method_numbers():
    m = P["method"]
    assert m["crs"] == "EPSG:3035" and m["grid_res_m"] == 10 and m["buffer_m"] == 1000
    assert m["trees"] == {"min_height_m": 3, "smoothing_sigma_m": 1, "peak_radius_m": 3}
    assert m["rule3"]["view_radius_m"] == 30 and m["rule3"]["min_trees"] == 3
    assert m["rule30"] == {"canopy_min_height_m": 3, "radius_m": 500, "threshold": 0.30}
    r = m["rule300"]
    assert r["min_area_m2"] == 10000 and r["entrance_m"] == 20 and r["max_snap_m"] == 100
    assert r["threshold_m"] == 300
    assert r["green_tags"] == {
        "leisure": ["park", "garden", "nature_reserve"],
        "landuse": ["forest"],
        "natural": ["wood"],
    }
    f = m["facades"]
    assert (f["corner_deg"], f["min_length_m"], f["sample_step_m"], f["sample_offset_m"]) == (
        25,
        3,
        5,
        1,
    )
    assert f["building_share"] == 0.5


def test_sources_are_pinned():
    s = P["sources"]
    assert s["overture"]["release"] == "2026-09-23.1"
    assert s["ghs_pop"]["release"] == "GHS_POP_E2020_GLOBE_R2023A_54009_100_V1_0"
    assert "forests/v1/" in s["canopy_height"]["base_url"]
    assert s["osm"]["extract_date"] == "261011"
    assert P["capitals"]["stockholm"]["osm_extract"] == "europe/sweden"
    assert list(s["credits"]) == [
        "osm",
        "osm_land_polygons",
        "overture_buildings",
        "canopy_height",
        "ghs_pop",
        "wikidata",
    ]


def test_datasets_round_trip(tmp_path):
    r = GridRasterDataset(str(tmp_path / "a.tif"))
    arr = np.arange(12, dtype=np.uint8).reshape(3, 4)
    r.save({"array": arr, "transform": from_origin(0, 30, 10, 10), "crs": "EPSG:3035"})
    back = r.load()
    assert (back["array"] == arr).all() and back["transform"].a == 10
    j = JSONDataset(str(tmp_path / "x" / "b.json"), indent=None)
    j.save({"name": "Södermalm"})
    assert j.load() == {"name": "Södermalm"}
    n = NpzDataset(str(tmp_path / "c.npz"))
    n.save({"a": np.arange(3)})
    assert n.load()["a"].tolist() == [0, 1, 2]
    p = PathDataset(str(tmp_path / "c.npz"))
    p.save(str(tmp_path / "c.npz"))
    with pytest.raises(DatasetError, match="catalog expects"):
        p.save(str(tmp_path / "other.npz"))
