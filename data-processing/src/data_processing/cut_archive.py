"""Cuts a small piece out of a PMTiles archive.

`just cut-archive <source> <target> <z> <x0> <y0> <x1> <y1> <max z>`

Keeps the tiles x0–x1, y0–y1 (inclusive) of zoom z and every tile under them down to the max zoom,
exactly as they are stored, with the source's tile type, compression and metadata, and the piece's
bounds. The client's test data uses it for a corner of a city map that is small enough to keep with
the tests.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from pmtiles.reader import MmapSource, Reader
from pmtiles.tile import zxy_to_tileid
from pmtiles.writer import Writer


def tile_corner(z: int, x: int, y: int) -> tuple[float, float]:
    """Longitude and latitude of a tile's north-west corner."""
    n = 2**z
    return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))


def cut(source: Path, target: Path, z: int, x0: int, y0: int, x1: int, y1: int, max_z: int) -> int:
    with source.open("rb") as fh:
        reader = Reader(MmapSource(fh))
        header = reader.header()
        metadata = reader.metadata()
        tiles = []
        for zoom in range(z, max_z + 1):
            k = 2 ** (zoom - z)
            for x in range(x0 * k, (x1 + 1) * k):
                for y in range(y0 * k, (y1 + 1) * k):
                    data = reader.get(zoom, x, y)
                    if data is not None:
                        tiles.append((zxy_to_tileid(zoom, x, y), data))
    west, north = tile_corner(z, x0, y0)
    east, south = tile_corner(z, x1 + 1, y1 + 1)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as fh:
        writer = Writer(fh)
        for tile_id, data in sorted(tiles):
            writer.write_tile(tile_id, data)
        writer.finalize(
            {
                "tile_type": header["tile_type"],
                "tile_compression": header["tile_compression"],
                "min_zoom": z,
                "max_zoom": max_z,
                "min_lon_e7": int(west * 1e7),
                "min_lat_e7": int(south * 1e7),
                "max_lon_e7": int(east * 1e7),
                "max_lat_e7": int(north * 1e7),
                "center_zoom": z,
                "center_lon_e7": int((west + east) / 2 * 1e7),
                "center_lat_e7": int((south + north) / 2 * 1e7),
            },
            metadata,
        )
    sys.stdout.write(json.dumps({"tiles": len(tiles), "bytes": target.stat().st_size}) + "\n")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 9:
        sys.stderr.write(__doc__ or "")
        sys.exit(2)
    source, target, *numbers = sys.argv[1:]
    sys.exit(cut(Path(source), Path(target), *(int(n) for n in numbers)))
