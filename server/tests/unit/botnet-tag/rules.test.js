import { describe, expect, it } from 'vitest'
import { ARENA, walkable } from '../../../src/modules/games/botnet-tag/arena.js'
import * as rules from '../../../src/modules/games/botnet-tag/rules.js'

const {
  BASE_SPEED,
  IMMUNITY_MS,
  LATENCY_SLACK,
  SPRINT_COOLDOWN_MS,
  SPRINT_MS,
  TAG_REACH,
  canStartSprint,
  canTag,
  createRng,
  patientZeroCount,
  scoreFor,
  sprintActive,
  validateMove,
} = rules

const mover = (overrides = {}) => ({
  x: -8,
  z: 0,
  lastMoveAt: 0,
  sprintStartedAt: null,
  ...overrides,
})

describe('arena', () => {
  it('keeps spawns and stations walkable and walls solid', () => {
    for (const spawn of ARENA.spawns) expect(walkable(spawn.x, spawn.z)).toBe(true)
    for (const station of ARENA.stations) expect(walkable(station.x, station.z)).toBe(true)
    expect(ARENA.spawns).toHaveLength(8)
    expect(ARENA.stations.map((s) => s.kind).sort()).toEqual(
      ['account', 'firewall', 'hash', 'patch', 'process', 'spoof'].sort(),
    )
    expect(walkable(0, 0)).toBe(false)
    expect(walkable(-9, -7.5)).toBe(false)
    expect(walkable(-9, -5.8)).toBe(false)
    expect(walkable(-9, -5.5)).toBe(true)
    expect(walkable(21.8, 0)).toBe(false)
    expect(walkable(Number.NaN, 0)).toBe(false)
    expect(walkable('1', 0)).toBe(false)
  })
})

describe('movement validation', () => {
  it('accepts a legal step and rejects a teleport', () => {
    const ok = validateMove(mover(), { x: -7.4, z: 0 }, 100)
    expect(ok).toMatchObject({ ok: true, x: -7.4, z: 0 })
    const bad = validateMove(mover(), { x: 5, z: 0 }, 100)
    expect(bad).toMatchObject({ ok: false, reason: 'too_fast', x: -8, z: 0 })
  })

  it('rejects non-finite input and walls, keeping the last position', () => {
    expect(validateMove(mover(), { x: Number.NaN, z: 0 }, 100).ok).toBe(false)
    expect(validateMove(mover(), null, 100).ok).toBe(false)
    expect(validateMove(mover({ x: -4, z: 0 }), { x: -3, z: 0 }, 1000).ok).toBe(true)
    const wall = validateMove(mover({ x: 0, z: 3 }), { x: 0, z: 1 }, 1000)
    expect(wall).toMatchObject({ ok: false, reason: 'blocked', x: 0, z: 3 })
  })

  it('allows more distance only while sprinting', () => {
    const plain = BASE_SPEED * 1.25 + 0.5
    const far = { x: -20 + plain + 0.6, z: -12 }
    const start = { x: -20, z: -12 }
    expect(validateMove(mover(start), far, 1000).ok).toBe(false)
    expect(validateMove(mover({ ...start, sprintStartedAt: 0 }), far, 1000).ok).toBe(true)
    // sprint over: same distance is refused again
    const after = mover({ ...start, lastMoveAt: SPRINT_MS + 100, sprintStartedAt: 0 })
    expect(validateMove(after, far, SPRINT_MS + 1100).ok).toBe(false)
  })

  it('tracks the sprint window and cooldown', () => {
    const p = mover()
    expect(canStartSprint(p, 0)).toBe(true)
    p.sprintStartedAt = 1000
    expect(sprintActive(p, 1000 + SPRINT_MS - 1)).toBe(true)
    expect(sprintActive(p, 1000 + SPRINT_MS)).toBe(false)
    expect(canStartSprint(p, 1000 + SPRINT_MS + SPRINT_COOLDOWN_MS - 1)).toBe(false)
    expect(canStartSprint(p, 1000 + SPRINT_MS + SPRINT_COOLDOWN_MS)).toBe(true)
  })
})

describe('tagging and scoring', () => {
  const tagger = { infected: true, x: 0, z: 5, immuneUntil: 0 }
  const target = (overrides = {}) => ({
    infected: false,
    x: 0,
    z: 5 + TAG_REACH,
    immuneUntil: 0,
    ...overrides,
  })

  it('needs an infected tagger, a clean non-immune target and reach', () => {
    expect(canTag(tagger, target(), 0)).toBe(true)
    expect(canTag(tagger, target({ z: 5 + TAG_REACH + LATENCY_SLACK - 0.01 }), 0)).toBe(true)
    expect(canTag(tagger, target({ z: 5 + TAG_REACH + LATENCY_SLACK + 0.1 }), 0)).toBe(false)
    expect(canTag({ ...tagger, infected: false }, target(), 0)).toBe(false)
    expect(canTag(tagger, target({ infected: true }), 0)).toBe(false)
    expect(canTag(tagger, target({ immuneUntil: IMMUNITY_MS }), 100)).toBe(false)
    expect(canTag(tagger, target({ immuneUntil: 100 }), 100)).toBe(true)
    expect(canTag(null, target(), 0)).toBe(false)
  })

  it('scores survival, patches, tags and the winning side', () => {
    const player = { survivalSeconds: 61.9, patches: 2, tags: 1 }
    expect(scoreFor(player, { sideWon: false })).toBe(61 + 100 + 30)
    expect(scoreFor(player, { sideWon: true })).toBe(61 + 100 + 30 + 100)
  })

  it('adds a second patient zero from seven players', () => {
    expect([3, 6, 7, 8].map(patientZeroCount)).toEqual([1, 1, 2, 2])
  })

  it('seeds a repeatable rng', () => {
    const a = createRng(7)
    const b = createRng(7)
    const run = [a(), a(), a()]
    expect(run).toEqual([b(), b(), b()])
    expect(run.every((n) => n >= 0 && n < 1)).toBe(true)
  })
})

describe('validateMove path check', () => {
  it('rejects a step that passes through a wall even when both ends are walkable', () => {
    const wall = ARENA.walls.find((w) => {
      const z = (w.minZ + w.maxZ) / 2
      return walkable(w.minX - 0.6, z) && walkable(w.maxX + 0.6, z) && w.maxX - w.minX + 1.2 < 9
    })
    expect(wall).toBeDefined()
    const z = (wall.minZ + wall.maxZ) / 2
    const player = { x: wall.minX - 0.6, z, lastMoveAt: 0 }
    expect(rules.validateMove(player, { x: wall.maxX + 0.6, z }, 1000)).toMatchObject({
      ok: false,
      reason: 'blocked',
    })
  })
})
