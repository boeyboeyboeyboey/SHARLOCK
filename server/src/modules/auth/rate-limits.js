import { createHmac } from 'node:crypto'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from './policy.js'

const FIFTEEN_MINUTES = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000
export const CSRF_BOOTSTRAP_LIMIT = 300
export const REGISTRATION_LIMIT = 30

function sendRateLimitError(request, response, message, retryAfter = 1) {
  response.set('Cache-Control', 'no-store')
  response.set('Retry-After', String(Math.max(1, Math.ceil(retryAfter / 1000))))
  response.status(429).json({
    error: { code: 'RATE_LIMITED', message },
    requestId: response.locals.requestId,
  })
}

function requestLimiter({ windowMs, limit, message, keyGenerator, skipSuccessfulRequests }) {
  const store = new MemoryStore()
  const middleware = rateLimit({
    windowMs,
    limit,
    store,
    ...(skipSuccessfulRequests ? { skipSuccessfulRequests } : {}),
    ...(keyGenerator ? { keyGenerator } : { ipv6Subnet: 56 }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(request, response) {
      const retryAfter = request.rateLimit?.resetTime
        ? request.rateLimit.resetTime.getTime() - Date.now()
        : 1000
      sendRateLimitError(request, response, message, retryAfter)
    },
  })
  return { middleware, store }
}

export function createRateLimits({ secret, now = Date.now } = {}) {
  if (typeof secret !== 'string' || !/^[a-fA-F0-9]{64,}$/.test(secret)) {
    throw new TypeError('A validated session secret is required for auth rate limits.')
  }

  const csrf = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: CSRF_BOOTSTRAP_LIMIT,
    message: 'Too many security checks. Please try again later.',
  })
  const registration = requestLimiter({
    windowMs: ONE_HOUR,
    limit: REGISTRATION_LIMIT,
    message: 'Too many account requests. Please try again later.',
  })
  const loginIp = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    // only failed sign-ins spend the per-ip budget, so a shared address can still sign in
    skipSuccessfulRequests: true,
    message: 'Too many sign-in attempts. Please try again later.',
  })
  const verification = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: 'Too many verification attempts. Please try again later.',
  })
  const activation = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: 'Too many activation attempts. Please try again later.',
  })
  const classInvitation = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: 'Too many class invitations. Please try again later.',
  })
  const recoveryIssueStaff = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: 'Too many recovery requests. Please try again later.',
    keyGenerator: (_request, response) => `staff:${response.locals.authUser.id}`,
  })
  const recoveryLookup = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: 'Too many student lookups. Please try again later.',
    keyGenerator: (_request, response) => `admin:${response.locals.authUser.id}`,
  })
  const passwordReset = requestLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: 'Too many password reset attempts. Please try again later.',
  })
  const recoveryStudents = new MemoryStore()
  recoveryStudents.init({ windowMs: 30 * 60 * 1000 })

  async function consumeStudentIssueLimit(targetId) {
    if (typeof targetId !== 'string' || !/^[a-f\d]{24}$/i.test(targetId)) {
      throw new TypeError('A validated recovery student id is required.')
    }
    const { totalHits, resetTime } = await recoveryStudents.increment(targetId.toLowerCase())
    if (totalHits > 3) {
      throw new AuthError(
        'RATE_LIMITED',
        'Too many recovery requests for this student. Please try again later.',
        429,
        undefined,
        Math.max(1, resetTime.getTime() - Date.now()),
      )
    }
  }

  const failedLogins = new Map()
  const cleanup = setInterval(() => {
    const currentTime = now()
    for (const [key, entry] of failedLogins) {
      if (entry.pending === 0 && entry.expiresAt <= currentTime) failedLogins.delete(key)
    }
  }, 60_000).unref()

  function keyFor(emailNormalized, ipAddress) {
    return createHmac('sha256', secret).update(`${ipAddress}\u0000${emailNormalized}`).digest('hex')
  }

  function reserveFailedLogin(emailNormalized, ipAddress) {
    const key = keyFor(emailNormalized, ipAddress)
    const currentTime = now()
    let entry = failedLogins.get(key)
    if (!entry || entry.expiresAt <= currentTime) {
      entry = { failures: 0, pending: 0, expiresAt: currentTime + FIFTEEN_MINUTES }
      failedLogins.set(key, entry)
    }

    if (entry.failures + entry.pending >= 5) {
      throw new AuthError(
        'RATE_LIMITED',
        'Too many sign-in attempts for these details. Please try again later.',
        429,
        undefined,
        Math.max(1, entry.expiresAt - currentTime),
      )
    }

    entry.pending += 1
    let settled = false
    function release(failed) {
      if (settled) return
      settled = true
      entry.pending = Math.max(0, entry.pending - 1)
      if (failed) {
        entry.failures += 1
        entry.expiresAt = now() + FIFTEEN_MINUTES
      } else if (entry.pending === 0 && entry.failures === 0) {
        failedLogins.delete(key)
      }
    }

    return Object.freeze({
      fail: () => release(true),
      succeed: () => release(false),
      release: () => release(false),
    })
  }

  return Object.freeze({
    csrf: csrf.middleware,
    registration: registration.middleware,
    loginIp: loginIp.middleware,
    verification: verification.middleware,
    activation: activation.middleware,
    classInvitation: classInvitation.middleware,
    recoveryIssueStaff: recoveryIssueStaff.middleware,
    recoveryLookup: recoveryLookup.middleware,
    passwordReset: passwordReset.middleware,
    consumeStudentIssueLimit,
    reserveFailedLogin,
    dispose() {
      clearInterval(cleanup)
      failedLogins.clear()
      csrf.store.shutdown()
      registration.store.shutdown()
      loginIp.store.shutdown()
      verification.store.shutdown()
      activation.store.shutdown()
      classInvitation.store.shutdown()
      recoveryIssueStaff.store.shutdown()
      recoveryLookup.store.shutdown()
      passwordReset.store.shutdown()
      recoveryStudents.shutdown()
    },
  })
}

export function rateLimitResponse(request, response, error) {
  const retryAfterMs = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 1000
  sendRateLimitError(request, response, error.message, retryAfterMs)
}
