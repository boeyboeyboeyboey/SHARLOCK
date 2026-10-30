import { describe, expect, it } from 'vitest'
import { npcs } from '../scenes/wharf/npcs.js'
import { destinations, paths, spawn, walkable } from '../scenes/wharf/layout.js'
import { doorSpot } from '../scenes/shared/doors.js'
import { WALK_SPEED, createPatrol, holdsStill, stepPatrol } from '../scenes/wharf/patrol.js'

const wanderers = npcs.filter((n) => n.kind === 'wanderer')

const segmentDistance = (px, pz, a, b) => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

describe('wanderer routes', () => {
  it('gives every wanderer a route and a pause, and no game keeper one', () => {
    for (const n of npcs) expect(Boolean(n.route), n.id).toBe(n.kind === 'wanderer')
    for (const n of wanderers) {
      expect(n.route.length, n.id).toBeGreaterThanOrEqual(2)
      expect(n.route.length, n.id).toBeLessThanOrEqual(4)
      expect(n.pause, n.id).toBeGreaterThan(0)
      expect(n.route[0], n.id).toEqual([n.x, n.z])
    }
  })

  it.each(wanderers.map((n) => [n.id, n]))('%s walks only on walkable ground', (id, n) => {
    for (let i = 0; i < n.route.length; i += 1) {
      const a = n.route[i]
      const b = n.route[(i + 1) % n.route.length]
      expect(walkable(a[0], a[1])).toBe(true)
      for (let t = 0; t <= 1; t += 0.02)
        expect(walkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)).toBe(true)
    }
  })

  it.each(wanderers.map((n) => [n.id, n]))('%s keeps off doors, lanes and the spawn', (id, n) => {
    for (let i = 0; i < n.route.length; i += 1) {
      const a = n.route[i]
      const b = n.route[(i + 1) % n.route.length]
      for (const d of destinations) {
        const spot = doorSpot(d, d.reach)
        expect(segmentDistance(spot.x, spot.z, a, b)).toBeGreaterThan(2.3)
      }
      for (const lane of paths) {
        for (let j = 0; j < lane.length - 1; j += 1) {
          for (const p of [a, b])
            expect(segmentDistance(p[0], p[1], lane[j], lane[j + 1])).toBeGreaterThan(1)
        }
      }
      expect(segmentDistance(spawn.x, spawn.z, a, b)).toBeGreaterThan(3)
    }
  })
})

describe('stepPatrol', () => {
  const route = [
    [0, 0],
    [0, 4],
    [3, 4],
  ]

  it('walks at the set speed toward the next waypoint and faces it', () => {
    const s = createPatrol(route)
    stepPatrol(s, route, 2, 1)
    expect(s.z).toBeCloseTo(WALK_SPEED)
    expect(s.moving).toBe(true)
    expect(s.heading).toBeCloseTo(0)
  })

  it('pauses at each waypoint, then carries on and loops', () => {
    const s = createPatrol(route)
    for (let i = 0; i < 200 && s.next === 1; i += 1) stepPatrol(s, route, 2, 0.1)
    expect(s).toMatchObject({ x: 0, z: 4, next: 2, moving: false })
    stepPatrol(s, route, 2, 1.5)
    expect(s.wait).toBeCloseTo(0.5)
    expect(s.z).toBe(4)
    stepPatrol(s, route, 2, 0.5)
    stepPatrol(s, route, 2, 0.5)
    expect(s.x).toBeGreaterThan(0)
    expect(s.heading).toBeCloseTo(Math.PI / 2)
    for (let i = 0; i < 400; i += 1) stepPatrol(s, route, 2, 0.1)
    expect(s.next).toBeLessThan(3)
  })

  it('is deterministic for the same steps', () => {
    const a = createPatrol(route)
    const b = createPatrol(route)
    for (let i = 0; i < 300; i += 1) {
      stepPatrol(a, route, 1, 0.016)
      stepPatrol(b, route, 1, 0.016)
    }
    expect(a).toEqual(b)
  })
})

describe('holdsStill', () => {
  const base = { frozen: false, calm: false, dist: 10, range: 25, near: 1.5, talking: false }
  it('walks when nothing holds it', () => expect(holdsStill(base)).toBe(false))
  it('stops under the freeze flag', () => expect(holdsStill({ ...base, frozen: true })).toBe(true))
  it('stays at its post under reduced motion', () =>
    expect(holdsStill({ ...base, calm: true })).toBe(true))
  it('keeps walking until the player is within reach', () => {
    expect(holdsStill({ ...base, dist: 3.9 })).toBe(false)
    expect(holdsStill({ ...base, dist: 1.6 })).toBe(false)
  })
  it('stops when the player is within reach', () => expect(holdsStill({ ...base, dist: 1.4 })).toBe(true))
  it('stops while a talk is open', () => expect(holdsStill({ ...base, talking: true })).toBe(true))
  it('does not move outside the update range', () =>
    expect(holdsStill({ ...base, dist: 26 })).toBe(true))
})
