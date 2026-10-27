import { describe, expect, test } from "vitest"

import { searchOrder } from "@/data/building-query"
import type { EvidenceTile } from "@/data/schemas"
import {
  buildingSelection,
  childTiles,
  circleRing,
  evidenceArea,
  evidencePlace,
  fitsEvidence,
  groundDistance,
  linePart,
  parkAnchor,
  partsBounds,
  keyboardFacades,
  passingFacades,
  tileAt,
  tilesCovering,
  type BuildingTilePart,
  type LngLat,
} from "@/lib/building-evidence"

// The evidence tile of central Södermalm, where building 31947 is
const tile = { z: 15, x: 18029, y: 9639 }

/** The tile's north-west corner and the metres in one of its degrees */
const corner = evidencePlace(tile, [0, 0])

describe("places of an evidence tile", () => {
  test("its corner is the tile's north-west corner", () => {
    const [longitude, latitude] = corner
    expect(longitude).toBeCloseTo((18029 / 2 ** 15) * 360 - 180, 9)
    expect(tileAt([longitude + 1e-7, latitude - 1e-7], 15)).toEqual(tile)
  })

  test("in decimetres on the ground, x east and y south", () => {
    // 100 m east, then 100 m south: ground metres, whatever the latitude
    expect(groundDistance(corner, evidencePlace(tile, [1000, 0]))).toBeCloseTo(
      100,
      0
    )
    const south = evidencePlace(tile, [0, 1000])
    expect(groundDistance(corner, south)).toBeCloseTo(100, 0)
    expect(south[1]).toBeLessThan(corner[1])
    expect(south[0]).toBeCloseTo(corner[0], 9)
  })
})

describe("the tiles of an area", () => {
  test("row by row, every tile it touches", () => {
    const [west, north] = evidencePlace(tile, [10, 10])
    const [east, south] = evidencePlace(tile, [7000, 7000])
    expect(
      tilesCovering([west, south, east, north], 15, { ...tile, reach: 2 })
    ).toEqual([
      { z: 15, x: 18029, y: 9639 },
      { z: 15, x: 18030, y: 9639 },
      { z: 15, x: 18029, y: 9640 },
      { z: 15, x: 18030, y: 9640 },
    ])
  })

  test("only those within the window, however wide the area", () => {
    expect(
      tilesCovering([-180, -85, 180, 85], 15, { ...tile, reach: 1 })
    ).toEqual([
      { z: 15, x: 18028, y: 9638 },
      { z: 15, x: 18029, y: 9638 },
      { z: 15, x: 18030, y: 9638 },
      { z: 15, x: 18028, y: 9639 },
      { z: 15, x: 18029, y: 9639 },
      { z: 15, x: 18030, y: 9639 },
      { z: 15, x: 18028, y: 9640 },
      { z: 15, x: 18029, y: 9640 },
      { z: 15, x: 18030, y: 9640 },
    ])
  })

  test("the four tiles under a tile", () => {
    expect(childTiles(tile)).toEqual([
      { z: 16, x: 36058, y: 19278 },
      { z: 16, x: 36059, y: 19278 },
      { z: 16, x: 36058, y: 19279 },
      { z: 16, x: 36059, y: 19279 },
    ])
  })

  test("an address's area is searched from its middle out", () => {
    const [west, north] = evidencePlace(tile, [-4000, -2000])
    const [east, south] = evidencePlace(tile, [8000, 6000])
    const order = searchOrder([west, south, east, north].join())
    expect(order[0]).toEqual({ x: 18029, y: 9639 })
    expect(order).toHaveLength(6)
    expect(searchOrder("")).toEqual([])
  })

  test("an address's area of Södermalm: its four tiles, from the middle out", () => {
    expect(searchOrder("18.0698,59.3092,18.0805,59.3144")).toEqual([
      { x: 18029, y: 9639 },
      { x: 18028, y: 9639 },
      { x: 18029, y: 9640 },
      { x: 18028, y: 9640 },
    ])
  })

  test("a narrow strip is searched along it, as far as the nearest tiles go", () => {
    expect(searchOrder("17.5,59.3101,18.5,59.3102")).toEqual(
      [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -8].map((dx) => ({
        x: 18022 + dx,
        y: 9640,
      }))
    )
  })

  test("the whole world is searched only around its middle", () => {
    const order = searchOrder("-180,-85,180,85")
    expect(order).toHaveLength(16)
    expect(order[0]).toEqual({ x: 16384, y: 16384 })
  })
})

