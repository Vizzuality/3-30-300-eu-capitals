# Release format (schema version 1)

What a data release contains, file by file, exactly as the pipeline writes it. The client's Zod
schemas are written from this page; the pipeline's writers are in
`src/data_processing/pipelines/export/nodes.py`, `src/data_processing/pipelines/context/nodes.py`,
and `src/data_processing/pipelines/overview/nodes.py`, and `just check <release>` verifies a release against it.

```
data/03_primary/releases/<release>/        = s3://<bucket>/releases/<release>/
  ranking.json
  capitals.json
  sources.json
  europe.pmtiles                            the Home map
  capitals/<slug>/
    summary.json
    outline.json                            the city limits, drawn on the capital's page
    context.pmtiles                         the water around the city, for the page's overview
    grid.pmtiles
    city.pmtiles
    evidence.pmtiles
```

Conventions used everywhere:

- **Shares** are fractions from 0 to 1, rounded to 4 decimals. The client rounds them for display.
- **Names** (`name`, `country.name`) are objects with one string per locale, always all 24:
  `bg cs da de el en es et fi fr ga hr hu it lt lv mt nl pl pt ro sk sl sv`. They are the Wikidata
  labels; a language without a label falls back to the `mul` label, then English. A capital's
  name is the plain name of the city, never that of a region or a "City of …": Brussels' territory
  is the Brussels-Capital Region (Q240), but its names are the labels of the city (Q239, the item
  of the city's OpenStreetMap place node). Where a label is a "City of …" form, the name is the
  `name:<locale>` tag of the city's place node instead (Brussels in Irish, `An Bhruiséil`;
  Luxembourg in Maltese, `Lussemburgu`). Both are set in `conf/base/parameters/capitals.yml`
  (`name_wikidata`, `name_overrides`).
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

**Partial releases:** a release can hold fewer capitals (the first, `2026-10-stockholm`, held one),
in which case `complete` is `false`. The client must not assume 27 rows.

## `capitals.json`

