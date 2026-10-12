"""Lists the capitals of conf/base/parameters/capitals.yml (`--pinned`: only those whose
OpenStreetMap relation version is pinned, which are the ones `just run-all` runs)."""

from __future__ import annotations

import argparse

from data_processing.config import parameters


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pinned", action="store_true")
    args = ap.parse_args()
    caps = parameters()["capitals"]
    for slug, cfg in caps.items():
        if not args.pinned or (cfg.get("osm_relation") and cfg.get("osm_version")):
            print(slug)  # noqa: T201


if __name__ == "__main__":
    main()
