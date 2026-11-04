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
  patientZeroCount,
  pickSpawns,
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

  it('never lets an infected player start a sprint', () => {
    expect(rules.INFECTED_CAN_SPRINT).toBe(false)
    expect(canStartSprint(mover({ infected: false }), 0)).toBe(true)
    expect(canStartSprint(mover({ infected: true }), 0)).toBe(false)
    expect(canStartSprint(mover({ infected: true }), 1e9)).toBe(false)
  })

  it('runs a 120 s round with a 10 s grace and a 1.2 m tag reach', () => {
    expect(rules.ROUND_MS).toBe(120000)
    expect(rules.GRACE_MS).toBe(10000)
    expect(TAG_REACH).toBe(1.2)
  })

  it('moves infected players slower than survivors', () => {
    expect(rules.INFECTED_SPEED_MULT).toBe(0.8)
    // a step a survivor may take in a second is too far for an infected player
    const step = { x: 3 + BASE_SPEED * 1.1, z: 0 }
    const start = { x: 3, z: 0, lastMoveAt: 0, moveCredit: 0, sprintStartedAt: null }
    expect(validateMove({ ...start, infected: false }, step, 1000).ok).toBe(true)
    expect(validateMove({ ...start, infected: true }, step, 1000)).toMatchObject({
      ok: false,
      reason: 'too_fast',
    })
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

  it('keeps survivors as far from patient zero as the spawns allow', () => {
    const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
    const small = pickSpawns(ARENA.spawns, 3, 1)
    expect(small.zeros).toHaveLength(1)
    expect(small.others).toHaveLength(2)
    expect(small.nearest).toBe(22)
    // no other zero spawn does better
    for (const spawn of ARENA.spawns) {
      const rest = ARENA.spawns.filter((other) => other !== spawn).map((other) => gap(spawn, other))
      expect(rest.sort((a, b) => b - a)[1]).toBeLessThanOrEqual(small.nearest)
    }
    const full = pickSpawns(ARENA.spawns, 8, 2)
    expect(new Set([...full.zeros, ...full.others]).size).toBe(8)
  })

  it('has a reachable ceiling, worked out with the real scoring', () => {
    expect(rules.MAX_SCORE).toBe(670)
    expect(rules.MAX_SCORE).toBe(
      scoreFor(
        {
          survivalSeconds: rules.ROUND_MS / 1000,
          patches: rules.PAR_PATCHES,
          tags: rules.PAR_TAGS,
        },
        { sideWon: true },
      ),
    )
    // nobody can tag more than the other survivors of a full round
    expect(rules.PAR_TAGS).toBe(rules.MAX_PLAYERS - patientZeroCount(rules.MAX_PLAYERS) - 1)
  })
})

describe('validateMove over a burst', () => {
  // applies what round.move keeps between messages
  function flood(player, steps, gapMs, stepSize) {
    let travelled = 0
    let now = player.lastMoveAt
    for (let i = 0; i < steps; i += 1) {
      now += gapMs
      const verdict = validateMove(player, { x: player.x + stepSize, z: player.z }, now)
      if (!verdict.ok) continue
      travelled += stepSize
      Object.assign(player, { x: verdict.x, lastMoveAt: now, moveCredit: verdict.credit })
    }
    return travelled
  }

  it('gives no extra travel to a client that floods the 25 messages a second', () => {
    const travelled = flood(mover({ x: -21, z: -12 }), 25, 40, 0.86)
    expect(travelled).toBeLessThanOrEqual(BASE_SPEED * 1.25 + 0.5)
  })

  it('accepts every step of a real client at full speed', () => {
    const player = mover({ x: -21, z: -12 })
    expect(flood(player, 40, 50, (BASE_SPEED * 50) / 1000)).toBeCloseTo(
      (BASE_SPEED * 40 * 50) / 1000,
    )
  })

  it('accepts a sprint at full sprint speed, and only while it lasts', () => {
    const sprintStep = (BASE_SPEED * rules.SPRINT_MULT * 50) / 1000
    const player = mover({ x: -21, z: -12, sprintStartedAt: 0, moveCredit: 0 })
    expect(flood(player, 20, 50, sprintStep)).toBeCloseTo(sprintStep * 20)
    const late = mover({ x: -21, z: -12, lastMoveAt: 20000, sprintStartedAt: 0, moveCredit: 0 })
    const refused = flood(late, 30, 50, sprintStep)
    expect(refused).toBeLessThan(sprintStep * 30)
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
