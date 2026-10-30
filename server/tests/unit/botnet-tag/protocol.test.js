import { describe, expect, it } from 'vitest'
import {
  MAX_SUBMISSION_BYTES,
  RATE_LIMITS,
  allowMessage,
  parseClientMessage,
} from '../../../src/modules/games/botnet-tag/protocol.js'

const parse = (value) => parseClientMessage(JSON.stringify(value))

describe('botnet tag protocol parsing', () => {
  it('accepts well formed messages', () => {
    expect(parse({ type: 'ready', ready: true })).toEqual({ type: 'ready', ready: true })
    expect(parse({ type: 'move', x: 1, z: -2, yaw: 0.5 })).toEqual({
      type: 'move',
      x: 1,
      z: -2,
      yaw: 0.5,
    })
    expect(parse({ type: 'sprint' })).toEqual({ type: 'sprint' })
    expect(parse({ type: 'leave' })).toEqual({ type: 'leave' })
    expect(parse({ type: 'tag', target: 'abc' })).toEqual({ type: 'tag', target: 'abc' })
    expect(parse({ type: 'station', id: 'st-hash' })).toEqual({ type: 'station', id: 'st-hash' })
    expect(parse({ type: 'submit', submission: { index: 2 } })).toEqual({
      type: 'submit',
      submission: { index: 2 },
    })
    expect(parse({ type: 'join', cohortId: 'a'.repeat(24) })).toMatchObject({ type: 'join' })
  })

  it('wraps yaw and drops unknown fields', () => {
    const message = parse({ type: 'move', x: 0, z: 0, yaw: Math.PI * 3, extra: 1 })
    expect(message.yaw).toBeCloseTo(Math.PI)
    expect(message).not.toHaveProperty('extra')
  })

  it('rejects malformed, unknown and oversized input', () => {
    expect(parseClientMessage('{nope')).toBeNull()
    expect(parseClientMessage('[]')).toBeNull()
    expect(parse({ type: 'dance' })).toBeNull()
    expect(parse({ type: 'ready', ready: 'yes' })).toBeNull()
    expect(parse({ type: 'move', x: 'a', z: 0, yaw: 0 })).toBeNull()
    expect(parse({ type: 'move', x: 1e9, z: 0, yaw: 0 })).toBeNull()
    expect(parse({ type: 'tag', target: '' })).toBeNull()
    expect(parse({ type: 'tag', target: 'x'.repeat(33) })).toBeNull()
    expect(parse({ type: 'join', cohortId: 'nope' })).toBeNull()
    expect(parse({ type: 'submit', submission: [] })).toBeNull()
    expect(
      parse({ type: 'submit', submission: { text: 'x'.repeat(MAX_SUBMISSION_BYTES) } }),
    ).toBeNull()
  })
})

describe('botnet tag rate limits', () => {
  it('allows up to the limit per window then resets', () => {
    const counters = new Map()
    for (let i = 0; i < RATE_LIMITS.station; i += 1) {
      expect(allowMessage(counters, 'station', 1000)).toBe(true)
    }
    expect(allowMessage(counters, 'station', 1500)).toBe(false)
    expect(allowMessage(counters, 'station', 2000)).toBe(true)
    expect(allowMessage(counters, 'tag', 1500)).toBe(true)
  })
})