The capitals for the Home map: real outlines, how much each is enlarged and where it is drawn.

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
    centre: [lon, lat],        // centroid of the city (boundary minus the sea): its true position
    display: [lon, lat],       // where the enlarged outline is drawn on Home (its `centre` moved
                               // there); = centre unless it was nudged away from a neighbour
    km: number,                // square root of the city's area in km² (2 decimals): its size
    scale: number,             // enlargement on Home (4 significant digits): draw `outline` × scale
                               // metres around `display` (e.g. deck.gl METER_OFFSETS with
                               // coordinateOrigin = display)
    leader: [lon, lat] | null, // when the outline was nudged off its true position: the point of
                               // the drawn outline nearest to `centre`; draw a thin line from
                               // `centre` to it. null otherwise
    outline: Array<            // one entry per polygon drawn (see "Outlines" below)
      Array<Array<[x, y]>>     // rings (first = exterior, then holes), closed, in whole metres
    >                          // from `centre` (azimuthal equidistant, x east, y north)
  }>
}
```

**Home layout** (parameters in `conf/base/parameters/home.yml` › `layout`). It is computed in screen
pixels at a reference scale of the Home view, 6,000 Web Mercator metres per pixel (Europe across a
desktop map), so `display` and `leader` are right at about that scale; zooming in only spreads the
capitals further apart.

- **Enlargement:** each outline is drawn so that its size (the square root of its area) is
  `12.5 × km^0.4` pixels at the reference scale: 12.5 px for a 1 km city (Valletta, about 0.9 km,
  ≈ 12 px), 36 px for Stockholm, 52 px for Rome. The smaller the city, the more it is enlarged
  (`scale` from about 6 for Rome to about 64 for Valletta). `scale` already includes the latitude,
  so the client applies it as it is.
- **Nudging:** outlines closer than 3 px at the reference scale are pushed apart along the line
  joining their positions, by their overlap along that line plus the gap, the smaller one moving
  more (in inverse proportion to their areas), until no two are closer. Outlines with room around
  them do not move. The capitals' names are not part of the layout: Home shows them on the map,
  in the visitor's language, under the outlines (from about zoom 3.2), with a hover label on top.
- **Leader:** an outline nudged more than 4 px that no longer covers its true centre gets `leader`.
- **Outlines** (`home.yml` › `outline`) are display geometries, made for the size Home draws them
  at; the ranking rows draw the same outline in a 24 px box. Every figure (`km`, `residents`, the
  shares, `area_km2`) comes from the full-detail city, never from them. In pixels of the drawn
  outline at the reference scale (1 px = `km × 1000 / (12.5 × km^0.4)` metres: 76 m for Valletta,
  400 m for Helsinki, 694 m for Sofia), from the city (boundary minus the sea):
  - channels narrower than 0.2 px are closed (dilated, then eroded, by 0.1 px with mitred corners):
    Copenhagen's canals, Suomenlinna's straits;
  - parts and holes under 4 px² (2 × 2 px, which the 1.1 px edge alone would cover) are dropped,
    the largest part always kept: Helsinki keeps its mainland and six islands (Lauttasaari,
    Villinki, Isosaari, Vartiosaari, Vallisaari, Suomenlinna) of its 730 parts; Copenhagen keeps
    its two parts and Frederiksberg (a hole of 89 px²); Rome loses Vatican City (1 px²);
  - the rest is simplified to 0.5 px (Douglas-Peucker, topology kept): half the edge's width, 1 px
    a zoom closer.

  The release `2026-10-all`: 2,809 points in 37 parts and 1 hole for the 27 capitals (Helsinki 330
  points, 7 parts; Copenhagen 148 points, 2 parts, 1 hole).
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
  bbox: [west, south, east, north],  // the city (boundary minus the sea): its own bounds in
                                  // longitude, latitude, rounded outwards to 5 decimals
  context: {                      // the overview's rectangle (see below): the camera stays in
    bbox: [west, south, east, north],  // it, and context.pmtiles covers it; 5 decimals,
                                       // rounded outwards
    min_zoom: { desktop: number,  // the least zoom of each layout's camera: one below its
                phone: number }   // fitted zoom, which may be below 9 (Rome's phone: 6.98);
                                  // 2 decimals, rounded up
  },
  area_km2: number,               // area of the city (boundary minus the sea, lakes included)
  label_chars: string,            // every character used in the street names and green-space
                                  // names drawn on the map, sorted, without the space: the
                                  // TextLayer character set and the `document.fonts.load` text
  zooms: { grid: [8, 14], city: [10, 16], evidence: 15,
           context: [7, 12] },    // context.pmtiles: from the floor of the least min_zoom
                                  // (at most 9) to 12, or further in (Valletta 9–15)
  sources: CapitalSources       // version and date of every source used for this capital
}

type CapitalSources = {
  osm: { version: string,         // the extract, e.g. "Geofabrik europe/sweden-261011"; when the
                                  // city and its buffer cross the edge of every single region,
                                  // several, joined with ", " ("Geofabrik europe/slovakia-261011,
                                  // europe/austria-261011, europe/hungary-261011"), then those
                                  // the overview's water also reads (context.pmtiles: Copenhagen's
                                  // "Geofabrik europe/denmark-261011, europe/sweden-261011")
         date: string,            // the extract's timestamp, e.g. "2026-10-11T20:21:06Z" (an
                                  // interval "first/last" if several extracts differ)
         relation: number,        // the boundary relation and its (pinned) version
         relation_version: number,
         subtracted?: Array<{     // only when relations are cut out of the relation's area to
           relation: number,      // give the territory (Nicosia: the UN buffer zone, 3263909)
           relation_version: number }> },
  osm_land_polygons: { version: null, date: string },   // Last-Modified of the file
  overture_buildings: { version: string, date: string }, // "2026-09-23.1", "2026-09-23"
  canopy_height: { version: string, date: string },     // "v1", imagery dates "2020-06-12/2020-06-25"
  ghs_pop: { version: string, date: string },           // "R2023A", epoch "2020"
  wikidata: { version: null, date: string }             // when the names were read
}
```

Dates are ISO 8601: a date, a UTC timestamp (`…Z`), a year (GHS-POP's epoch), or an interval
`first/last` (canopy imagery dates).

## `capitals/<slug>/outline.json`

The city limits, which the capital's page loads first and draws at once (the outline growing in,
then the limit line over `city.pmtiles`, which has no boundary layer). A GeoJSON Feature (RFC 7946)
that deck.gl's `GeoJsonLayer` takes as it is, with the release's members beside the GeoJSON ones.

