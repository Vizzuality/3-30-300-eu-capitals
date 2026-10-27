import { describe, expect, test } from "vitest"

import {
  keyboardBuildings,
  mergeBuildings,
  nearestBuildings,
  pulseBuilding,
  type StreetBuilding,
} from "@/lib/street-buildings"

// Central Södermalm; a thousandth of a degree is about 111 m north and 57 m east
const centre = [18.07, 59.31] as const

const building = (
  id: number,
  east: number,
  north: number,
  area = 500,
  score = 1
): StreetBuilding => ({
  id,
  score,
  longitude: centre[0] + east,
  latitude: centre[1] + north,
  area,
})

const ids = (buildings: Array<StreetBuilding>) => buildings.map(({ id }) => id)

describe("the buildings Tab goes through", () => {
  test("nearest the centre first, on the ground, not in degrees", () => {
    // 0.001° east is about 57 m, 0.0006° north about 67 m
    const buildings = [
      building(1, 0, 0.0006),
      building(2, 0.001, 0),
      building(3, 0, 0.0001),
    ]
    expect(ids(nearestBuildings(buildings, centre))).toEqual([3, 2, 1])
  })

  test("twelve at most", () => {
    const buildings = Array.from({ length: 30 }, (_, index) =>
      building(index + 1, index * 0.0001, 0)
    )
    const nearest = nearestBuildings(buildings, centre)
    expect(nearest).toHaveLength(keyboardBuildings)
    expect(ids(nearest)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  test("as near, by id, so the order never changes", () => {
    const buildings = [building(9, 0.001, 0), building(4, -0.001, 0)]
    expect(ids(nearestBuildings(buildings, centre))).toEqual([4, 9])
  })
})

describe("the building the guide's pulse sits on", () => {
  test("the nearest of at least 100 m², not a kiosk nearer", () => {
    const kiosk = building(1, 0.0001, 0, 30)
    const house = building(2, 0.001, 0, 400)
    expect(pulseBuilding([kiosk, house], centre)?.id).toBe(2)
    expect(pulseBuilding([kiosk, building(3, 0.002, 0, 100)], centre)?.id).toBe(
      3
    )
  })

  test("the nearest of all when none is that large", () => {
    const buildings = [building(1, 0.002, 0, 40), building(2, 0.001, 0, 60)]
    expect(pulseBuilding(buildings, centre)?.id).toBe(2)
  })

  test("none without buildings", () => {
    expect(pulseBuilding([], centre)).toBeUndefined()
  })
})

describe("the buildings of several tiles", () => {
  test("a building cut by tile edges is taken once, with its largest part", () => {
    const merged = mergeBuildings([
      [building(1, 0, 0, 120), building(2, 0.001, 0, 300)],
      [building(1, 0, 0, 380)],
    ])
    expect(merged.map(({ id, area }) => [id, area])).toEqual([
      [1, 380],
      [2, 300],
    ])
  })
})
