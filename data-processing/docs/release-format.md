# Release format (schema version 1)

What a data release contains, file by file, exactly as the pipeline writes it. The client's Zod
schemas are written from this page; the pipeline's writers are in
`src/data_processing/pipelines/export/nodes.py` and `src/data_processing/pipelines/context/nodes.py`,
and `just check <release>` verifies a release against it.

```
data/03_primary/releases/<release>/        = s3://<bucket>/releases/<release>/
  ranking.json
  capitals.json
  sources.json
  europe.pmtiles                            not written yet (Home map)
  capitals/<slug>/
    summary.json
    grid.pmtiles
    city.pmtiles
    evidence.pmtiles
```

Conventions used everywhere:

- **Shares** are fractions from 0 to 1, rounded to 4 decimals. The client rounds them for display.
- **Names** (`name`, `country.name`) are objects with one string per locale, always all 24:
  `bg cs da de el en es et fi fr ga hr hu it lt lv mt nl pl pt ro sk sl sv`. They are the Wikidata
  labels; a language without a label falls back to the `mul` label, then English.
- **Longitude, latitude** pairs are `[lon, lat]` in WGS 84 degrees, 6 decimals unless stated.
- **JSON files** are written without whitespace, UTF-8.
- Every JSON file has `"schema_version": 1`; an incompatible change increments it.

## `ranking.json`

The shares of residents meeting 0, 1, 2 and 3 rules and each rule, for every capital of the
release, sorted by the share meeting all three rules (highest first; ties by slug).

```ts
{
  schema_version: 1,
  release: string,            // e.g. "2026-10-stockholm"
  complete: boolean,          // false while the release holds fewer than the 27 capitals
  capitals: Array<{
    rank: number,             // 1-based position in this list
    slug: string,             // e.g. "stockholm"
    name: Names,              // the capital, 24 locales
    country: { code: string,  // ISO 3166-1 alpha-2, e.g. "SE"
               name: Names },
    residents: number,        // integer: residents of the city (GHS-POP 2020, placed in buildings)
    shares: Shares,
  }>
}

type Shares = {
  met: [number, number, number, number],   // residents meeting 0, 1, 2, 3 rules; sums to 1
  rules: { "3": number, "30": number, "300": number }  // residents meeting each rule
}
```

`met[3]` is the share meeting all three rules. The shares are those of the 10 m squares of the city,
each weighted by the residents placed in its buildings.

**Partial releases:** the first Stockholm release holds one capital, so `complete` is `false` and the
ranking has one row. The client must not assume 27 rows.

## `capitals.json`

The capitals for the Home map: real outlines and display positions.

```ts
{
  schema_version: 1,
  release: string,
  complete: boolean,
  capitals: Array<{            // sorted by slug
    slug: string,
    name: Names,
    local_name: string,        // as written locally, e.g. "Stockholm", "Αθήνα"; for search
    language: string,          // BCP 47 language of local names (street and park names), e.g. "sv"
    country: { code: string, name: Names },
    residents: number,
    centre: [lon, lat],        // centroid of the city (boundary minus the sea)
    display: [lon, lat],       // where the enlarged outline is drawn on Home; = centre for now
                               // (nudging overlapping outlines apart needs all 27 capitals)
    km: number,                // square root of the city's area in km² (2 decimals): its size,
                               // from which the client derives the Home enlargement
    outline: Array<            // one entry per polygon of the city
      Array<Array<[x, y]>>     // rings (first = exterior, then holes), closed, in metres from
    >                          // `centre` (azimuthal equidistant, x east, y north), 1 decimal,
                               // simplified to about 50 m
  }>
}
```

## `capitals/<slug>/summary.json`

The capital page header and per-rule shares, and the place of the guide's pulse.