// A small tile: one building with three facades (the second sees 3 trees),
// a walk to a park
const evidence: EvidenceTile = {
  v: 1,
  tile: [15, tile.x, tile.y],
  trees: [
    [100, 100],
    [120, 100],
    [140, 100],
    [400, 400],
  ],
  points: [
    [110, 200],
    [130, 200],
    [150, 200],
    [300, 300],
    [300, 600],
    [500, 600],
  ],
  parks: {
    "7": {
      name: "Vita bergen",
      kind: "park",
      ha: 12.5,
      ring: [
        [500, 600],
        [900, 600],
        [900, 900],
        [500, 600],
      ],
    },
  },
  buildings: {
    "31947": {
      rules: [0, 0, 1],
      residents: 151,
      share3: 0.4,
      canopy: 0.2,
      walk: 61,
      park: 7,
      route: [3, 4, 5],
      facades: {
        first: 102279,
        seen: [[3], [0, 1, 2], []],
        from: [[3], [0, 1, 2], []],
      },
    },
  },
}

const at = (x: number, y: number) => evidencePlace(tile, [x, y])

const facadePiece = (sid: number, ok: number, path: Array<LngLat>) => ({
  sid,
  ok,
  n: ok ? 3 : 1,
  orient: "NE",
  res: 10,
  path,
})

// The building lies across two city tiles: each holds its part of it
const parts: Array<BuildingTilePart> = [
  {
    place: {
      longitude: at(200, 250)[0],
      latitude: at(200, 250)[1],
      bounds: [
        at(100, 300)[0],
        at(100, 300)[1],
        at(250, 200)[0],
        at(250, 200)[1],
      ],
    },
    facades: [
      facadePiece(102279, 0, [at(100, 200), at(250, 200)]),
      facadePiece(102280, 1, [at(250, 200), at(250, 300)]),
    ],
  },
  {
    place: {
      longitude: at(200, 250)[0],
      latitude: at(200, 250)[1],
      bounds: [
        at(240, 320)[0],
        at(240, 320)[1],
        at(300, 210)[0],
        at(300, 210)[1],
      ],
    },
    facades: [facadePiece(102280, 1, [at(250, 290), at(250, 320)])],
  },
  { place: null, facades: [] },
]

describe("a selected building, from its tiles", () => {
  const selection = buildingSelection(evidence, 31947, parts)

  test("its figures, its place and its whole outline", () => {
    expect(selection?.record.id).toBe(31947)
    expect(selection?.record.park).toEqual({
      name: "Vita bergen",
      kind: "park",
      ha: 12.5,
    })
    expect(selection?.centre).toEqual(at(200, 250))
    expect(selection?.bounds).toEqual(partsBounds(parts))
    expect(selection?.bounds[2]).toBeCloseTo(at(300, 0)[0], 9)
  })

  test("its facades in order, each piece of each, with the trees it sees", () => {
    const facades = selection?.facades ?? []
    expect(facades.map(({ sid }) => sid)).toEqual([102279, 102280, 102281])
    expect(facades.map(({ passes }) => passes)).toEqual([false, true, false])
    expect(facades[1].pieces).toHaveLength(2)
    expect(facades[1].sights).toEqual([
      { from: at(110, 200), tree: at(100, 100) },
      { from: at(130, 200), tree: at(120, 100) },
      { from: at(150, 200), tree: at(140, 100) },
    ])
    // A facade the city tiles do not hold is still listed, with no line
    expect(facades[2].pieces).toEqual([])
    expect(passingFacades(selection!).map(({ sid }) => sid)).toEqual([102280])
    // The panel describes the facades the tiles hold
    expect(selection?.record.facades.map(({ sid }) => sid)).toEqual([
      102279, 102280,
    ])
  })

  test("the keyboard goes through every facade it has a line for, around the building clockwise from north", () => {
    // From the centre (200, 250), x east and y south: the facade along
    // x = 250 lies east (90°), the one along y = 200 north-west (333°)
    expect(keyboardFacades(selection!).map(({ sid }) => sid)).toEqual([
      102280, 102279,
    ])
    // Seen from the south-west, the northern wall comes first (10°), then
    // the eastern one (45°)
    const turned = { ...selection!, centre: at(150, 350) }
    expect(keyboardFacades(turned).map(({ sid }) => sid)).toEqual([
      102279, 102280,
    ])
  })

  test("its walk and its park, whose name goes at the walk's end", () => {
    expect(selection?.route).toEqual([at(300, 300), at(300, 600), at(500, 600)])
    expect(selection?.park?.ring[0]).toEqual(at(500, 600))
    expect(parkAnchor(selection!)).toEqual(at(500, 600))
    // Next to its park: on the park's edge nearest the building
    expect(parkAnchor({ ...selection!, route: null })).toEqual(at(500, 600))
    expect(parkAnchor({ ...selection!, park: null })).toBeUndefined()
  })

  test("none when the tile has no such building, or the city tiles no place", () => {
    expect(buildingSelection(evidence, 1, parts)).toBeNull()
    expect(
      buildingSelection(evidence, 31947, [{ place: null, facades: [] }])
    ).toBeNull()
  })
})

