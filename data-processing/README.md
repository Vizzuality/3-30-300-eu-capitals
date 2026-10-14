# 3-30-300 data processing

Computes the 3-30-300 layers of the 27 EU capitals and writes the data releases that the site
reads. The 3-30-300 rule for urban greenery: every resident sees at least **3** trees from home,
every neighbourhood has at least **30** % tree canopy, and every resident lives within **300** m of
a park or green space. For each capital, every rule is computed on a shared 10 m grid and per
building, and the shares of residents meeting 0, 1, 2 or 3 rules are written for the ranking.

Python with [uv](https://docs.astral.sh/uv/), [Kedro](https://kedro.org/) for the pipelines,
[just](https://just.systems/) for the commands, ruff and pytest.

> **Status.** The 27 capitals are configured and run: the release `2026-10-all` holds all of them,
> the cross-capital files (`ranking.json`, `capitals.json` with the capitals' places on the Home
> map, `sources.json`) and the Home map (`europe.pmtiles`). It is not published yet.

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
| `just run <capital>` | Runs every pipeline for one capital, each in its own process (so the memory of one step is released before the next), and writes its folder of the release, then rebuilds `ranking.json`, `capitals.json` and `sources.json` from the capitals processed so far |
| `just run-pipeline <pipeline> <capital>` | Runs one pipeline (e.g. `rule300`), reusing the saved outputs of the others |
| `just run-all` | Runs every capital whose boundary is pinned in `conf/base/parameters/capitals.yml`, then the cross-capital files and the Home map |
| `just home` | Writes the Home map, `europe.pmtiles` (Natural Earth 1:50m), into the release; it depends on no capital, so `just run` leaves it out |
| `just check [release]` | Checks a release folder: every file present, schemas and attributes, the Home map, known values per capital (failures); tile sizes over the budgets (warnings) |
| `just inspect-evidence <capital> <z> <x> <y> [building]` | Prints an evidence tile, or one building of it |
| `just test`, `just lint` | pytest; ruff check and format check (as in CI) |

A release is named `<year>-<month>-<what it holds>`: `2026-10-stockholm` held Stockholm alone (the
first run), `2026-10-all` holds the 27 capitals computed from the October 2026 data (OpenStreetMap
of 2026-10-11, Overture 2026-09-23.1); a corrected release gets a new name, never the same one. The
release name defaults to `2026-10-all`; set another with `just release=2026-11-all run stockholm`.
Kedro can also be run directly:
`uv run kedro run --params capital=stockholm,release=2026-10-all`.

Downloads are kept, with a manifest (URL, date, size, sha256, and for the OpenStreetMap extracts
their md5 and header timestamp), under `data/01_raw/<source>/`; a second run reuses them and never
downloads them again. Delete a source's folder to download it again. Reading the OpenStreetMap
extract (about 3 minutes for Sweden) is also kept, in `data/02_intermediate/<capital>/osm/`, and
redone only when the extract, the area or the selection changes. The Tippecanoe inputs
(`data/02_intermediate/<capital>/tiles/`) are gzipped: plain, they would take six times the space.

### Run times, memory and volumes (laptop with 16 threads and 30 GB of memory)

Measured on the runs of `2026-10-all` (times are approximate: the canopy height downloads vary
from day to day). A first run of a capital, downloads included, takes 4 minutes (Luxembourg) to an
hour (Sofia); most of it is the canopy height, read by window from AWS (2 to 35 minutes, depending
on the area and the day), then the evidence archive and the facades. With one process per pipeline (`just run`)
the largest step needs up to 13 GB of memory (Sofia's tree tops; 11 GB for Berlin's evidence
archive); in one process, the steps' memory added up (13 GB for Vilnius) and two capitals run side
by side once exhausted the machine's memory. Run one capital at a time.

| Capital | Run | Largest step | Release | Canopy height | Intermediate |
| ------- | --- | ------------ | ------- | ------------- | ------------ |
| Rome (1,286 km²) | 29 min | 7.9 GB | 194 MB | 352 MB | 749 MB |
| Sofia (1,342 km²) | 61 min | 12.6 GB | 234 MB | 518 MB | 558 MB |
| Berlin (891 km²) | 36 min | 11.2 GB | 384 MB | 365 MB | 1.3 GB |
| Madrid (604 km²) | 17 min | 6.6 GB | 164 MB | 278 MB | 571 MB |
| Stockholm (209 km²), downloads kept | 10 min | 4.6 GB | 95 MB | 106 MB | 307 MB |
| Luxembourg (52 km²) | 4 min | 6.3 GB (one process) | 19 MB | 67 MB | 59 MB |

The release `2026-10-all` takes 3.0 GB (`europe.pmtiles` 0.8 MB). `data/01_raw` takes 15.2 GB: the
OpenStreetMap extracts 8.6 GB (one to three regions per capital, 9 MB to 845 MB each), the canopy
height 4.5 GB, the land polygons 0.9 GB, Overture 0.8 GB and GHS-POP 0.4 GB.
`data/02_intermediate/<capital>` takes 60 MB to 1.3 GB per capital (about 10 GB for the 27). None
of it is needed once the capital's folder of the release is written (the cross-capital files read
only `release_record.json`), and a run rebuilds all of it, so it can be removed to save space
(keep `release_record.json`).

### Publishing a release

A release is the folder `data/03_primary/releases/<release>/`. It goes into the bucket under
`releases/<release>/`, with the same tree. Check it first with `just check <release>`.

## Structure

```
data-processing/
├─ conf/
│  ├─ base/catalog/*.yml       inputs and outputs of every node, per pipeline
│  ├─ base/parameters/         run.yml (capital, release, paths), capitals.yml, sources.yml,
│  │                           method.yml (the numbers of the method), tiles.yml, home.yml
│  │                           (the Home map and the capitals' places on it), check.yml
│  ├─ logging.yml              plain console logging (the justfile points Kedro to it)
│  └─ local/                   personal settings and credentials (not committed)
├─ data/                       not committed
│  ├─ 01_raw/<source>/         downloads, each with its manifest.json
│  ├─ 02_intermediate/<capital>/  working files: masks and rules on the grid (grid/*.tif),
│  │                           buildings, facades, trees, parks, network, stats/*.json,
│  │                           tiles/*.geojsonseq.gz (Tippecanoe input); europe/ (the Home map)
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
| `context` | What the map draws | `tiles/*.geojsonseq.gz`: water, shore and hatch marks, parks, streets and street-name candidates, canopy, trees, buildings and facades |
| `combined` | Rules met per square; shares of residents | `grid/met.tif`, `grid/grid_values.tif`, `stats/summary.json` (shares of residents, suggested place) |
| `export` | The capital's folder of the release | `capitals/<slug>/{grid,city,evidence}.pmtiles`, `outline.json` (the city limits for its page), `summary.json` in the release |
| `overview` | The water, main roads and district names around the city for its page's overview | `capitals/<slug>/context.pmtiles` in the release: the sea, lakes and rivers, the main roads (motorway to tertiary, by class, each dual carriageway as one line) and the district names of the context rectangle (`summary.json › context`), from the land polygons and the Geofabrik extracts on disk (`context_extracts` in `capitals.yml`; missing ones are listed, never downloaded) |
| `release` | Cross-capital files | `ranking.json`, `capitals.json` (with each capital's enlargement and place on the Home map), `sources.json` in the release (from every capital processed for that release) |
| `home` | The Home map (not in the default pipeline) | `europe.pmtiles` in the release, from Natural Earth 1:50m (`data/02_intermediate/europe/`) |

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
  Mälaren is a lake in OSM, not sea, and so are the IJ, IJmeer and Markermeer at Amsterdam. The
  1 km buffer is drawn around the city after the sea is cut. Where the relation is larger than the
  territory, the relations listed in `osm_subtract` (also pinned) are cut out of it: Nicosia is the
  merged municipality (relation 17716182) minus the United Nations Buffer Zone (3263909), which
  the municipality does not govern. Each capital's territory and the reasons for it are noted in
  `capitals.yml`.
- **OpenStreetMap:** one dated Geofabrik extract per capital (`extract_date` in `sources.yml`, the
  region in `capitals.yml`: the smallest that holds the city, its 1 km buffer and the 200 m margin
  kept around green spaces, e.g. `europe/germany/brandenburg` for Berlin, `europe/italy/centro` for
  Rome), read with pyosmium. Where no single region holds them, several are read and every object
  is kept once: Amsterdam (Noord-Holland, Utrecht, Flevoland) and Bratislava (Slovakia, Austria,
  Hungary). Multipolygon and boundary relations are assembled by libosmium's area assembler;
  closed ways become polygons directly. Everything whose bounding box meets the analysis area's
  (plus 0.005°) is read.
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
| OpenStreetMap: boundary relation, water, green spaces, every way with a `highway` tag | Dated Geofabrik extracts of the region (`sweden-261011.osm.pbf` for Stockholm), read with pyosmium; their md5 is checked and their header timestamp kept; the boundary relation must have the version pinned in `capitals.yml` |
| OpenStreetMap land polygons (coastline) | `land-polygons-split-4326.zip` from osmdata.openstreetmap.de (its Last-Modified date is recorded) |
| Overture Maps buildings, release 2026-09-23.1 | GeoParquet on Overture's public S3 bucket, filtered by bounding box (pyarrow) |
| Meta & WRI High Resolution Canopy Height Map v1 | Its cloud-optimised GeoTIFFs on AWS, read by window and averaged onto the capital's 1 m grid (EPSG:3035) |
| JRC GHS-POP R2023A, epoch 2020, 100 m | The 1000 km tiles (Mollweide) from the JRC |
| Wikidata | Labels of the capital and its country (`wbgetentities`): the city's, not a region's (Brussels: Q239, the item of its OpenStreetMap place node), with the plain name from the node's `name:<locale>` where a label reads "City of …" (`name_wikidata`, `name_overrides` in `capitals.yml`) |
| Natural Earth 1:50m countries, version 5.1.1 (public domain) | The Home map (`europe.pmtiles`): `ne_50m_admin_0_countries.zip` from naciscdn.org, its version read from the archive and checked against `sources.yml` |
| Figtree, Noto Sans (SIL OFL) | From google/fonts, only to measure the width of street names |

## Licences

The code is meant to be released under a permissive licence (see the repository's `LICENSE`).
The data in `data/` is never committed. A release is derived from OpenStreetMap and Overture
buildings (ODbL), so it is published as open data under the ODbL, with these attributions (also
in every release's `sources.json`): Meta and WRI 2024, High Resolution Canopy Height Maps, source
imagery © 2016 Maxar; © OpenStreetMap contributors; Overture Maps Foundation; European
Commission, Joint Research Centre: GHS-POP R2023A. The Home map's countries and coastline come from
Natural Earth (public domain; credited as "Made with Natural Earth").

## Tests and CI

`just test` runs pytest; `just lint` runs ruff. `.github/workflows/data-processing-tests.yml` runs
both on every push or pull request that touches `data-processing/`. The tests cover what is easy to
break: geometry edge cases (lines of sight, courtyards, own building, walls and corners), threshold
boundaries (30 % canopy tested on whole pixel counts, 30 m inclusive, 300 m), the population
spreading, distances along the network and the water tests, the evidence coordinate frame, the
OpenStreetMap reader (a multipolygon with a split outer ring and an island, a nature reserve as a
boundary relation, the tag selections, the bounding box, features read from several extracts kept
once, a territory with a relation cut out of it and the pins of both), the sources document (a
capital read from several extracts, Natural Earth for the release), the capitals' names (the
city's item, overrides, fallbacks), the Home map (enlargement, nudging overlapping outlines apart,
leader lines, the outlines drawn: narrow channels closed, small parts and holes dropped,
simplification; the zoom each island shows from; no land layer; country tints, graticule), the
city limits of a capital's page (the city, its islands and holes, the tolerance at zoom 15), the
overview's context rectangle (the fitted camera, the least zoom, both layouts), its water
(narrow and small water left out away from the city, kept near it), its roads (the class
rule, dual carriageways as one line) and its district levels, the
archives' metadata (Tippecanoe's command line removed, every section kept), and the pinned values
(the 27 boundary relations and versions, method numbers, source versions).

Pre-commit hooks (ruff, YAML, whitespace), from the repository root:
`uv run --project data-processing pre-commit install --config data-processing/.pre-commit-config.yaml`.
