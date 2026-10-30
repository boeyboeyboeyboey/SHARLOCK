import { beforeEach, describe, expect, it, vi } from 'vitest'
import { finds } from '../scenes/wharf/finds.js'
import { floors, paths, pockets, walkable } from '../scenes/wharf/layout.js'
import { mapBounds } from '../minimap.js'
import {
  DISCOVERY_KEY,
  DISCOVERY_TOTAL,
  nearestFind,
  readFound,
  useDiscoveries,
  writeFound,
} from '../discoveries.js'

describe('discovery data', () => {
  it('has six unique finds, two npcs and four objects', () => {
    expect(finds).toHaveLength(6)
    expect(DISCOVERY_TOTAL).toBe(6)
    expect(new Set(finds.map((f) => f.id)).size).toBe(6)
    expect(finds.filter((f) => f.kind === 'npc')).toHaveLength(2)
    expect(finds.filter((f) => f.kind === 'object')).toHaveLength(4)
  })

  // npcs stand on walkable ground; objects sit on a prop, so the player must be able to stand within range
  it.each(finds.map((f) => [f.id, f]))('%s can be reached on foot', (id, f) => {
    if (f.kind === 'npc') {
      expect(walkable(f.x, f.z)).toBe(true)
      return
    }
    const ring = Array.from({ length: 8 }, (_, i) => [
      f.x + Math.cos((i * Math.PI) / 4) * 1.6,
      f.z + Math.sin((i * Math.PI) / 4) * 1.6,
    ])
    expect(ring.some(([x, z]) => walkable(x, z))).toBe(true)
  })

  it.each(finds.map((f) => [f.id, f]))('%s keeps short plain lines', (id, f) => {
    expect(f.lines.length).toBeGreaterThanOrEqual(1)
    expect(f.lines.length).toBeLessThanOrEqual(2)
    for (const line of f.lines) {
      expect(line.length).toBeLessThanOrEqual(140)
      expect(line).not.toMatch(/http|www\./i)
    }
    if (f.kind === 'npc') expect(f.style.fur).toBeTruthy()
  })

  it.each(finds.map((f) => [f.id, f]))('%s has a log note and a pocket hint', (id, f) => {
    expect(f.note.length).toBeGreaterThan(20)
    expect(['west lane', 'east yard', 'jetty']).toContain(f.pocket)
  })
})

describe('outskirt pockets', () => {
  it('are walkable and sit outside the minimap floors', () => {
    expect(pockets.length).toBeGreaterThanOrEqual(3)
    expect(walkable(-38, -20)).toBe(true)
    expect(walkable(50, -40)).toBe(true)
    expect(walkable(8, 63)).toBe(true)
    expect(walkable(-38, 20)).toBe(false)
    expect(walkable(50, -20)).toBe(false)
    for (const f of floors) expect(f.x0).toBeGreaterThanOrEqual(mapBounds.x0)
  })

  it('keep clear of the camera limit and join a lane', () => {
    for (const p of pockets) expect(p.z0).toBeGreaterThan(-82)
    for (const point of [
      [-38, -8],
      [56, -38],
      [8.8, 63],
    ]) {
      expect(walkable(point[0], point[1])).toBe(true)
      expect(paths.some((lane) => lane.some((q) => q[0] === point[0] && q[1] === point[1]))).toBe(
        true,
      )
    }
  })

  it('keep the new lane points walkable', () => {
    for (const lane of paths.slice(-3))
      for (const [x, z] of lane) expect(walkable(x, z), `${x},${z}`).toBe(true)
  })
})

describe('nearestFind', () => {
  it('picks the closest find in range and nothing out of range', () => {
    const note = finds.find((f) => f.id === 'sticky-note')
    expect(nearestFind({ x: note.x + 1, z: note.z })?.id).toBe('sticky-note')
    expect(nearestFind({ x: 0, z: 0 })).toBeNull()
    expect(nearestFind(null)).toBeNull()
    const list = [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 1, z: 0 },
    ]
    expect(nearestFind({ x: 0.8, z: 0 }, list, 2).id).toBe('b')
  })
})

describe('discovery store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads and writes found ids, dropping unknown and repeated ones', () => {
    expect(readFound()).toEqual([])
    writeFound(['handbill'])
    expect(JSON.parse(localStorage.getItem(DISCOVERY_KEY))).toEqual(['handbill'])
    localStorage.setItem(DISCOVERY_KEY, JSON.stringify(['handbill', 'handbill', 'nope', 7]))
    expect(readFound()).toEqual(['handbill'])
    localStorage.setItem(DISCOVERY_KEY, 'not json')
    expect(readFound()).toEqual([])
  })

  it('marks a find once, counts it and persists it', () => {
    const store = useDiscoveries()
    const before = store.count.value
    expect(store.mark('usb-stick')).toBe(true)
    expect(store.mark('usb-stick')).toBe(false)
    expect(store.mark('unknown')).toBe(false)
    expect(store.count.value).toBe(before + 1)
    expect(store.has('usb-stick')).toBe(true)
    expect(readFound()).toContain('usb-stick')
  })

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readFound()).toEqual([])
    expect(() => writeFound(['handbill'])).not.toThrow()
    expect(useDiscoveries().mark('tailgater')).toBe(true)
  })
})