describe("what the camera fits", () => {
  const selection = buildingSelection(evidence, 31947, parts)!

  test("the 3 trees: the building and the trees its facades see, with room", () => {
    const area = evidenceArea(selection, 3)
    const [west, , , north] = [at(100, 100)[0], 0, 0, at(100, 100)[1]]
    expect(area.west).toBeLessThan(west)
    expect(area.north).toBeGreaterThan(north)
    // 30 m of room
    expect(groundDistance([area.west, north], [west, north])).toBeCloseTo(30, 0)
  })

  test("a facade: only the trees it sees", () => {
    const whole = evidenceArea(selection, 3)
    const facade = evidenceArea(selection, 3, 102279)
    // Its only tree is south of the others
    expect(facade.north).toBeLessThan(whole.north)
  })

  test("the 500 m circle, with room", () => {
    const area = evidenceArea(selection, 30)
    const [longitude, latitude] = selection.centre
    expect(
      groundDistance([longitude, latitude], [longitude, area.north])
    ).toBeCloseTo(540, 0)
    expect(
      groundDistance([longitude, latitude], [area.east, latitude])
    ).toBeCloseTo(540, 0)
  })

  test("the walk, and the park around its end", () => {
    const area = evidenceArea(selection, 300)
    const end = at(500, 600)
    expect(area.south).toBeLessThanOrEqual(end[1])
    expect(area.east).toBeGreaterThanOrEqual(end[0])
  })

  test("the trees only when the building is out of view or too small to read", () => {
    const bounds = selection.bounds
    const inView = { west: 0, south: 0, east: 90, north: 89 }
    expect(fitsEvidence({ rule: 3, bounds, inView, viewWidth: 300 })).toBe(
      false
    )
    expect(fitsEvidence({ rule: 3, bounds, inView, viewWidth: 600 })).toBe(true)
    const elsewhere = { west: 0, south: 0, east: 1, north: 1 }
    expect(
      fitsEvidence({ rule: 3, bounds, inView: elsewhere, viewWidth: 300 })
    ).toBe(true)
    // The circle and the walk, always
    expect(fitsEvidence({ rule: 30, bounds, inView, viewWidth: 300 })).toBe(
      true
    )
    expect(fitsEvidence({ rule: 300, bounds, inView, viewWidth: 300 })).toBe(
      true
    )
  })
})

describe("lines drawing themselves", () => {
  const line: Array<LngLat> = [at(0, 0), at(1000, 0), at(1000, 1000)]

  test("a share of the line's length, along it", () => {
    const total =
      groundDistance(line[0], line[1]) + groundDistance(line[1], line[2])
    const part = linePart(line, 0.4)
    expect(part).toHaveLength(2)
    expect(groundDistance(part[0], part[1])).toBeCloseTo(0.4 * total, 3)
    const more = linePart(line, 0.8)
    expect(more).toHaveLength(3)
    expect(groundDistance(more[2], line[2])).toBeCloseTo(0.2 * total, 3)
    expect(linePart(line, 1)).toEqual(line)
    expect(linePart(line, 0)).toEqual([line[0], line[0]])
  })

  test("the 500 m circle, closed, 500 m from its centre all round", () => {
    const centre = at(2000, 2000)
    const ring = circleRing(centre, 500, 64)
    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[64])
    for (const place of ring) {
      expect(groundDistance(centre, place)).toBeCloseTo(500, -1)
    }
  })
})
