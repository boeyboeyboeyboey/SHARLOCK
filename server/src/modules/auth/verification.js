import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { AuthError, isAllowedObject } from './policy.js'

export const CODE_LENGTH = 6
export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 30 * 1000
export const MAX_SENDS_PER_WINDOW = 5
export const SEND_WINDOW_MS = 60 * 60 * 1000

const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`)

export const notPendingError = () =>
  new AuthError('VERIFICATION_NOT_PENDING', 'Sign in again to get a new verification code.', 409)
export const invalidCodeError = () =>
  new AuthError('VERIFICATION_CODE_INVALID', 'That code is not right. Check it and try again.', 400)
export const expiredCodeError = () =>
  new AuthError('VERIFICATION_CODE_EXPIRED', 'That code has expired. Request a new one.', 400)
export const attemptsExceededError = () =>
  new AuthError(
    'VERIFICATION_ATTEMPTS_EXCEEDED',
    'Too many wrong codes. Request a new code to try again.',
    400,
  )
export const resendLimitedError = (retryAfterMs) =>
  new AuthError(
    'RATE_LIMITED',
    'Please wait before requesting another code.',
    429,
    undefined,
    retryAfterMs,
  )

export function generateCode() {
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, '0')
}

export function hashCode(secret, userId, code) {
  return createHmac('sha256', secret).update(`${userId}\u0000${code}`).digest('hex')
}

export function hashesMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false
  const left = Buffer.from(expected, 'hex')
  const right = Buffer.from(actual, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

export function parseVerificationInput(body) {
  const fail = () =>
    new AuthError('VALIDATION_ERROR', 'Check the highlighted fields and try again.', 400, {
      code: `Enter the ${CODE_LENGTH}-digit code.`,
    })
  if (!isAllowedObject(body, ['code']) || !Object.hasOwn(body, 'code')) throw fail()
  if (typeof body.code !== 'string') throw fail()
  const code = body.code.replace(/\s/g, '')
  if (!CODE_PATTERN.test(code)) throw fail()
  return { code }
}

// the hourly send counter carries over while its window is open
export function nextVerificationState({ secret, userId, code, previous, currentTime }) {
  const windowOpen =
    previous?.sendWindowStartedAt &&
    currentTime - new Date(previous.sendWindowStartedAt).getTime() < SEND_WINDOW_MS
  return {
    codeHash: hashCode(secret, userId, code),
    expiresAt: new Date(currentTime + CODE_TTL_MS),
    attempts: 0,
    lastSentAt: new Date(currentTime),
    sendCount: (windowOpen ? previous.sendCount : 0) + 1,
    sendWindowStartedAt: windowOpen ? previous.sendWindowStartedAt : new Date(currentTime),
  }
}

// milliseconds until another send is allowed, or null when it is allowed now
export function resendBlock(state, currentTime) {
  if (!state) return null
  const sinceLast = currentTime - new Date(state.lastSentAt).getTime()
  if (sinceLast < RESEND_COOLDOWN_MS) return RESEND_COOLDOWN_MS - sinceLast
  const windowOpen = currentTime - new Date(state.sendWindowStartedAt).getTime() < SEND_WINDOW_MS
  if (windowOpen && state.sendCount >= MAX_SENDS_PER_WINDOW) {
    return new Date(state.sendWindowStartedAt).getTime() + SEND_WINDOW_MS - currentTime
  }
  return null
}

export function publicVerification(email, state, delivery, currentTime) {
  const resendAt = new Date(state.lastSentAt).getTime() + RESEND_COOLDOWN_MS
  return {
    email,
    delivery,
    expiresAt: new Date(state.expiresAt).toISOString(),
    resendAvailableAt: new Date(resendAt).toISOString(),
    // relative, so a device with a wrong clock still counts down correctly
    resendInSeconds: Math.max(0, Math.ceil((resendAt - currentTime) / 1000)),
  }
}
