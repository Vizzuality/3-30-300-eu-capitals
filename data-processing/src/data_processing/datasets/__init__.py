"""Kedro datasets for the formats this project reads and writes.

They are small on purpose: each saves one Python object to one local file and loads it back.

- ``JSONDataset``: a JSON-serialisable object.
- ``GeoParquetDataset``: a GeoDataFrame, as GeoParquet.
- ``ParquetDataset``: a DataFrame, as Parquet.
- ``GridRasterDataset``: a 2-D array on a georeferenced grid, as a compressed GeoTIFF.
- ``NpzDataset``: a dict of numpy arrays, as ``.npz``.
- ``PathDataset``: a file or folder written by a node itself (large rasters, archives); the
  node receives and returns the path, so Kedro still knows the dependency.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from kedro.io import AbstractDataset
from rasterio.transform import Affine


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


class JSONDataset(AbstractDataset[Any, Any]):
    def __init__(self, filepath: str, indent: int | None = 1):
        self._filepath = Path(filepath)
        self._indent = indent

    def load(self) -> Any:
        return json.loads(self._filepath.read_text(encoding="utf-8"))

    def save(self, data: Any) -> None:
        _ensure_parent(self._filepath)
        tmp = self._filepath.with_suffix(self._filepath.suffix + ".tmp")
        tmp.write_text(
            json.dumps(data, indent=self._indent, ensure_ascii=False, sort_keys=False),
            encoding="utf-8",
        )
        tmp.replace(self._filepath)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}


class GeoParquetDataset(AbstractDataset[gpd.GeoDataFrame, gpd.GeoDataFrame]):
    def __init__(self, filepath: str):
        self._filepath = Path(filepath)

    def load(self) -> gpd.GeoDataFrame:
        return gpd.read_parquet(self._filepath)

    def save(self, data: gpd.GeoDataFrame) -> None:
        _ensure_parent(self._filepath)
        data.to_parquet(self._filepath, compression="zstd", write_covering_bbox=False)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}


class ParquetDataset(AbstractDataset[pd.DataFrame, pd.DataFrame]):
    def __init__(self, filepath: str):
        self._filepath = Path(filepath)

    def load(self) -> pd.DataFrame:
        return pd.read_parquet(self._filepath)

    def save(self, data: pd.DataFrame) -> None:
        _ensure_parent(self._filepath)
        data.to_parquet(self._filepath, compression="zstd", index=False)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}


class GridRasterDataset(AbstractDataset[dict, dict]):
    """A grid as ``{"array": 2-D ndarray, "transform": Affine or tuple, "crs": str,
    "nodata": number or None}``."""

    def __init__(self, filepath: str):
        self._filepath = Path(filepath)

    def load(self) -> dict:
        with rasterio.open(self._filepath) as src:
            return {
                "array": src.read(1),
                "transform": src.transform,
                "crs": src.crs.to_string(),
                "nodata": src.nodata,
            }

    def save(self, data: dict) -> None:
        _ensure_parent(self._filepath)
        arr = np.asarray(data["array"])
        transform = data["transform"]
        if not isinstance(transform, Affine):
            transform = Affine(*transform)
        profile = {
            "driver": "GTiff",
            "dtype": arr.dtype.name if arr.dtype != bool else "uint8",
            "count": 1,
            "width": arr.shape[1],
            "height": arr.shape[0],
            "crs": data["crs"],
            "transform": transform,
            "nodata": data.get("nodata"),
            "compress": "deflate",
            "tiled": True,
            "blockxsize": 512,
            "blockysize": 512,
            "BIGTIFF": "IF_SAFER",
        }
        tmp = self._filepath.with_suffix(".tmp.tif")
        with rasterio.open(tmp, "w", **profile) as dst:
            dst.write(arr.astype(profile["dtype"]), 1)
        tmp.replace(self._filepath)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}


class NpzDataset(AbstractDataset[dict, dict]):
    def __init__(self, filepath: str):
        self._filepath = Path(filepath)

    def load(self) -> dict:
        with np.load(self._filepath, allow_pickle=False) as z:
            return {k: z[k] for k in z.files}

    def save(self, data: dict) -> None:
        _ensure_parent(self._filepath)
        tmp = self._filepath.with_suffix(".tmp.npz")
        np.savez_compressed(tmp, **data)
        tmp.replace(self._filepath)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}


class PathDataset(AbstractDataset[str, str]):
    """A file or folder written by the node itself. ``load`` returns its path; ``save`` checks
    that the node returned that same path and that it exists."""

    def __init__(self, filepath: str):
        self._filepath = Path(filepath)

    def load(self) -> str:
        if not self._filepath.exists():
            raise FileNotFoundError(self._filepath)
        return str(self._filepath)

    def save(self, data: str) -> None:
        if Path(data).resolve() != self._filepath.resolve():
            raise ValueError(f"node wrote {data}, the catalog expects {self._filepath}")
        if not self._filepath.exists():
            raise FileNotFoundError(self._filepath)

    def _exists(self) -> bool:
        return self._filepath.exists()

    def _describe(self) -> dict[str, Any]:
        return {"filepath": str(self._filepath)}
