import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
} from '../../../src/modules/auth/verification.js'
import { createTestApp, disposeTestAuthApps, initializeTestAuth, testMailer } from './helpers.js'

let database
let baseAuthOptions
let app
let currentTime

const registration = {
  email: 'pending@example.test',
  username: 'Pending_One',
  password: 'Correct-Horse-🔒-2026',
  avatarId: 'mint',
}

const origin = () => baseAuthOptions.clientOrigin
const lastCode = (email = registration.email) => testMailer(app).lastCodeFor(email)
const otherCode = (code) => (code === '000000' ? '000001' : '000000')

async function startRegistration(overrides = {}) {
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin()).expect(200)
  const response = await agent
    .post('/api/auth/register')
    .set('Origin', origin())
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ ...registration, ...overrides })
  return { agent, response, token: response.body.csrfToken }
}

const verify = (agent, token, code) =>
  agent
    .post('/api/auth/verify-email')
    .set('Origin', origin())
    .set('X-CSRF-Token', token)
    .send({ code })

const resend = (agent, token) =>
  agent.post('/api/auth/verify-email/resend').set('Origin', origin()).set('X-CSRF-Token', token)

function login(agent, token, email, password) {
  return agent
    .post('/api/auth/login')
    .set('Origin', origin())
    .set('X-CSRF-Token', token)
    .send({ email, password })
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Auth integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  baseAuthOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  if (!database?.name?.endsWith('_test')) {
    throw new Error('Refusing auth fixture cleanup outside a disposable _test database.')
  }
  await Promise.all([
    database.db.collection('users').deleteMany({}),
    database.db.collection('auth_sessions').deleteMany({}),
  ])
  currentTime = Date.now()
  app = createTestApp(database, { ...baseAuthOptions, now: () => currentTime })
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('email verification', () => {
  it('sends a six-digit code and stores only its hash', async () => {
    const { response } = await startRegistration()
    expect(response.status).toBe(202)
    expect(lastCode()).toMatch(/^\d{6}$/)

    const saved = await database.db
      .collection('users')
      .findOne({ emailNormalized: registration.email })
    expect(saved.emailVerification.codeHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(saved)).not.toContain(lastCode())
    expect(saved.emailVerification.expiresAt.getTime()).toBe(currentTime + CODE_TTL_MS)
    expect(saved.emailVerifiedAt).toBeNull()
  })

  it('refuses verification with no pending sign-up and validates the body', async () => {
    const anonymous = request.agent(app)
    const csrf = await anonymous.get('/api/auth/csrf').set('Origin', origin()).expect(200)
    const none = await verify(anonymous, csrf.body.csrfToken, '123456').expect(409)
    expect(none.body.error.code).toBe('VERIFICATION_NOT_PENDING')

    const { agent, token } = await startRegistration()
    for (const body of ['12345', 'abcdef', 1234567, null]) {
      const bad = await verify(agent, token, body).expect(400)
      expect(bad.body.error.code).toBe('VALIDATION_ERROR')
    }
    await agent
      .post('/api/auth/verify-email')
      .set('Origin', origin())
      .set('X-CSRF-Token', token)
      .send({ code: lastCode(), role: 'admin' })
      .expect(400)
  })

  it('locks the code after too many wrong guesses until a new one is requested', async () => {
    const { agent, token } = await startRegistration()
    const right = lastCode()

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const miss = await verify(agent, token, otherCode(right)).expect(400)
      expect(miss.body.error.code).toBe('VERIFICATION_CODE_INVALID')
    }
    const locked = await verify(agent, token, right).expect(400)
    expect(locked.body.error.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED')
    await agent.get('/api/auth/me').expect(401)

    currentTime += RESEND_COOLDOWN_MS + 1
    await resend(agent, token).expect(202)
    await verify(agent, token, lastCode()).expect(201)
    await agent.get('/api/auth/me').expect(200)
  })

  it('rejects an expired code and accepts a resent one', async () => {
    const { agent, token } = await startRegistration()
    const stale = lastCode()
    currentTime += CODE_TTL_MS + 1
    const expired = await verify(agent, token, stale).expect(400)
    expect(expired.body.error.code).toBe('VERIFICATION_CODE_EXPIRED')

    await resend(agent, token).expect(202)
    await verify(agent, token, lastCode()).expect(201)
  })

  it('enforces the resend cooldown and reports when to retry', async () => {
    const { agent, token } = await startRegistration()
    const tooSoon = await resend(agent, token).expect(429)
    expect(tooSoon.body.error.code).toBe('RATE_LIMITED')
    expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThanOrEqual(1)

    currentTime += RESEND_COOLDOWN_MS
    const ok = await resend(agent, token).expect(202)
    expect(ok.body.verification.delivery).toBe('sent')
    expect(testMailer(app).outbox).toHaveLength(2)
  })

  it('holds a correct-password sign-in of an unverified account in verification', async () => {
    await startRegistration()
    const agent = request.agent(app)
    const csrf = await agent.get('/api/auth/csrf').set('Origin', origin()).expect(200)

    const wrong = await login(
      agent,
      csrf.body.csrfToken,
      registration.email,
      'Wrong-Password-Value-2026',
    ).expect(401)
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')

    const held = await login(
      agent,
      csrf.body.csrfToken,
      registration.email,
      registration.password,
    ).expect(202)
    expect(held.body.user).toBeUndefined()
    expect(held.body.verification.email).toBe(registration.email)
    await agent.get('/api/auth/me').expect(401)

    await verify(agent, held.body.csrfToken, lastCode()).expect(201)
    await agent.get('/api/auth/me').expect(200)
  })

  it('does not let a later registration replace a live, unverified one', async () => {
    const first = await startRegistration()

    const intruder = await startRegistration({
      username: 'Intruder_One',
      password: 'Other-Horse-🔒-2026',
    })
    expect(intruder.response.status).toBe(409)
    expect(intruder.response.body.error.code).toBe('ACCOUNT_UNAVAILABLE')

    await verify(first.agent, first.token, lastCode()).expect(201)
  })

  it('lets a new registration reclaim an address whose code expired', async () => {
    await startRegistration()
    currentTime += CODE_TTL_MS + 1

    const next = await startRegistration({
      username: 'Reclaimed_One',
      password: 'Other-Horse-🔒-2026',
    })
    expect(next.response.status).toBe(202)
    expect(await database.db.collection('users').countDocuments({})).toBe(1)
    await verify(next.agent, next.token, lastCode()).expect(201)

    // only the replacement password works: the abandoned one was overwritten
    const agent = request.agent(app)
    const csrf = await agent.get('/api/auth/csrf').set('Origin', origin()).expect(200)
    const oldPassword = await login(
      agent,
      csrf.body.csrfToken,
      registration.email,
      registration.password,
    ).expect(401)
    expect(oldPassword.body.error.code).toBe('INVALID_CREDENTIALS')
    await login(agent, csrf.body.csrfToken, registration.email, 'Other-Horse-🔒-2026').expect(200)
  })

  it('does not let an old pending session finish a registration someone else replaced', async () => {
    const first = await startRegistration()
    currentTime += CODE_TTL_MS + 1
    const second = await startRegistration({
      username: 'Reclaimed_Two',
      password: 'Other-Horse-🔒-2026',
    })
    expect(second.response.status).toBe(202)

    const stolen = await verify(first.agent, first.token, lastCode())
    expect(stolen.status).toBe(409)
    expect(stolen.body.error.code).toBe('VERIFICATION_NOT_PENDING')
    const resent = await resend(first.agent, first.token)
    expect(resent.status).toBe(409)
    expect(resent.body.error.code).toBe('VERIFICATION_NOT_PENDING')
    await first.agent.get('/api/auth/me').expect(401)

    // the failed tries spent nothing: the real registrant still confirms normally
    await verify(second.agent, second.token, lastCode()).expect(201)
  })

  it('restores a pending sign-up after a refresh without sending anything', async () => {
    const { agent, response } = await startRegistration()
    currentTime += 10_000

    const probe = await agent.get('/api/auth/session').expect(200)
    expect(probe.body.user).toBeNull()
    expect(probe.body.verification).toEqual({
      email: registration.email,
      delivery: 'recent',
      expiresAt: response.body.verification.expiresAt,
      resendAvailableAt: response.body.verification.resendAvailableAt,
      resendInSeconds: 20,
    })
  })

  it('reports a failed send after a refresh instead of claiming a code went out', async () => {
    const { agent } = await startRegistration()
    await database.db
      .collection('users')
      .updateOne(
        { emailNormalized: registration.email },
        { $set: { 'emailVerification.lastSentAt': new Date(0) } },
      )
    const probe = await agent.get('/api/auth/session').expect(200)
    expect(probe.body.verification.delivery).toBe('failed')
    expect(probe.body.verification.resendInSeconds).toBe(0)
  })

  it('offers no pending state to a browser that never registered, or to one that cancelled', async () => {
    const stranger = await request(app).get('/api/auth/session').expect(200)
    expect(stranger.body).toEqual({ user: null })

    const { agent, token } = await startRegistration()
    await agent
      .post('/api/auth/logout')
      .set('Origin', origin())
      .set('X-CSRF-Token', token)
      .expect(204)
    const cancelled = await agent.get('/api/auth/session').expect(200)
    expect(cancelled.body).toEqual({ user: null })
  })

  it('stops offering the code screen once the replacement has taken the address', async () => {
    const first = await startRegistration()
    currentTime += CODE_TTL_MS + 1
    await startRegistration({ username: 'Reclaimed_Three', password: 'Other-Horse-🔒-2026' })
    const probe = await first.agent.get('/api/auth/session').expect(200)
    expect(probe.body).toEqual({ user: null })
  })

  it('treats accounts without a pending verification as verified', async () => {
    await database.db.collection('users').insertOne({
      emailNormalized: 'older@example.test',
      username: 'Older_User',
      usernameNormalized: 'older_user',
      avatarId: 'mint',
      passwordHash: await hashPassword('Older-Password-2026!'),
      globalRoles: ['student'],
      accountStatus: 'active',
      authVersion: 1,
      passwordChangedAt: new Date(currentTime),
    })

    const agent = request.agent(app)
    const csrf = await agent.get('/api/auth/csrf').set('Origin', origin()).expect(200)
    await login(agent, csrf.body.csrfToken, 'older@example.test', 'Older-Password-2026!').expect(
      200,
    )
  })
})
