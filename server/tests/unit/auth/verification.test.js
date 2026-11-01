import { describe, expect, it } from 'vitest'
import {
  CODE_TTL_MS,
  generateCode,
  hashCode,
  hashesMatch,
  MAX_SENDS_PER_WINDOW,
  nextVerificationState,
  parseVerificationInput,
  publicVerification,
  RESEND_COOLDOWN_MS,
  resendBlock,
  SEND_WINDOW_MS,
} from '../../../src/modules/auth/verification.js'

const secret = 'a'.repeat(64)
const userId = '65a000000000000000000001'

describe('verification codes', () => {
  it('generates six digits including leading zeros', () => {
    for (let index = 0; index < 200; index += 1) expect(generateCode()).toMatch(/^\d{6}$/)
  })

  it('hashes per account and compares in constant-time form', () => {
    const hash = hashCode(secret, userId, '123456')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashCode(secret, userId, '123456')).toBe(hash)
    expect(hashCode(secret, '65a000000000000000000002', '123456')).not.toBe(hash)
    expect(hashesMatch(hash, hashCode(secret, userId, '123456'))).toBe(true)
    expect(hashesMatch(hash, hashCode(secret, userId, '123457'))).toBe(false)
    expect(hashesMatch(hash, 'short')).toBe(false)
    expect(hashesMatch(undefined, hash)).toBe(false)
  })
})

describe('parseVerificationInput', () => {
  it('accepts exactly one six-digit code and ignores pasted spacing', () => {
    expect(parseVerificationInput({ code: '012345' })).toEqual({ code: '012345' })
    expect(parseVerificationInput({ code: '123 456' })).toEqual({ code: '123456' })
  })

  it.each([
    undefined,
    null,
    [],
    {},
    { code: 123456 },
    { code: '12345' },
    { code: '1234567' },
    { code: 'abcdef' },
    { code: '123456', extra: true },
    JSON.parse('{"code":"123456","__proto__":{"x":1}}'),
  ])('rejects %j', (body) => {
    expect(() => parseVerificationInput(body)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }),
    )
  })
})

describe('send state', () => {
  const start = Date.parse('2026-10-19T12:00:00Z')

  it('starts a fresh state with the expiry and zero attempts', () => {
    const state = nextVerificationState({ secret, userId, code: '111111', currentTime: start })
    expect(state.attempts).toBe(0)
    expect(state.sendCount).toBe(1)
    expect(state.expiresAt.getTime()).toBe(start + CODE_TTL_MS)
    expect(state.codeHash).toBe(hashCode(secret, userId, '111111'))
  })

  it('carries the hourly counter inside its window and resets it afterwards', () => {
    const first = nextVerificationState({ secret, userId, code: '111111', currentTime: start })
    const second = nextVerificationState({
      secret,
      userId,
      code: '222222',
      previous: first,
      currentTime: start + RESEND_COOLDOWN_MS,
    })
    expect(second.sendCount).toBe(2)
    expect(second.sendWindowStartedAt).toEqual(first.sendWindowStartedAt)

    const later = nextVerificationState({
      secret,
      userId,
      code: '333333',
      previous: second,
      currentTime: start + SEND_WINDOW_MS + 1,
    })
    expect(later.sendCount).toBe(1)
  })

  it('blocks resends during the cooldown and past the hourly cap', () => {
    const state = nextVerificationState({ secret, userId, code: '111111', currentTime: start })
    expect(resendBlock(state, start + 1000)).toBe(RESEND_COOLDOWN_MS - 1000)
    expect(resendBlock(state, start + RESEND_COOLDOWN_MS)).toBeNull()

    const capped = { ...state, sendCount: MAX_SENDS_PER_WINDOW }
    const blocked = resendBlock(capped, start + RESEND_COOLDOWN_MS)
    expect(blocked).toBe(SEND_WINDOW_MS - RESEND_COOLDOWN_MS)
    expect(resendBlock(capped, start + SEND_WINDOW_MS)).toBeNull()
  })

  it('exposes only the public fields', () => {
    const state = nextVerificationState({ secret, userId, code: '111111', currentTime: start })
    expect(publicVerification('a@example.test', state, 'sent', start + 10_000)).toEqual({
      email: 'a@example.test',
      delivery: 'sent',
      expiresAt: new Date(start + CODE_TTL_MS).toISOString(),
      resendAvailableAt: new Date(start + RESEND_COOLDOWN_MS).toISOString(),
      resendInSeconds: 20,
    })
    expect(
      publicVerification('a@example.test', state, 'sent', start + RESEND_COOLDOWN_MS + 1)
        .resendInSeconds,
    ).toBe(0)
  })
})
