import { describe, expect, it } from 'vitest'
import {
  parseComplete,
  parseNudge,
  parseMessage,
  parseStart,
} from '../../../src/modules/games/social-engineering-simulator/policy.js'

const SESSION = '11111111-1111-1111-1111-111111111111'

describe('social-engineering policy validators', () => {
  it('requires a context object and rejects unexpected fields', () => {
    const context = { kind: 'personal' }
    expect(parseStart({ context })).toEqual({ context })
    expect(() => parseStart({})).toThrow()
    expect(() => parseStart(undefined)).toThrow()
    expect(() => parseStart({ context: 'personal' })).toThrow()
    expect(() => parseStart({ context, persona: 'it-helpdesk' })).toThrow()
  })

  it('validates a message body', () => {
    expect(parseMessage({ sessionId: SESSION, content: 'hello' })).toEqual({
      sessionId: SESSION,
      content: 'hello',
    })
    expect(() => parseMessage({ sessionId: 'nope', content: 'hi' })).toThrow()
    expect(() => parseMessage({ sessionId: SESSION, content: '   ' })).toThrow()
    expect(() => parseMessage({ sessionId: SESSION, content: 'x'.repeat(1001) })).toThrow()
    expect(() => parseMessage({ sessionId: SESSION, content: 'hi', extra: 1 })).toThrow()
  })

  it('validates a completion decision against the allowed set', () => {
    expect(parseComplete({ sessionId: SESSION, decision: 'verify-independently' })).toEqual({
      sessionId: SESSION,
      decision: 'verify-independently',
    })
    expect(() => parseComplete({ sessionId: SESSION, decision: 'maybe' })).toThrow()
    expect(() => parseComplete({ sessionId: SESSION })).toThrow()
  })

  it('validates a nudge body', () => {
    expect(parseNudge({ sessionId: SESSION })).toEqual({ sessionId: SESSION })
    expect(() => parseNudge({ sessionId: SESSION, extra: 1 })).toThrow(/request/)
    expect(() => parseNudge({ sessionId: 'nope' })).toThrow()
    expect(() => parseNudge({})).toThrow()
    expect(() => parseNudge(null)).toThrow()
    expect(() => parseNudge('x')).toThrow()
    expect(() => parseNudge([])).toThrow()
    try {
      parseNudge({ sessionId: 'nope' })
    } catch (error) {
      expect(error.code).toBe('SOC_INVALID_BODY')
      expect(error.status).toBe(400)
    }
  })
})
