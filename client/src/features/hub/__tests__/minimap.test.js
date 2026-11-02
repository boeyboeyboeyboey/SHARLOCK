import { describe, expect, it } from 'vitest'
import { destinations, floors, quayZ } from '../scenes/wharf/layout.js'
import {
  contextBlocks,
  footprint,
  mapBounds,
  mapSize,
  percentOf,
  pointsAttr,
  project,
  projectRect,
  shortLabel,
  wedgePoints,
} from '../minimap.js'

describe('minimap projection', () => {
  it('puts the north west corner at the origin and flips z', () => {
    expect(project(mapBounds.x0, mapBounds.z1)).toEqual({ x: 0, y: 0 })
    expect(project(mapBounds.x1, mapBounds.z0)).toEqual({ x: mapSize.width, y: mapSize.height })
    expect(project(0, 0)).toEqual({ x: 34, y: 80 })
  })

  it('keeps north above south and east right of west', () => {
    expect(project(0, 40).y).toBeLessThan(project(0, 10).y)
    expect(project(10, 0).x).toBeGreaterThan(project(-10, 0).x)
  })

  it('projects a rectangle from its north west corner', () => {
    expect(projectRect({ x0: -10, x1: 10, z0: -44, z1: 30 })).toEqual({
      x: 24,
      y: 50,
      width: 20,
      height: 74,
    })
  })

  it('gives percentages of the map box', () => {
    expect(percentOf(mapBounds.x0, mapBounds.z1)).toEqual({ left: 0, top: 0 })
    const mid = percentOf((mapBounds.x0 + mapBounds.x1) / 2, (mapBounds.z0 + mapBounds.z1) / 2)
    expect(mid.left).toBeCloseTo(50)
    expect(mid.top).toBeCloseTo(50)
  })

  it('keeps every destination, floor and the quay inside the view', () => {
    for (const d of destinations) {
      const fp = footprint(d)
      for (const [x, z] of [
        [d.x, d.z],
        [fp.cx, fp.cz],
      ]) {
        expect(x).toBeGreaterThan(mapBounds.x0)
        expect(x).toBeLessThan(mapBounds.x1)
        expect(z).toBeGreaterThan(mapBounds.z0)
        expect(z).toBeLessThan(mapBounds.z1)
      }
    }
    expect(quayZ).toBeLessThan(mapBounds.z1)
    for (const f of floors) expect(f.x0).toBeGreaterThanOrEqual(mapBounds.x0)
    for (const c of contextBlocks) expect(c.x0).toBeGreaterThanOrEqual(mapBounds.x0)
  })
})

describe('heading wedge', () => {
  const [apex, left, right] = wedgePoints(10, 20, 0, 7, 0.5)

  it('starts at the player and faces north at heading 0 (up the map)', () => {
    expect(apex).toEqual([10, 20])
    expect(left[1]).toBeLessThan(20)
    expect(right[1]).toBeLessThan(20)
    expect(left[0]).toBeLessThan(10)
    expect(right[0]).toBeGreaterThan(10)
  })

  it('turns clockwise as the heading grows: a quarter turn faces east', () => {
    const [, l, r] = wedgePoints(0, 0, Math.PI / 2, 7, 0.5)
    expect(l[0]).toBeGreaterThan(0)
    expect(r[0]).toBeGreaterThan(0)
    expect(l[1]).toBeLessThan(r[1])
  })

  it('faces south at a half turn and west at three quarters', () => {
    const [, s1, s2] = wedgePoints(0, 0, Math.PI)
    expect(s1[1]).toBeGreaterThan(0)
    expect(s2[1]).toBeGreaterThan(0)
    const [, w1, w2] = wedgePoints(0, 0, (3 * Math.PI) / 2)
    expect(w1[0]).toBeLessThan(0)
    expect(w2[0]).toBeLessThan(0)
  })

  it('keeps both outer corners the same distance from the player', () => {
    for (const heading of [0, 1, 2.5, -3, 7]) {
      const [a, l, r] = wedgePoints(3, 4, heading, 6, 0.4)
      expect(Math.hypot(l[0] - a[0], l[1] - a[1])).toBeCloseTo(6)
      expect(Math.hypot(r[0] - a[0], r[1] - a[1])).toBeCloseTo(6)
    }
  })

  it('formats points for an svg attribute', () => {
    expect(
      pointsAttr([
        [1, 2],
        [3.14159, 4],
      ]),
    ).toBe('1,2 3.14,4')
  })
})

describe('destination markers', () => {
  it('puts the building footprint behind the door, away from the street', () => {
    const west = footprint(destinations.find((d) => d.id === 'cli-cyber-defender'))
    expect(west.cx).toBeLessThan(-10)
    expect(west.x1).toBeLessThanOrEqual(-10)
    const east = footprint(destinations.find((d) => d.id === 'sql-injection-arcade'))
    expect(east.cx).toBeGreaterThan(10)
    const kiosk = footprint(destinations.find((d) => d.id === 'threat-briefing'))
    expect(kiosk.cz).toBeGreaterThan(54.4)
    expect(kiosk.x1 - kiosk.x0).toBeLessThan(5)
  })

  it('has a short label for every destination and a fallback', () => {
    for (const d of destinations) expect(shortLabel(d.id, d.title).length).toBeLessThanOrEqual(6)
    expect(shortLabel('new-game', 'Lock Picker')).toBe('Lock')
  })
})
