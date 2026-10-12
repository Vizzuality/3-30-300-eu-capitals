# 3-30-300 data processing

Computes the 3-30-300 layers of the 27 EU capitals and writes the data releases that the site
reads. The 3-30-300 rule for urban greenery: every resident sees at least **3** trees from home,
every neighbourhood has at least **30** % tree canopy, and every resident lives within **300** m of
a park or green space. For each capital, every rule is computed on a shared 10 m grid and per
building, and the shares of residents meeting 0, 1, 2 or 3 rules are written for the ranking.

Python with [uv](https://docs.astral.sh/uv/), [Kedro](https://kedro.org/) for the pipelines,
[just](https://just.systems/) for the commands, ruff and pytest.

> **Status.** Only Stockholm is configured and run. `ranking.json`, `capitals.json` and
> `sources.json` are therefore **partial**: they list the capitals processed so far (one), and
> the first two say so with `"complete": false`. `europe.pmtiles` (the Home map) is not written
> yet.

## Setup

```sh
cd data-processing
uv sync                      # Python 3.13 and the dependencies (just comes with the dev group)
just install-tippecanoe      # builds felt/tippecanoe v2.82.0 into .tools/bin (git, make, a C++
                             # compiler, sqlite3 and zlib headers needed)
```

`just` is installed in the project's environment (`uv run just …`), or system-wide. Kedro's
telemetry is turned off by the justfile (`KEDRO_DISABLE_TELEMETRY`).

Tippecanoe can live elsewhere: `TIPPECANOE_DIR=/path/to/bin just run stockholm`.

## Running it

| Command | What it does |
| ------- | ------------ |
| `just run <capital>` | Runs every pipeline for one capital and writes its folder of the release, then rebuilds `ranking.json`, `capitals.json` and `sources.json` from the capitals processed so far |
| `just run-pipeline <pipeline> <capital>` | Runs one pipeline (e.g. `rule300`), reusing the saved outputs of the others |
| `just run-all` | Runs every capital whose boundary is pinned in `conf/base/parameters/capitals.yml`, then the cross-capital files (written, not run yet) |
| `just check [release]` | Checks a release folder: every file present, schemas and attributes, known values for Stockholm (failures); tile sizes over the budgets (warnings) |
| `just inspect-evidence <capital> <z> <x> <y> [building]` | Prints an evidence tile, or one building of it |
| `just test`, `just lint` | pytest; ruff check and format check (as in CI) |

The release name defaults to `2026-10-stockholm`; set another with
`just release=2026-11-01 run stockholm`. Kedro can also be run directly:
`uv run kedro run --params capital=stockholm,release=2026-10-stockholm`.

Downloads are kept, with a manifest (URL, date, size, sha256, and for the OpenStreetMap extract
its md5 and header timestamp), under `data/01_raw/<source>/`; a second run reuses them and never
downloads them again. Delete a source's folder to download it again. Reading the OpenStreetMap
extract (about 3 minutes for Sweden) is also kept, in `data/02_intermediate/<capital>/osm/`, and
redone only when the extract, the area or the selection changes.

### Run times and volumes (Stockholm, laptop with 16 threads and 30 GB of memory)

A run with every download and the OpenStreetMap read already kept takes about 7 minutes
(`just run stockholm`); the longest steps are the evidence archive (1.5 min), the canopy shapes
and the tree tops (under 1 min each), the facades and the grid archive (about 35 s each). The first
run of a capital adds the downloads and the reading of the extract: the Sweden extract (0.9 GB,
about 1 min), reading its boundary (45 s) and its features (3 min), the land polygons (0.9 GB,
about 2 min, shared by every capital), the canopy height (2–3 min, read by window), Overture
(about 1 min) and GHS-POP (seconds): about 11 minutes with the land polygons and the canopy
height already there. `data/01_raw` takes 1.9 GB (0.9 GB the Sweden extract, 0.9 GB the land
polygons), `data/02_intermediate/stockholm` 0.6 GB, and the release 95 MB (`city.pmtiles`
86 MB, `evidence.pmtiles` 11 MB, `grid.pmtiles` 2 MB).

### Publishing a release

A release is the folder `data/03_primary/releases/<release>/`. It goes into the bucket under
`releases/<release>/`, with the same tree. Check it first with `just check <release>`.

## Structure

```
data-processing/
├─ conf/
│  ├─ base/catalog/*.yml       inputs and outputs of every node, per pipeline
│  ├─ base/parameters/         run.yml (capital, release, paths), capitals.yml, sources.yml,
│  │                           method.yml (the numbers of the method), tiles.yml, check.yml
│  ├─ logging.yml              plain console logging (the justfile points Kedro to it)
│  └─ local/                   personal settings and credentials (not committed)
├─ data/                       not committed
│  ├─ 01_raw/<source>/         downloads, each with its manifest.json
│  ├─ 02_intermediate/<capital>/  working files: masks and rules on the grid (grid/*.tif),
│  │                           buildings, facades, trees, parks, network, stats/*.json,
│  │                           tiles/*.geojsonseq (Tippecanoe input)
│  └─ 03_primary/releases/<release>/  the release, laid out exactly as the bucket
├─ docs/release-format.md      the format of every file of a release (for the client's schemas)
├─ src/data_processing/
│  ├─ pipelines/               one Kedro pipeline per step of the method (below)
│  ├─ core/                    the computations the pipelines share (grid, visibility, network…)
│  ├─ datasets/                small Kedro datasets (GeoParquet, GeoTIFF, JSON, npz, paths)
│  ├─ check.py                 `just check`
│  └─ inspect_evidence.py      `just inspect-evidence`
├─ tests/                      pytest
└─ justfile
```

### Pipelines

| Pipeline | Step | Main outputs (`data/02_intermediate/<capital>/`) |
| -------- | ---- | ------------------------------------------------ |
| `boundaries` | The city and its 1 km buffer; the OpenStreetMap layers | `boundaries.parquet` (boundary, city = boundary minus the sea, analysis area = city + 1 km, sea), `osm/` (the extract read: water, green spaces, highway ways), `water.parquet` |
| `grid` | The shared 10 m grid; squares of the city | `grid.json` (EPSG:3035, 10 m, edges on 100 m), `grid/city_mask.tif` (square centre in the city), `grid/water_mask.tif`, `grid/water_2m.tif` |
| `residents` | Residents placed in buildings | `buildings.parquet` (Overture), `grid/population.tif` (residents per square), `building_residents.parquet` |
| `rule3` | 3 trees visible | canopy height at 1 m (`data/01_raw/canopy_height/`), `trees.parquet`, `grid/rule3.tif` |
| `rule30` | 30 % canopy within 500 m | `grid/canopy_px.tif`, `grid/land_px.tif`, `grid/canopy_share.tif`, `grid/rule30.tif` |
| `rule300` | 300 m walk to a green space | `parks.parquet`, `walk_network.npz`, `walk.npz`, `grid/walk_distance.tif`, `grid/rule300.tif` |
| `buildings` | Results per building and per facade | `facades.parquet`, `facade_seen.parquet`, `building_results.parquet`, `building_routes.parquet` |
| `context` | What the map draws | `tiles/*.geojsonseq`: water, shore and hatch marks, parks, streets and street-name candidates, canopy, trees, buildings and facades |
| `combined` | Rules met per square; shares of residents | `grid/met.tif`, `grid/grid_values.tif`, `stats/summary.json` (shares of residents, suggested place) |
| `export` | The capital's folder of the release | `capitals/<slug>/{grid,city,evidence}.pmtiles`, `summary.json` in the release |
| `release` | Cross-capital files | `ranking.json`, `capitals.json`, `sources.json` in the release (from every capital processed for that release) |

`stats/*.json` records, for every step, its counts and run time.

### Outputs

The release is laid out exactly as the storage bucket the site reads. Every file, attribute and
encoding is described in [docs/release-format.md](docs/release-format.md).

## Method notes

The method in brief: a capital is its municipality (the territory of the directly elected city
government), drawn from OpenStreetMap; every layer is computed over the city plus 1 km and
reported for the city only; residents (GHS-POP) are placed in buildings (Overture); the three
rules are computed on a shared 10 m grid (EPSG:3035) and per building; the shares weight each
square by its residents. The details below are the ones a reader cannot guess; each is a
parameter in `conf/base/parameters/method.yml` or stated in the code's docstrings.

- **City:** the OSM relation (pinned id and version) minus the sea (OSM land polygons). Lakes stay:
  Mälaren is a lake in OSM, not sea. The 1 km buffer is drawn around the city after the sea is cut.
- **OpenStreetMap:** one dated Geofabrik extract per country (`extract_date` in
  `sources.yml`, the region in `capitals.yml`), read with pyosmium. Multipolygon and boundary
  relations are assembled by libosmium's area assembler; closed ways become polygons directly.
  Everything whose bounding box meets the analysis area's (plus 0.005°) is read.
- **Water:** OSM `natural=water`, `waterway=riverbank`, `landuse=reservoir`, plus the sea.
- **Canopy height:** the source's ~0.6 m Web Mercator pixels are averaged into 1 m EPSG:3035
  pixels. Tree tops on building footprints are kept.
- **Lines of sight:** exact, against every edge of the footprints. From a facade, every building
  blocks, its own included; from a 10 m square inside a building, that building does not.
- **Residents:** the "100 m square" is the GHS-POP cell; a 10 m square belongs to the cell that
  contains its centre. Building areas per square are exact (vector); a building's residents are,
  in every square it covers, the square's people times its share of the square's building area.
- **30 % canopy:** water pixels (1 m pixel centre in water) and pixels without canopy-height data
  are left out of both counts; the neighbourhood is the squares whose centres lie within 500 m.
- **Green spaces:** OSM polygons marked `access=private`/`no` are dropped before joining; pieces
  join when they touch (exactly); the 1 ha test uses the whole green space, which is then cut to
  the analysis area plus 200 m. Its `kind` is the kind covering most of it; its `name` that of the
  largest named piece covering 0.3 ha or a quarter of it.
- **Walking network:** every way with a `highway` tag except motorways, construction, platforms
  and the like, ways marked `foot=no`, `access=private`/`no` (unless `foot=yes`, `designated` or
  `permissive`), `motorroad=yes` and `area=yes`. Cycleways are kept (most Swedish cycleways are
  shared with pedestrians). Squares and buildings join the nearest point of the network (nodes and
  points every 5 m) within 100 m whose straight line does not cross water; if that path does not
  lead to a green space, the walk is infinite.
- **"Within 20 m of a green space":** only the part of the 20 m fringe connected by land to the
  green space counts, so a path across a canal or river is not at the park. Water on the straight
  legs is tested on a 2 m water raster, ignoring the last 2 m at each end (quays, shore paths).
- **Facades:** outlines are first simplified by 0.5 m (vertex jitter); an outline with fewer than
  two corners (a round building) is cut into pieces of about 15 m; a wall is shared when more than
  half of its points (1 m outside, every 5 m) fall in another building. Orientation is the outward
  normal of the wall's chord, from true north.
- **Building rules:** residents follow facade length, so "more than half of its residents behind
  passing facades" is the share of facade length that passes; a building without facades fails
  rule 3. The 500 m circle of rule 30 is centred on the building's representative point.
  A building belongs to the city (and is scored) when its representative point is in the city.
- **Grid colours:** squares whose centre is in water are drawn without colour; any residents
  placed there still count in the shares.
- **Ranking:** the shares come from the 10 m squares weighted by residents. The same shares
  computed from the buildings are in
  `data/02_intermediate/<capital>/stats/buildings.json` for comparison.

## Sources

Versions in `conf/base/parameters/sources.yml`; every release lists them, with their dates,
licences and attributions, in `sources.json`.

| Source | How it is read |
| ------ | -------------- |
| OpenStreetMap: boundary relation, water, green spaces, every way with a `highway` tag | A dated Geofabrik extract of the country (`sweden-261011.osm.pbf` for Stockholm), read with pyosmium; its md5 is checked and its header timestamp kept; the boundary relation must have the version pinned in `capitals.yml` |
| OpenStreetMap land polygons (coastline) | `land-polygons-split-4326.zip` from osmdata.openstreetmap.de (its Last-Modified date is recorded) |
| Overture Maps buildings, release 2026-09-23.1 | GeoParquet on Overture's public S3 bucket, filtered by bounding box (pyarrow) |
| Meta & WRI High Resolution Canopy Height Map v1 | Its cloud-optimised GeoTIFFs on AWS, read by window and averaged onto the capital's 1 m grid (EPSG:3035) |
| JRC GHS-POP R2023A, epoch 2020, 100 m | The 1000 km tiles (Mollweide) from the JRC |
| Wikidata | Labels of the capital and its country (`wbgetentities`) |
| Figtree, Noto Sans (SIL OFL) | From google/fonts, only to measure the width of street names |

## Licences

The code is meant to be released under a permissive licence (see the repository's `LICENSE`).
The data in `data/` is never committed. A release is derived from OpenStreetMap and Overture
buildings (ODbL), so it is published as open data under the ODbL, with these attributions (also
in every release's `sources.json`): Meta and WRI 2024, High Resolution Canopy Height Maps, source
imagery © 2016 Maxar; © OpenStreetMap contributors; Overture Maps Foundation; European
Commission, Joint Research Centre: GHS-POP R2023A.

## Tests and CI

`just test` runs pytest; `just lint` runs ruff. `.github/workflows/data-processing-tests.yml` runs
both on every push or pull request that touches `data-processing/`. The tests cover what is easy to
break: geometry edge cases (lines of sight, courtyards, own building, walls and corners), threshold
boundaries (30 % canopy tested on whole pixel counts, 30 m inclusive, 300 m), the population
spreading, distances along the network and the water tests, the evidence coordinate frame, the
OpenStreetMap reader (a multipolygon with a split outer ring and an island, a nature reserve as a
boundary relation, the tag selections, the bounding box), the sources document, and the pinned
values (boundary relation and version, method numbers, source versions).

Pre-commit hooks (ruff, YAML, whitespace), from the repository root:
`uv run --project data-processing pre-commit install --config data-processing/.pre-commit-config.yaml`.