```ts
{
  type: "Feature",
  schema_version: 1,
  release: string,
  slug: string,
  tolerance_m: number,          // the simplification, metres on the ground (2 decimals)
  properties: { slug: string },
  geometry: {
    type: "MultiPolygon",       // always, even for one polygon
    coordinates: Array<Array<Array<[lon, lat]>>>  // 6 decimals; rings closed, exteriors
  }                             // counter-clockwise, holes clockwise
}
```

- **Geometry:** the city of the figures (the boundary minus the sea, lakes included; never the
  1 km analysis area), with every island and hole: Helsinki's 730 parts, Copenhagen's
  Frederiksberg, Rome's Vatican City, Berlin's three tiny pieces and one hole of its boundary.
  Its bounds are `summary.json › bbox`, give or take the simplification.
- **Simplification** (`tiles.yml` › `outline`): Douglas-Peucker with topology kept, so the
  geometry stays valid, to 0.75 px of a 512 px tile at zoom 15 (where the evidence is read), at
  the city's latitude: `0.75 × 2.389 m × cos(lat)`, from 0.89 m (Helsinki) to 1.47 m (Nicosia).
  With a limit line of about 1.5 px, that is half its width at zoom 15, its width at zoom 16 (the
  last zoom of `city.pmtiles`) and under half a pixel at zoom 14 and below. Measured, the outline
  stays within 1.1 px of the city at zoom 15 (Helsinki; 0.9 px elsewhere) and its area within
  0.015 % of the city's. 6 decimals are 0.11 m north–south.
- **Size:** written without whitespace. The release `2026-10-all`: 3.7 kB (Valletta) to 135 kB
  (Sofia), most under 75 kB, 1.85 MB for the 27; Helsinki, whose coast and 730 islands hold
  64,353 points, is 814 kB (37,258 points; 218 kB gzipped). `just check` warns over 150 kB and
  fails over 1 MB (`check.yml`).

