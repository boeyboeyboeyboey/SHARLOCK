import { describe, expect, it } from 'vitest'
import {
  BOUNDS,
  MAX_PAYLOAD_BYTES,
  movesTooFast,
  normalizeYaw,
  parseClientMessage,
  roleFor,
} from '../../../src/modules/presence/protocol.js'
import { publicLook } from '../../../src/modules/presence/look.js'

const move = (overrides = {}) =>
  JSON.stringify({ type: 'move', x: 1, z: 2, yaw: 0.5, moving: true, ...overrides })

describe('presence message validation', () => {
  it('accepts a clean move', () => {
    expect(parseClientMessage(move())).toEqual({
      type: 'move',
      x: 1,
      z: 2,
      yaw: 0.5,
      moving: true,
    })
  })

  it('clamps positions to the wharf bounds and normalises yaw', () => {
    const parsed = parseClientMessage(move({ x: 9999, z: -9999, yaw: Math.PI * 5 }))
    expect(parsed.x).toBe(BOUNDS.maxX)
    expect(parsed.z).toBe(BOUNDS.minZ)
    expect(parsed.yaw).toBeGreaterThan(-Math.PI)
    expect(parsed.yaw).toBeLessThanOrEqual(Math.PI)
    expect(normalizeYaw(-Math.PI * 3)).toBeCloseTo(Math.PI)
  })

  it.each([
    ['invalid json', '{nope'],
    ['an array', '[1]'],
    ['an unknown type', JSON.stringify({ type: 'teleport' })],
    ['a string coordinate', move({ x: '1' })],
    ['a null yaw', move({ yaw: null })],
    ['a non-boolean moving flag', move({ moving: 1 })],
    ['a missing field', JSON.stringify({ type: 'move', x: 1, z: 1, yaw: 0 })],
    ['a bad cohort id', JSON.stringify({ type: 'join', cohortId: { $ne: 1 } })],
    ['a short cohort id', JSON.stringify({ type: 'join', cohortId: 'abc' })],
  ])('ignores %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull()
  })

  it('rejects non-finite numbers that json cannot carry', () => {
    expect(parseClientMessage('{"type":"move","x":1e999,"z":0,"yaw":0,"moving":false}')).toBeNull()
  })

  it('parses a join with a valid cohort id and reads buffers', () => {
    const cohortId = 'a'.repeat(24)
    expect(parseClientMessage(Buffer.from(JSON.stringify({ type: 'join', cohortId })))).toEqual({
      type: 'join',
      cohortId,
    })
  })

  it('keeps a valid move well under the payload cap', () => {
    expect(Buffer.byteLength(move({ x: -59.999, z: -89.999, yaw: -3.141 }))).toBeLessThan(
      MAX_PAYLOAD_BYTES,
    )
  })
})

describe('presence rate limit and roles', () => {
  it('allows 10 moves per second and drops faster ones', () => {
    expect(movesTooFast(null, 1000)).toBe(false)
    expect(movesTooFast(1000, 1099)).toBe(true)
    expect(movesTooFast(1000, 1100)).toBe(false)
  })

  it('labels instructors and admins as staff', () => {
    expect(roleFor(['student'])).toBe('student')
    expect(roleFor(['instructor'])).toBe('staff')
    expect(roleFor(['admin'])).toBe('staff')
  })
})

describe('public look', () => {
  it('returns only equipped item ids and defaults for older accounts', () => {
    expect(
      publicLook({ email: 'x@y.z', wardrobe: { hat: 'hat-flat-cap', scarf: 'nope' } }),
    ).toEqual({
      scarf: null,
      hat: 'hat-flat-cap',
      monocle: 'monocle-gold',
      accessory: 'accessory-none',
    })
  })
})
