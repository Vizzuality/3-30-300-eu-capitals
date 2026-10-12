"""Prints an evidence tile (`just inspect-evidence <capital> <z> <x> <y> [building id]`).

Generic map tools cannot preview evidence.pmtiles (its tiles are gzip JSON), so this prints the
content of one tile, or of one building of it (with the start of its route turned back into
longitude and latitude, to find it on a map).
"""

from __future__ import annotations

import gzip
import json
import math
import sys

from pmtiles.reader import MmapSource, Reader

from data_processing.config import PROJECT

R = 6378137.0


def to_lonlat(tile, p):
    z, x, y = tile
    size = 2 * math.pi * R / 2**z
    minx = -math.pi * R + x * size
    maxy = math.pi * R - y * size
    k = math.cos(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2**z))))
    mx, my = minx + p[0] / 10 / k, maxy - p[1] / 10 / k
    return math.degrees(mx / R), math.degrees(math.atan(math.sinh(my / R)))


def main(release: str, capital: str, z: int, x: int, y: int, building: str | None) -> int:
    path = PROJECT / "data" / "03_primary" / "releases" / release / "capitals" / capital
    with (path / "evidence.pmtiles").open("rb") as f:
        data = Reader(MmapSource(f)).get(z, x, y)
    if data is None:
        print(f"no tile {z}/{x}/{y}")
        return 1
    doc = json.loads(gzip.decompress(data))
    if building:
        b = doc["buildings"].get(building)
        if b is None:
            print(f"building {building} is not in tile {z}/{x}/{y}")
            return 1
        print(json.dumps(b, indent=1, ensure_ascii=False))
        if b["route"]:
            start = doc["points"][b["route"][0]]
            print("route starts at (lon, lat):", to_lonlat(doc["tile"], start))
    else:
        print(
            json.dumps(
                {
                    **doc,
                    "buildings": {
                        k: {"met": v["met"], "rules": v["rules"], "residents": v["residents"]}
                        for k, v in doc["buildings"].items()
                    },
                },
                indent=1,
                ensure_ascii=False,
            )[:20000]
        )
        print(
            f"{len(doc['buildings'])} buildings, {len(doc['trees'])} trees, "
            f"{len(doc['parks'])} parks, {len(data)} bytes gzip"
        )
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    sys.exit(main(a[0], a[1], int(a[2]), int(a[3]), int(a[4]), a[5] if len(a) > 5 else None))