```ts
{
  schema_version: 1,
  release: string,
  slug: string,
  name: Names,
  local_name: string,
  language: string,
  country: { code: string, name: Names },
  residents: number,              // integer
  shares: Shares,
  suggested: [lon, lat],          // centre of the most populated 500 m square (statistical grid,
                                  // EPSG:3035) within 2 km of the city's population-weighted centre
  centre: [lon, lat],             // as in capitals.json
  bbox: [west, south, east, north],  // the city (boundary minus the sea), 5 decimals
  area_km2: number,               // area of the city (boundary minus the sea, lakes included)
  label_chars: string,            // every character used in the street names and green-space
                                  // names drawn on the map, sorted, without the space: the
                                  // TextLayer character set and the `document.fonts.load` text
  zooms: { grid: [8, 14], city: [10, 16], evidence: 15 },
  sources: CapitalSources       // version and date of every source used for this capital
}

type CapitalSources = {
  osm: { version: string,         // the extract, e.g. "Geofabrik europe/sweden-261011"
         date: string,            // the extract's timestamp, e.g. "2026-10-11T20:21:06Z"
         relation: number,        // the boundary relation and its (pinned) version
         relation_version: number },
  osm_land_polygons: { version: null, date: string },   // Last-Modified of the file
  overture_buildings: { version: string, date: string }, // "2026-09-23.1", "2026-09-23"
  canopy_height: { version: string, date: string },     // "v1", imagery dates "2020-06-12/2020-06-25"
  ghs_pop: { version: string, date: string },           // "R2023A", epoch "2020"
  wikidata: { version: null, date: string }             // when the names were read
}
```