**Context rectangle** (`conf/base/parameters/overview.yml`). The overview's camera is fitted to
the city's bounds (`bbox`) as the client fits it (math.gl's `fitBounds`, on a 512 px world at
zoom 0), on the desktop map (960 × 900 px, padding 72, 72, 42, 28: top, right, bottom, left) and
on the phone's map band (412 × 386 px, padding 72, 16, 80, 16). The fit goes up to zoom 18 and
has no floor: a whole city is always shown, below the page's usual least zoom of 9 if need be
(Rome and Sofia fit at 7.98 and 7.97 on the phone's band). Each layout's least zoom is its fitted
zoom minus 1 (`min_zoom`); `context.bbox` is the union of what both layouts show at their least
zoom, around their fitted centres. The client clamps its camera to it. `zooms.context` starts at
the floor of the lower `min_zoom` (at most 9: 6 for Rome and Sofia, 7 for twelve capitals, 8 for
seven) so that a camera at its least zoom loads tiles, and ends at 12, or at the fitted zoom
where a city is seen closer (deck.gl loads the tiles of the rounded zoom: Valletta, at 15).

## `capitals/<slug>/context.pmtiles`

The capital page's overview ("the city on a complete map"), over the context rectangle: every
water (the sea, lakes and rivers, inside the city or not, drawn in one colour; the land around it
takes the page's background and the city's land carries the grid), and two reference layers so
visitors can orient themselves: the main roads, and the names of the city's districts.

- **Header:** vector tiles (MVT) written by Tippecanoe v2.82.0 with `-Z<min> -z<max> -r1
  --no-feature-limit --no-tile-size-limit --no-tiny-polygon-reduction --simplification=2
  --buffer=8` (`-r1`: every place at every zoom), zooms `summary.json › zooms.context`, tile
  compression gzip. The metadata without `generator_options` (as `city.pmtiles`).

| Layer | Geometry | Zooms | Attributes |
| ----- | -------- | ----- | ---------- |
| `water` | polygon | all | none |
| `roads` | line | motorway, trunk, primary and what connects them from 7 (or the archive's first zoom); the others from 10 | `class` (`motorway`, `trunk`, `primary`, `secondary`, `tertiary`), `tunnel` (0 or 1: draw it faint), `dual` (0 or 1: a dual carriageway drawn as one line: draw it wider) |
| `places` | point | all | `name` (as OSM's `name`: see the language rules below), `tier` (1 the districts, 2 the finer level), `rank` (GHS-POP residents within 1 km of the point), `w` (width of `name` in px at 12 px, Figtree/Noto Sans 500, as `street_labels`) |

The client places the names itself, by collision: priority by `tier`, then `rank`.

- **`water`** (polygons, no attributes): the sea (outside OpenStreetMap's land
  polygons) and every lake, river and reservoir of the Geofabrik extracts (the pipeline's water
  selection: `natural=water`, `waterway=riverbank`, `landuse=reservoir`), clipped to
  `context.bbox`.
- **Slimmed away from the city:** outside the city and its 1 km band (the analysis area of
  `city.pmtiles`), water narrower than about 2 px at zoom 11 (an opening by 1 px: 14–18 m;
  ditches, canals, streams) and pieces under 3 × 3 px at zoom 11 are left out. In the band, every
  water is kept, as `city.pmtiles` has it, so the overview draws one water layer: this one.
- **Simplified** to 0.75 px at zoom 12 (or the archive's last zoom), at the rectangle's latitude
  (7.1 m in Helsinki to 11.7 m in Nicosia; 1.45 m in Valletta, at zoom 15), topology kept, then by
  Tippecanoe within 0.25 px at each zoom.
- **Drawing it with `city.pmtiles`:** at the overview's zooms (up to 12) draw this water only, and
  load no `city.pmtiles` tiles: the overview then costs less than it does with the city tiles'
  water (Amsterdam's first desktop screen: 190 kB of context tiles, against 45 kB of slimmed
  context plus 427 kB of city tiles). Closer in, draw `city.pmtiles`' `land` and `water` over it:
  they cover the analysis area exactly, hiding the context's simplified shores there, while the
  context still draws the water beyond.
- **Sizes** (`2026-10-all`, water, roads and places): 24 kB (Valletta) to 1.04 MB (Amsterdam and
  Stockholm); 11.4 MB for the 27 (6.4 MB with the water alone). The tiles of the first screen:
  3–234 kB on desktop (1.4 MB for the 27), 3–133 kB on the phone (1.1 MB). `just check` warns
  over 1.5 MB (`check.yml`).
- **Extracts:** the capital's own, plus the regions its rectangle crosses into
  (`capitals.yml › context_extracts`), all of the same date; they are listed in
  `summary.json › sources.osm`. Those not on disk are left out (the run lists them in
  `stats/context_tiles.json`): their lakes and rivers are missing, the sea never is. In
  `2026-10-all` none is missing: 16 neighbouring extracts were added for the context (Zuid-Holland,
  Lorraine, Saarland, Rheinland-Pfalz, Castilla-La Mancha, Castilla y León, Ústecký, Plzeňský,
  Italy's south, Serbia, North Macedonia, Belarus, Bosnia and Herzegovina, Łódzkie,
  Zachodniopomorskie, Sachsen-Anhalt); only open sea (Helsinki's and Tallinn's) and a 0.14 km²
  sliver of Královéhradecký at the edge of Prague's rectangle lie outside every extract read.

**`roads`: the main roads, as OpenStreetMap's own maps choose them** (`overview.yml` › `roads`;
one rule for the 27, the same over the whole context rectangle, no rule for any one capital).

- **Selection, by class only:** every OSM way whose `highway` is `motorway`, `trunk`, `primary`,
  `secondary` or `tertiary`, from every extract the context reads, clipped to `context.bbox`.
  Left out: every `*_link` (ramps and slip roads: where a motorway is, not how its interchanges
  work), residential and minor streets, paths, and areas (`area=yes`). No budget, no ranking, no
  repair: the network is OSM's own at these classes.
- **Zooms:** motorway, trunk and primary from 7 (`main_minzoom`), secondary and tertiary from 10
  (`minzoom`), or the archive's first zoom if later.
- **Tunnels** are kept, with `tunnel` 1.
- **Dual carriageways, one line** (`dual` 1): the two one-way carriageways of the same road (its
  `ref`, else its name), whatever the class of their ways, running the other way side by side
  within 60 m (`merge_max_m`: medians of 10 to 60 m), over at least 100 m (`merge_min_m`,
  measured every `merge_step_m`, 10 m), are replaced by their centreline; carriageways chained
  into one line through a U are paired too. A shorter pair is merged when it directly continues
  such a stretch of the same road, at either end (a carriageway that forks before the road's last
  block: Drottningholmsvägen at Fridhemsplan); it never continues another short pair. The centreline takes the higher class of the two
  sides (OSM often tags a block of one carriageway a class lower: Drottningholmsvägen at
  Fridhemsplan). Pairs are made across a tunnel portal (Söderleden and Söderledstunneln at
  Skanstull): the centreline is a tunnel only where both carriageways are. Every road ending on
  a removed carriageway is extended to the centreline, short crossings of the median are
  dropped, and a centreline's end is joined to the road it stops at, so the connections hold.
  Then a one-way stub of the same road left between two stretches of its centreline (both ends
  on it) and shorter than 120 m (`stub_max_m`, twice `merge_max_m`: every such stub measured in
  Stockholm, Madrid, Paris and Sofia stays within 60 m of the centreline, longer ones start to
  leave it) is dropped, the gap it spanned closed and the roads that ended on it extended to the
  centreline; a centreline drawn twice is drawn once. A carriageway with no partner stays as it
  is, as does a roundabout under its own name (Lindhagensplan).
- Lines are merged by class, tunnel, first zoom and `dual`, and simplified to 0.75 px at zoom 12
  (`tolerance_px`, `tolerance_zoom`).

**`places`: the candidate district names** (`overview.yml` › `places`).

- **Tier 1:** the coarsest administrative level below the city's (OSM `admin_level`, areas half
  of which lie in the city) that gives 10 to 30 areas; when none does, `place=suburb` thinned by
  spacing to 30 (the smallest spacing, kept by `rank`).
- **Tier 2:** the next finer administrative level with more areas, else `place=suburb` when tier
  1 was an administrative level. A tier-2 name repeating a tier-1 name within 2 km is left out
  (Berlin's Ortsteil Mitte).
- **Overrides** (`capitals.yml › places`), where the rule picks wrong, with the reason noted:
  Stockholm (`place=suburb`, the 116 stadsdelar, then `place=neighbourhood`; its admin_level 9 is
  the 11 stadsdelsområden, administrative names).
- **Point:** an area's pole of inaccessibility (of its largest part, inside the city), or the
  place node; always inside the city.
- **Languages** (the user's rules): a name is in the local language; it shows two languages
  where other maps such as OpenStreetMap display two (Brussels' "Ixelles - Elsene", as OSM's
  `name` has it); never more languages than that, unless they are official in the city. So
  `name` is OSM's `name`, and no `name:xx` tag is added (Helsinki's Swedish, Luxembourg's
  Luxembourgish and Dublin's Irish names are in OSM's `name:xx`, not in its `name`, and are not
  shown).
- **Names as people say them** (`capitals.yml › places.name_rules`: a regular expression, its
  replacement and a note, applied to both tiers): Paris' arrondissements to their number ("Paris
  18e Arrondissement" → "18e", "1er"; its quartiers without "Quartier", the article kept as
  French uses it: "Quartier de la Roquette" → "La Roquette", "Quartier des Halles" → "Les Halles",
  "Quartier de Belleville" → "Belleville"; four kept whole, `name_keep`, where the short name would
  mislead: "Quartier d'Amérique", "de l'Europe", "de la Gare", "du Combat"); Bratislava's boroughs without the city ("Bratislava-
  Petržalka" → "Petržalka"). Budapest's "VII. kerület" stays as it is. A rule never drops a
  language: bilingual names stay as OSM has them (Brussels' "Ixelles - Elsene").

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
  sources: Array<{                 // always these seven, in this order:
                                   // osm, osm_land_polygons, overture_buildings, canopy_height,
                                   // ghs_pop, wikidata, natural_earth (the Home map only: it is
                                   // not in the per-capital blocks)
    id: string,
    name: string,                  // e.g. "OpenStreetMap"
    version: string | null,        // e.g. "Geofabrik europe/sweden-261011", "2026-09-23.1",
                                   // "v1", "R2023A", "5.1.1"; several values joined with ", "
                                   // (OpenStreetMap: one "Geofabrik", then every extract once,
                                   // sorted); null when
                                   // the source has no version (land polygons, Wikidata)
    date: string,                  // ISO 8601 (see above); when capitals differ, the interval
                                   // "first/last" over the capitals of the release
    licence: string,               // e.g. "ODbL 1.0", "CC BY 4.0", "CC0 1.0", "Public domain"
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
gzip. The metadata is Tippecanoe's, without `generator_options` (its command line, which holds the
paths of the machine that built it); `just check` fails on an archive whose metadata holds an
absolute path. Every layer covers the analysis area (the city plus 1 km); geometry is simplified per zoom
by Tippecanoe; above zoom 16 the client overzooms.

| Layer | Geometry | Zooms | Attributes |
| ----- | -------- | ----- | ---------- |
| `land` | polygon | 10–16 | none. The analysis area minus water |
| `water` | polygon | 10–16 (pieces under 0.5 ha from 13) | `kind`: 0 = the whole water body (Shallows colour), 1 = open water, 6 m in from the shore (Water colour) |
| `shore` | line | coast 10–16, ripples 14–16 | `kind`: 0 = coast, 1 = ripple 13 m in, 2 = ripple 24 m in. The analysis area's own edge is not a shore |
| `water_marks` | line | 15–16 | none. Hatch marks: 11 m long, on a staggered 24 × 12 m grid in EPSG:3035, on water 30 m or more from the shore. Missing from the archive's metadata when a capital has no such water (Athens) |
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

## `europe.pmtiles`

The Home map: a muted map of Europe under the capitals of `capitals.json`. Built from Natural Earth's
1:50m countries (version in `sources.json`, public domain), clipped to 32° W–50° E, 24°–73° N.

Vector tiles (MVT) written by Tippecanoe v2.82.0 with `-Z0 -z7 -r1 --no-feature-limit
--no-tile-size-limit --detect-shared-borders --buffer=8 --simplification=8
--simplification-at-maximum-zoom=1`, tile compression gzip, zooms 0–7 (the client overzooms
beyond). Tippecanoe simplifies the geometry per zoom: lines stay within 8 tile units (1 px of a
512 px tile, which Home draws at 0.7–1.4 times its size) of their place at zooms 0–6, and within 1
unit at zoom 7. The metadata is Tippecanoe's, without `generator_options` (as `city.pmtiles`).

**Islands** (`home.yml` › `islands`) appear from the first zoom at which they cover 4 px² of a
512 px tile (2 × 2 px, as the capitals' outlines): at zoom 4 (Home's desktop view) an island of
62 km² at 36° N, 47 km² at 45° N, 24 km² at 60° N; four times that at zoom 3 (phones). Of the 192
pieces of land of the frame, 122 show at zoom 3, 180 from zoom 4, 191 from zoom 5 (Gozo among
them) and 1 never. The largest piece of each country of the release shows at every zoom, so a
capital's country never vanishes (Malta would show only from zoom 4).
`countries` and `borders` hold one feature per first zoom (a country's islands that show
later are features of their own, with the same attributes); `sea`, `coastline` and `sea_marks`
are drawn, for each range of zooms, around the land shown there (zooms 0, 1, 2, 3, 4 and 5–7), so
the sea never has a hole where no island is drawn.

| Layer | Geometry | Attributes |
| ----- | -------- | ---------- |
| `sea` | polygon | none. The frame minus the land shown at that zoom. There is no land layer: the countries cover the land |
| `countries` | polygon | `code` (ISO 3166-1 alpha-2, Natural Earth's `ISO_A2_EH`; `ADM0_A3` when it has none), `eu` (1 = the country of a capital of the release, 0 = other), `tint` (0, 1 or 2: three near-identical paper tints for the EU countries, chosen so that neighbours differ where they can; 0 for the others). Northern Cyprus, a country of its own in Natural Earth, is drawn as part of Cyprus |
| `borders` | line | none. Country outlines that are not coast (they stop 3 km from it) |
| `coastline` | line | `kind`: 0 = the coast, 1 = a ripple 14 km out to sea, 2 = a ripple 32 km out |
| `graticule` | line | `axis` (`meridian` or `parallel`), `deg` (its longitude or latitude); every 10° |
| `sea_marks` | line | none. Hatch marks on the sea 48 km or more from land: 57 km long, on a staggered 120 × 63 km grid of Web Mercator metres, along the map's rows (as `water_marks` in the city maps) |

The release `2026-10-all`: 809 kB (1.04 MB before the islands, `--simplification=8` and the
land layer left out), 1,270 tiles, largest 14 kB (32 kB before).

## Licences of the release

The release is derived from OpenStreetMap (ODbL) and Overture Maps buildings (ODbL), Meta & WRI's
canopy height (CC BY 4.0), GHS-POP (CC BY 4.0), Wikidata (CC0) and, for the Home map, Natural
Earth (public domain). It is published under the ODbL, with the attributions listed in
`sources.json`.