Dates are ISO 8601: a date, a UTC timestamp (`…Z`), a year (GHS-POP's epoch), or an interval
`first/last` (canopy imagery dates).

## `sources.json`

Every data source of the release, with its version, date, licence and attribution: the site's data
credits and its Methodology page read it, so a new release (a new OpenStreetMap extract, say)
updates them without a change to the site. It is a file of its own, rather than a block in
`ranking.json` or `capitals.json`, because it is about the release as a whole, it is read by
different pages (Methodology, footer) than the ranking and the Home map, and it stays valid while
those are partial.

```ts
{
  schema_version: 1,
  release: string,
  sources: Array<{                 // always these six, in this order:
                                   // osm, osm_land_polygons, overture_buildings, canopy_height,
                                   // ghs_pop, wikidata
    id: string,
    name: string,                  // e.g. "OpenStreetMap"
    version: string | null,        // e.g. "Geofabrik europe/sweden-261011", "2026-09-23.1",
                                   // "v1", "R2023A"; several values joined with ", "; null when
                                   // the source has no version (land polygons, Wikidata)
    date: string,                  // ISO 8601 (see above); when capitals differ, the interval
                                   // "first/last" over the capitals of the release
    licence: string,               // e.g. "ODbL 1.0", "CC BY 4.0", "CC0 1.0"
    licence_url: string,
    attribution: string,           // the credit to show, as it must be written
    url: string
  }>,
  capitals: Record<string, CapitalSources>  // per capital, as in its summary.json
}
```

## `capitals/<slug>/grid.pmtiles`

The 10 m grid of rules met, as image tiles whose pixels hold values, not colours.

- **Header:** tile type PNG, tile compression none, zooms 8–14, 512 px tiles on the Web Mercator
  (XYZ) tile grid. Tiles that would hold only value 4 are not stored (the API answers 204).
- **Encoding:** single-channel 8-bit PNG (greyscale, PIL mode `L`). Read the red channel after
  decoding without colour conversion (`createImageBitmap(blob, {colorSpaceConversion: 'none',
  premultiplyAlpha: 'none'})`) and sample with nearest-neighbour filtering.
- **Values:** `0`, `1`, `2`, `3` = number of rules met by the 10 m square under the pixel; `4` =
  no colour (water, or outside the city). Any other value is an error.
- **Resampling:** the grid is computed in EPSG:3035 (10 m) and each tile pixel takes the square
  under its centre (nearest neighbour), so squares stay crisp; at zoom 14 a square is about 4 px wide.
- **Metadata:** `{name, schema: "grid", schema_version: 1, tile_size: 512, values: {...}, encoding,
  resampling}`.
- Stockholm: 280 tiles, 2.0 MB, largest tile 37 kB.

## `capitals/<slug>/city.pmtiles`

Stockholm: 86 MB, 4,951 tiles, median 10 kB, largest 382 kB (zoom 13, central Stockholm). Sizes
are not limited: `just check` warns about tiles over 500 kB and lists those over 200 kB (26 for
Stockholm, none over 500 kB).

Vector tiles (MVT) written by Tippecanoe v2.82.0 with `-Z10 -z16 -r1 --no-feature-limit
--no-tile-size-limit --no-tiny-polygon-reduction --simplification=2 --buffer=8`. Tile compression
gzip. Every layer covers the analysis area (the city plus 1 km); geometry is simplified per zoom
by Tippecanoe; above zoom 16 the client overzooms.

| Layer | Geometry | Zooms | Attributes |
| ----- | -------- | ----- | ---------- |
| `land` | polygon | 10–16 | none. The analysis area minus water |
| `water` | polygon | 10–16 (pieces under 0.5 ha from 13) | `kind`: 0 = the whole water body (Shallows colour), 1 = open water, 6 m in from the shore (Water colour) |
| `shore` | line | coast 10–16, ripples 14–16 | `kind`: 0 = coast, 1 = ripple 13 m in, 2 = ripple 24 m in. The analysis area's own edge is not a shore |
| `water_marks` | line | 15–16 | none. Hatch marks: 11 m long, on a staggered 24 × 12 m grid in EPSG:3035, on water 30 m or more from the shore |
| `parks` | polygon | 13–16 | `pid` (int, the green space's id, as in evidence tiles), `kind` (`park`, `garden`, `nature_reserve`, `forest`, `wood`: the kind covering most of it), `ha` (area in ha, 2 decimals, of the whole green space), `name` (string, `""` when it has none) |
| `streets` | line | 13–16 | `rank` (1 motorway/trunk, 2 primary, 3 secondary, 4 tertiary, 5 unclassified/residential, 6 living street/pedestrian, 8 path), `path` (0 street, 1 footway/path/cycleway), `name` (string, `""` if none), `id` (OSM way id) |
| `street_labels` | point | 15 and 16 (each candidate at one zoom) | `name`, `angle` (degrees counter-clockwise from east, −90 < angle ≤ 90), `z` (the zoom it is for), `len` (px of straight street at that zoom), `w` (text width in px at 12 px, Figtree/Noto Sans 500), `rank` (as `streets`), `slen` (street length in Web Mercator metres) |
| `canopy` | polygon | 13–16 | none. 1 m pixels with vegetation ≥ 3 m, as shapes simplified by 1 m, shapes under 4 m² dropped |
| `buildings` | polygon | 13–16 | `id` (int, 1…n, sequential per capital, exact as a 32-bit float), `score` (rules met, 0–3), `r3`, `r30`, `r300` (0/1 each rule), `scored` (1 = in the city and has results; 0 = in the 1 km buffer, drawn neutral, all results 0), `cx`, `cy` (longitude, latitude of the representative point, 7 decimals: the centre for scaling, and the point that chooses the building's evidence tile) |
| `facades` | line | 16 | `sid` (int, facade id, unique per capital; the facades of a building have consecutive ids), `b` (building `id`), `ok` (1 = sees 3 trees or more), `n` (number of different trees seen), `orient` (facing direction: `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`, from true north), `res` (estimated residents behind it: the building's residents shared by facade length, 1 decimal). Only facades of scored buildings; shared walls and walls under 3 m are not facades. Each line runs with the building on its left (outside on its right) |
| `trees` | point | 14–16 | `id` (int, tree id per capital), `h` (height in whole metres, from the canopy height map at the tree top) |

Notes for the client:

- `r3` on a building is the building rule (more than half of its residents behind facades that see
  3 trees); the grid's rule 3 is per square. They can differ.
- Buildings and their copies across tile edges: Tippecanoe clips polygons to the tile plus its
  buffer, so keep deck.gl's `ClipExtension` on every sub-layer, or the cut edges show.
- Street label points are also copied into the neighbouring tiles' buffers; keep only those whose
  tile-local position is inside their own tile.

## `capitals/<slug>/evidence.pmtiles`

The relations behind each building that vector tiles cannot carry: which trees each facade sees
and from where, the canopy share, the walk and the green space reached. The building's outline and
its facades (with their orientation and residents) are drawn from `city.pmtiles` (layers
`buildings` and `facades`, filtered by the building id), so they are not repeated here.

- **Header:** tile type unknown, tile compression gzip (send with `Content-Encoding: gzip`), zoom 15
  only, on the same XYZ grid as the map tiles. Only tiles with buildings are stored.
- **Metadata:** `{name, schema: "evidence", schema_version: 1, content_type: "application/json",
  units: "decimetres", origin: "..."}`.
- **Which tile:** a building is stored, whole, in the tile containing its `cx`, `cy` (from
  `city.pmtiles` › `buildings`), computed with the usual formula:
  `x = floor((lon + 180) / 360 × 2^15)`, `y = floor((1 − asinh(tan(lat)) / π) / 2 × 2^15)`.
  Only scored buildings (`scored = 1`) have evidence.
- **Coordinates** (`Point = [x, y]`, integers): decimetres from the tile's north-west corner, x east,
  y south, in ground metres: `x = round((mx − tileMinX) × k × 10)`, `y = round((tileMaxY − my) × k × 10)`,
  where `mx, my` are Web Mercator metres and `k = cos(latitude of the tile's centre)`. To go back:
  `mx = tileMinX + x / 10 / k`, `my = tileMaxY − y / 10 / k`.
- **Sharing:** trees and points are listed once per tile and referenced by index, because many
  buildings see the same trees and many routes share their last stretch.

```ts
type Point = [number, number];

type EvidenceTile = {
  v: 1,
  tile: [15, number, number],         // z, x, y
  trees: Point[],                     // trees seen from this tile's facades (index = tree ref)
  points: Point[],                    // route points and facade viewpoints (index = point ref)
  parks: Record<string, {             // key: park id (pid, as in city.pmtiles › parks)
    name: string | null,
    kind: "park" | "garden" | "nature_reserve" | "forest" | "wood",
    ha: number,                       // area of the whole green space, 2 decimals
    ring: Point[]                     // exterior of its largest part, closed (simplified by 2 m,
                                      // cut to the analysis area plus 200 m)
  }>,
  buildings: Record<string, Building>  // key: building id (as in city.pmtiles › buildings)
};

type Building = {
  rules: [0 | 1, 0 | 1, 0 | 1],       // rule 3, rule 30, rule 300 (met = their sum)
  residents: number,                  // 1 decimal (may be 0)
  share3: number,                     // share of its residents behind facades that see 3 trees or
                                      // more (= share of facade length), 0–1, rounded UP to 3
                                      // decimals so that share3 > 0.5 exactly when rules[0] = 1;
                                      // 0 for a building without facades
  canopy: number,                     // canopy share of the land within 500 m of the building's
                                      // centre (cx, cy), 0–1, rounded DOWN to 3 decimals so that
                                      // canopy >= 0.3 exactly when rules[1] = 1
  walk: number | null,                // walking distance in whole metres, rounded UP (walk <= 300
                                      // exactly when rules[2] = 1); 0 = touches a green space;
                                      // null = no path within 100 m leads to one
  park: number | null,                // pid of the green space reached or touched (key of `parks`)
  route: number[] | null,             // point refs of the walk: building outline → nearest path →
                                      // along paths → the green space; null when walk is 0 or null
  facades: {
    first: number | null,             // sid of the building's first facade (null: no facade);
                                      // facade i has sid = first + i, as in city.pmtiles › facades
    seen: number[][],                 // per facade, the trees it sees (tree refs)
    from: number[][]                  // same shape as `seen`: per tree, the facade viewpoint (point
                                      // ref, 1 m outside the wall) it is seen from; draw sight
                                      // lines points[from[i][j]] → trees[seen[i][j]]
  }
};
```

Derived values (not stored, compute them in the client):

- facade passes: `seen[i].length >= 3` (= `ok` in `city.pmtiles`); trees seen by the building:
  the union of `seen`;
- rule 30's 500 m circle is centred on the building's `cx`, `cy`.

Sizes are not limited: `just check` warns, without failing, about any tile over 250 kB as stored
(gzipped), and prints the largest tile both gzipped and as plain JSON. Stockholm (597 tiles,
92,839 buildings, 11 MB): median 15 kB gzipped (46 kB as plain JSON), largest 69 kB gzipped
(277 kB plain), no warning. The densest tiles are villa districts (up to 945 buildings in one
tile).

## Licences of the release

The release is derived from OpenStreetMap (ODbL) and Overture Maps buildings (ODbL), Meta & WRI's
canopy height (CC BY 4.0), GHS-POP (CC BY 4.0) and Wikidata (CC0). It is published under the ODbL,
with the attributions listed in `sources.json`.
