import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import request from 'supertest'
import { Types } from 'mongoose'
import { createApp } from '../../../src/app.js'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { userModel } from '../../../src/models/User.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import { initializeAuthStorage } from '../../../src/modules/auth/storage.js'
import { AuthMongoStore } from '../../../src/modules/auth/session.js'
import { CSRF_BOOTSTRAP_LIMIT, REGISTRATION_LIMIT } from '../../../src/modules/auth/rate-limits.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import { createRecoveryService } from '../../../src/modules/recovery/service.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
  testMailer,
} from './helpers.js'

let database
let baseAuthOptions
let authOptions
let app
let currentTime
const recoveryUserIds = new Set()
const listeners = new Set()

const validRegistration = {
  email: 'student@example.test',
  username: 'Student_One',
  password: 'Correct-Horse-🔒-2026',
  avatarId: 'mint',
}

function cookieValue(response) {
  const cookie = response.headers['set-cookie']?.find((value) => value.startsWith('sharlock.sid='))
  if (!cookie) throw new Error('Expected the auth response to set its session cookie.')
  return cookie.split(';', 1)[0]
}

function sessionId(cookie) {
  const value = decodeURIComponent(cookie.slice('sharlock.sid='.length))
  return value.slice(2).split('.')[0]
}

// completes a pending registration the way a student does: read the logged code and confirm it
async function confirmEmail(agent, csrfToken, email) {
  return agent
    .post('/api/auth/verify-email')
    .set('Origin', baseAuthOptions.clientOrigin)
    .set('X-CSRF-Token', csrfToken)
    .send({ code: testMailer(app).lastCodeFor(email) })
    .expect(201)
}

// high-volume limiter tests share one listening server instead of one ephemeral server per request
async function listen() {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  listeners.add(server)
  return server
}

async function prepareLoginAgent(
  identifier = validRegistration.email,
  password = validRegistration.password,
  target = app,
) {
  const agent = request.agent(target)
  const csrf = await agent
    .get('/api/auth/csrf')
    .set('Origin', baseAuthOptions.clientOrigin)
    .expect(200)
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', baseAuthOptions.clientOrigin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ identifier, password })
  return {
    agent,
    bootstrapCookie: cookieValue(csrf),
    bootstrapToken: csrf.body.csrfToken,
    csrfToken: response.body.csrfToken,
    response,
  }
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Auth integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  baseAuthOptions = await initializeTestAuth(database, config)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
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
  authOptions = { ...baseAuthOptions, now: () => currentTime }
  app = createTestApp(database, authOptions)
})

afterEach(async () => {
  await Promise.all([...listeners].map((server) => new Promise((done) => server.close(done))))
  listeners.clear()
  if (!database || recoveryUserIds.size === 0) return
  const ids = [...recoveryUserIds]
  const objectIds = ids.map((id) => new Types.ObjectId(id))
  await Promise.all([
    database.db.collection('password_resets').deleteMany({ userId: { $in: objectIds } }),
    database.db.collection('auth_sessions').deleteMany({ 'session.userId': { $in: ids } }),
    database.db
      .collection('audit_events')
      .deleteMany({ $or: [{ actorId: { $in: objectIds } }, { targetId: { $in: objectIds } }] }),
    database.db.collection('users').deleteMany({ _id: { $in: objectIds } }),
  ])
  recoveryUserIds.clear()
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('account and Mongo session HTTP contract', () => {
  it('lets a fresh token sign out when the session cookie has lapsed', async () => {
    const stale = await request(app)
      .post('/api/auth/logout')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', 'stale-token')
      .send({})
      .expect(403)
    expect(stale.body.error.code).toBe('CSRF_INVALID')

    const agent = request.agent(app)
    const fresh = await agent
      .get('/api/auth/csrf')
      .set('Origin', baseAuthOptions.clientOrigin)
      .expect(200)
    await agent
      .post('/api/auth/logout')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', fresh.body.csrfToken)
      .send({})
      .expect(204)
  })

  it('applies the new registration policy while keeping legacy passwords login-compatible', async () => {
    const agent = request.agent(app)
    const csrf = await agent
      .get('/api/auth/csrf')
      .set('Origin', baseAuthOptions.clientOrigin)
      .expect(200)
    const invalidRegistrations = [
      { email: 'no-capital@example.test', username: 'No_Capital', password: 'alphabravo1!' },
      { email: 'no-symbol@example.test', username: 'No_Symbol', password: 'AlphaBravo12' },
      { email: 'short@example.test', username: 'Too_Short', password: 'AlphaBravo!' },
    ]

    for (const registration of invalidRegistrations) {
      const response = await agent
        .post('/api/auth/register')
        .set('Origin', baseAuthOptions.clientOrigin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
        .send({ ...registration, avatarId: 'mint' })
        .expect(400)
      expect(response.body.error.fieldErrors.password).toBeTruthy()
      expect(
        await database.db
          .collection('users')
          .countDocuments({ emailNormalized: registration.email }),
      ).toBe(0)
    }

    const registration = await agent
      .post('/api/auth/register')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({
        email: 'minimum-password@example.test',
        username: 'Min_Password',
        password: 'AlphaBravo1!',
        avatarId: 'mint',
      })
      .expect(202)
    const verified = await confirmEmail(
      agent,
      registration.body.csrfToken,
      'minimum-password@example.test',
    )
    expect(await agent.get('/api/auth/me').expect(200)).toMatchObject({
      body: { user: verified.body.user },
    })
    await agent
      .post('/api/auth/logout')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', verified.body.csrfToken)
      .send({})
      .expect(204)
    const login = await prepareLoginAgent('minimum-password@example.test', 'AlphaBravo1!')
    expect(login.response.status).toBe(200)
    expect(await login.agent.get('/api/auth/me').expect(200)).toMatchObject({
      body: { user: { id: verified.body.user.id } },
    })

    const legacyPassword = 'legacylowercasepassword'
    await userModel(database).create({
      emailNormalized: 'legacy-password@example.test',
      username: 'Legacy_User',
      usernameNormalized: 'legacy_user',
      avatarId: 'mint',
      passwordHash: await hashPassword(legacyPassword),
      globalRoles: ['student'],
      accountStatus: 'active',
      authVersion: 1,
      passwordChangedAt: new Date(currentTime),
    })
    const legacyLogin = await prepareLoginAgent('legacy-password@example.test', legacyPassword)
    expect(legacyLogin.response.status).toBe(200)
  })

  it('creates a student account, rotates the anonymous session and restores a safe user DTO', async () => {
    const agent = request.agent(app)
    const bootstrap = await agent
      .get('/api/auth/csrf')
      .set('Origin', baseAuthOptions.clientOrigin)
      .expect(200)
    const anonymousCookie = cookieValue(bootstrap)
    expect(bootstrap.body).toEqual({ csrfToken: expect.any(String) })
    expect(bootstrap.headers['cache-control']).toBe('no-store')
    expect(bootstrap.headers['set-cookie'][0]).toContain('HttpOnly')
    expect(bootstrap.headers['set-cookie'][0]).toContain('SameSite=Lax')
    expect(bootstrap.headers['set-cookie'][0]).toContain('Path=/api')
    expect(bootstrap.headers['set-cookie'][0]).not.toMatch(/Domain=|; Secure/i)

    const pending = await agent
      .post('/api/auth/register')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', bootstrap.body.csrfToken)
      .send(validRegistration)
      .expect(202)
    // no identity exists until the emailed code is confirmed
    expect(Object.keys(pending.body).sort()).toEqual(['csrfToken', 'verification'])
    expect(pending.body.verification).toMatchObject({
      email: 'student@example.test',
      delivery: 'sent',
    })
    expect(pending.text).not.toMatch(/passwordHash|codeHash|"code"/)
    await agent.get('/api/auth/me').expect(401)
    const registration = await confirmEmail(agent, pending.body.csrfToken, validRegistration.email)
    expect(Object.keys(registration.body).sort()).toEqual(['csrfToken', 'user'])
    expect(Object.keys(registration.body.user).sort()).toEqual(
      ['avatarId', 'email', 'globalRoles', 'howToPlayDismissed', 'id', 'username'].sort(),
    )
    expect(registration.body.user).toMatchObject({
      email: 'student@example.test',
      username: 'Student_One',
      avatarId: 'mint',
      globalRoles: ['student'],
    })
    expect(registration.text).not.toMatch(/passwordHash|authVersion|createdAt|absoluteExpiresAt/)

    const restored = await agent.get('/api/auth/me').expect(200)
    expect(restored.body).toEqual({ user: registration.body.user })
    expect(restored.headers['cache-control']).toBe('no-store')

    const currentCookie = cookieValue(restored)
    expect(sessionId(currentCookie)).not.toBe(sessionId(anonymousCookie))
    await request(app).get('/api/auth/me').set('Cookie', anonymousCookie).expect(401)

    const savedUser = await database.db
      .collection('users')
      .findOne({ emailNormalized: validRegistration.email })
    expect(savedUser.passwordHash).toMatch(/^\$argon2id\$/)
    expect(savedUser.globalRoles).toEqual(['student'])
    const savedSession = await database.db.collection('auth_sessions').findOne({
      _id: sessionId(currentCookie),
    })
    expect(savedSession.session).toMatchObject({
      userId: registration.body.user.id,
      authVersion: 1,
      createdAt: expect.any(Date),
      lastSeenAt: expect.any(Date),
      absoluteExpiresAt: expect.any(Date),
    })
  })

  it('uses the same generic response for unknown, wrong-password and disabled accounts', async () => {
    const student = await registerTestStudent(app)
    const wrongPassword = await prepareLoginAgent(student.email, 'Wrong-Password-Value-2026')
    const unknownAccount = await prepareLoginAgent(
      'unknown@example.test',
      'Wrong-Password-Value-2026',
    )
    await database.db
      .collection('users')
      .updateOne(
        { emailNormalized: student.email.toLowerCase() },
        { $set: { accountStatus: 'disabled' } },
      )
    const disabledAccount = await prepareLoginAgent(student.email, student.password)

    for (const result of [
      wrongPassword.response,
      unknownAccount.response,
      disabledAccount.response,
    ]) {
      expect(result.status).toBe(401)
      expect(result.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email, username or password is incorrect.',
      })
      expect(result.body.requestId).toBe(result.headers['x-request-id'])
    }
    expect(wrongPassword.response.body.error).toEqual(
      Object.fromEntries(
        Object.entries(unknownAccount.response.body.error).filter(([key]) => key !== 'requestId'),
      ),
    )
    expect(disabledAccount.response.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(
      JSON.stringify([
        wrongPassword.response.body,
        unknownAccount.response.body,
        disabledAccount.response.body,
      ]),
    ).not.toMatch(/passwordHash|private|stack/)
  })

  it('signs in with an email or a username, ignoring case', async () => {
    const student = await registerTestStudent(app, {
      email: 'mixed.case@example.test',
      username: 'Mixed_Case-7',
    })
    for (const identifier of [
      student.email,
      'Mixed.CASE@Example.test',
      'Mixed_Case-7',
      ' mixed_case-7 ',
      'MIXED_CASE-7',
    ]) {
      const login = await prepareLoginAgent(identifier, student.password)
      expect(login.response.status).toBe(200)
      expect(login.response.body.user.id).toBe(student.user.id)
    }
  })

  it('uses one generic failure for unknown usernames, wrong passwords and unknown emails', async () => {
    const student = await registerTestStudent(app)
    const results = [
      await prepareLoginAgent('unknown@example.test', student.password),
      await prepareLoginAgent('nobody_here', student.password),
      await prepareLoginAgent(student.user.username, 'Wrong-Password-Value-2026'),
    ]
    for (const { response } of results) {
      expect(response.status).toBe(401)
      expect(response.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email, username or password is incorrect.',
      })
    }
    const stripped = results.map(({ response }) =>
      Object.fromEntries(
        Object.entries(response.body.error).filter(([key]) => key !== 'requestId'),
      ),
    )
    expect(stripped[1]).toEqual(stripped[0])
    expect(stripped[2]).toEqual(stripped[0])
  })

  it('shares one failed-login budget between the email and username of an account', async () => {
    const student = await registerTestStudent(app)
    for (const identifier of [
      student.email,
      student.user.username,
      student.email,
      student.user.username,
      student.email,
    ]) {
      const failed = await prepareLoginAgent(identifier, 'Wrong-Password-Value-2026')
      expect(failed.response.status).toBe(401)
    }
    const blocked = await prepareLoginAgent(student.user.username, 'Wrong-Password-Value-2026')
    expect(blocked.response.status).toBe(429)
    expect(blocked.response.body.error.code).toBe('RATE_LIMITED')
  })

  it('enforces trusted Origin or Referer and requires the synchronizer token', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/auth/csrf').expect(200)
    const body = { ...validRegistration, email: 'referer@example.test', username: 'Referer_One' }

    await agent
      .post('/api/auth/register')
      .set('Origin', baseAuthOptions.clientOrigin)
      .send(body)
      .expect(403)
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send(body)
      .expect(403)
    await agent
      .post('/api/auth/register')
      .set('Origin', 'null')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send(body)
      .expect(403)
    await agent
      .post('/api/auth/register')
      .set('Origin', 'http://evil.example')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send(body)
      .expect(403)

    const refererOnlyAgent = request.agent(app)
    const refererOnly = await refererOnlyAgent.get('/api/auth/csrf').expect(200)
    await refererOnlyAgent
      .post('/api/auth/register')
      .set('Referer', `${baseAuthOptions.clientOrigin}/join`)
      .set('X-CSRF-Token', refererOnly.body.csrfToken)
      .send({ ...body, email: 'trusted-referer@example.test', username: 'Trusted_Ref' })
      .expect(202)
  })

  it('rejects unknown and prototype-named fields and handles duplicate creation races safely', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/auth/csrf').expect(200)
    const invalidBody =
      '{"email":"bad-fields@example.test","username":"Bad_Fields","password":"Correct-Horse-🔒-2026","avatarId":"mint","role":"admin","constructor":"x","__proto__":{"polluted":true}}'
    const invalid = await agent
      .post('/api/auth/register')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .set('Content-Type', 'application/json')
      .send(invalidBody)
      .expect(400)
    const errorBody = JSON.parse(invalid.text)
    expect(Object.hasOwn(errorBody.error.fieldErrors, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(errorBody.error.fieldErrors)).toBe(Object.prototype)
    expect({}.polluted).toBeUndefined()

    const agents = await Promise.all(
      [0, 1].map(async () => {
        const duplicateAgent = request.agent(app)
        const token = await duplicateAgent.get('/api/auth/csrf').expect(200)
        return { agent: duplicateAgent, token: token.body.csrfToken }
      }),
    )
    const results = await Promise.all(
      agents.map(({ agent: duplicateAgent, token }) =>
        duplicateAgent
          .post('/api/auth/register')
          .set('Origin', baseAuthOptions.clientOrigin)
          .set('X-CSRF-Token', token)
          .send({ ...validRegistration, email: 'race@example.test', username: 'Race_User' }),
      ),
    )
    expect(results.map(({ status }) => status).sort()).toEqual([202, 409])
    const conflict = results.find(({ status }) => status === 409)
    expect(conflict.body.error).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'An account could not be created with those details.',
    })
    expect(conflict.text).not.toMatch(/emailNormalized|usernameNormalized|index|duplicate key/)
  })

  it('limits CSRF bootstraps that create sessions but not token reuse on a live session', async () => {
    const server = await listen()
    const agent = request.agent(server)
    for (let index = 0; index <= CSRF_BOOTSTRAP_LIMIT; index += 1) {
      await agent.get('/api/auth/csrf').set('Origin', baseAuthOptions.clientOrigin).expect(200)
    }

    for (let index = 0; index < CSRF_BOOTSTRAP_LIMIT; index += 1) {
      await request(server).get('/api/auth/csrf').set('Origin', baseAuthOptions.clientOrigin)
    }
    const blocked = await request(server)
      .get('/api/auth/csrf')
      .set('Origin', baseAuthOptions.clientOrigin)
      .expect(429)
    expect(blocked.body.error.message).toBe('Too many security checks. Please try again later.')
    await agent.get('/api/auth/csrf').set('Origin', baseAuthOptions.clientOrigin).expect(200)
  }, 30_000)

  it('allows a class-sized group of registrations per IP before limiting', async () => {
    const server = await listen()
    const register = async (index) => {
      const agent = request.agent(server)
      const csrf = await agent
        .get('/api/auth/csrf')
        .set('Origin', baseAuthOptions.clientOrigin)
        .expect(200)
      return agent
        .post('/api/auth/register')
        .set('Origin', baseAuthOptions.clientOrigin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
        .send({
          ...validRegistration,
          email: `class-${index}@example.test`,
          username: `Class_${index}`,
        })
    }
    for (let index = 0; index < REGISTRATION_LIMIT; index += 1) {
      expect((await register(index)).status).toBe(202)
    }
    const blocked = await register(REGISTRATION_LIMIT)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.message).toBe('Too many account requests. Please try again later.')
  }, 30_000)

  it('does not spend the per-IP sign-in budget on successful sign-ins', async () => {
    const server = await listen()
    const student = await registerTestStudent(app)
    for (let index = 0; index < 31; index += 1) {
      const signedIn = await prepareLoginAgent(student.email, student.password, server)
      expect(signedIn.response.status).toBe(200)
    }
  }, 30_000)

  it('limits failed sign-ins per IP across different accounts', async () => {
    const server = await listen()
    for (let index = 0; index < 30; index += 1) {
      const failed = await prepareLoginAgent(
        `nobody-${index}@example.test`,
        'Wrong-Password-2026!',
        server,
      )
      expect(failed.response.status).toBe(401)
    }
    const blocked = await prepareLoginAgent(
      'nobody-30@example.test',
      'Wrong-Password-2026!',
      server,
    )
    expect(blocked.response.status).toBe(429)
    expect(blocked.response.body.error.message).toBe(
      'Too many sign-in attempts. Please try again later.',
    )
  }, 30_000)

  it('expires anonymous CSRF sessions after ten minutes', async () => {
    const agent = request.agent(app)
    const bootstrap = await agent
      .get('/api/auth/csrf')
      .set('Origin', baseAuthOptions.clientOrigin)
      .expect(200)
    currentTime += 10 * 60 * 1000 + 1

    const expired = await agent
      .post('/api/auth/register')
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', bootstrap.body.csrfToken)
      .send(validRegistration)
      .expect(403)
    expect(expired.body.error.code).toBe('CSRF_INVALID')
    expect(await database.db.collection('users').countDocuments({})).toBe(0)
  })

  it('uses per-request expiry and account version/status checks for restoration', async () => {
    const student = await registerTestStudent(app)
    const refreshed = await student.agent.get('/api/auth/me').expect(200)
    const cookie = cookieValue(refreshed)
    const start = currentTime

    currentTime = start + 30 * 60 * 1000 + 1
    const bootstrap = await student.agent.get('/api/auth/csrf').expect(200)
    expect(bootstrap.body).toEqual({ csrfToken: expect.any(String) })
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401)

    currentTime = start
    const absoluteStudent = await registerTestStudent(app, {
      email: 'absolute@example.test',
      username: 'Absolute_One',
    })
    const absoluteCookie = cookieValue(await absoluteStudent.agent.get('/api/auth/me').expect(200))
    for (let elapsed = 29 * 60 * 1000; elapsed < 8 * 60 * 60 * 1000; elapsed += 29 * 60 * 1000) {
      currentTime = start + elapsed
      await request(app).get('/api/auth/me').set('Cookie', absoluteCookie).expect(200)
    }
    currentTime = start + 8 * 60 * 60 * 1000
    await request(app).get('/api/auth/me').set('Cookie', absoluteCookie).expect(401)

    currentTime = start
    const disabledStudent = await registerTestStudent(app, {
      email: 'disabled@example.test',
      username: 'Disabled_One',
    })
    const disabledCookie = cookieValue(await disabledStudent.agent.get('/api/auth/me').expect(200))
    const disabledSecondSession = await prepareLoginAgent(
      disabledStudent.email,
      disabledStudent.password,
    )
    const disabledSecondCookie = cookieValue(
      await disabledSecondSession.agent.get('/api/auth/me').expect(200),
    )
    await database.db
      .collection('users')
      .updateOne(
        { emailNormalized: disabledStudent.email.toLowerCase() },
        { $set: { accountStatus: 'disabled' } },
      )
    await request(app).get('/api/auth/csrf').set('Cookie', disabledCookie).expect(401)
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', disabledSecondCookie)
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', disabledSecondSession.csrfToken)
      .send({})
      .expect(401)

    const versionStudent = await registerTestStudent(app, {
      email: 'version@example.test',
      username: 'Version_One',
    })
    const secondVersionSession = await prepareLoginAgent(
      versionStudent.email,
      versionStudent.password,
    )
    await database.db
      .collection('users')
      .updateOne(
        { emailNormalized: versionStudent.email.toLowerCase() },
        { $inc: { authVersion: 1 } },
      )
    await secondVersionSession.agent.get('/api/auth/csrf').expect(401)
    await versionStudent.agent.get('/api/auth/me').expect(401)
  })

  it('rotates login sessions, logs out only the current same-user session and prevents stale restore', async () => {
    const firstStudent = await registerTestStudent(app, {
      email: 'first@example.test',
      username: 'First_User',
    })
    const secondSession = await prepareLoginAgent(firstStudent.email, firstStudent.password)
    expect(secondSession.response.status).toBe(200)
    expect(secondSession.csrfToken).not.toBe(secondSession.bootstrapToken)
    await request(app).get('/api/auth/me').set('Cookie', secondSession.bootstrapCookie).expect(401)

    const current = await secondSession.agent.get('/api/auth/me').expect(200)
    const cookie = cookieValue(current)
    const logout = request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', baseAuthOptions.clientOrigin)
      .set('X-CSRF-Token', secondSession.csrfToken)
      .send({})
    const restore = request(app).get('/api/auth/me').set('Cookie', cookie)
    const [logoutResult, restoreResult] = await Promise.all([logout, restore])
    expect(logoutResult.status).toBe(204)
    expect([200, 401]).toContain(restoreResult.status)
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401)
    await firstStudent.agent.get('/api/auth/me').expect(200)
  })

  it('rejects missing auth settings and initializes existing storage safely', async () => {
    expect(() => createApp(database)).toThrow(/Auth settings are required/)
    await initializeAuthStorage(database)
    const indexes = await database.db.collection('auth_sessions').indexes()
    expect(indexes.some((index) => index.key.expires === 1 && index.expireAfterSeconds === 0)).toBe(
      true,
    )
  })
})

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')(
  'password reset session races',
  () => {
    it('rejects a login session that saves after recovery changes the password version', async () => {
      const target = await registerTestStudent(app, {
        email: 'recovery-login-race@example.test',
        username: 'Recovery_Login_Race',
      })
      const administrator = await registerTestStudent(app, {
        email: 'recovery-login-admin@example.test',
        username: 'Recovery_Login_Admin',
      })
      recoveryUserIds.add(target.user.id)
      recoveryUserIds.add(administrator.user.id)
      await userModel(database).updateOne(
        { _id: administrator.user.id },
        { $set: { globalRoles: ['admin'] } },
      )
      const issued = await createRecoveryService(database, {
        now: () => currentTime,
        clientOrigin: authOptions.clientOrigin,
      }).issueAdminStudentReset(
        { id: administrator.user.id, globalRoles: ['admin'] },
        target.user.id,
        { identityVerified: true },
      )
      const resetToken = new URLSearchParams(new URL(issued.resetUrl).hash.slice(1)).get('token')
      const loginAgent = request.agent(app)
      const csrf = await loginAgent
        .get('/api/auth/csrf')
        .set('Origin', baseAuthOptions.clientOrigin)
        .expect(200)
      const reachedVersionCheck = deferred()
      const releaseVersionCheck = deferred()
      const User = userModel(database)
      const originalFindById = User.findById.bind(User)
      let intercepted = false
      const findByIdSpy = vi.spyOn(User, 'findById').mockImplementation((...args) => {
        const query = originalFindById(...args)
        if (intercepted || args[0]?.toString() !== target.user.id) return query
        intercepted = true
        const execute = query.exec.bind(query)
        query.exec = async (...executeArgs) => {
          const currentUser = await execute(...executeArgs)
          reachedVersionCheck.resolve()
          await releaseVersionCheck.promise
          return currentUser
        }
        return query
      })
      const pendingLogin = loginAgent
        .post('/api/auth/login')
        .set('Origin', baseAuthOptions.clientOrigin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
        .send({ email: target.email, password: target.password })
        .then((response) => response)

      try {
        await reachedVersionCheck.promise
        await createRecoveryService(database, {
          now: () => currentTime,
          clientOrigin: authOptions.clientOrigin,
        }).resetStudentPassword({ token: resetToken, password: 'Recovery-Race-New-Password-2026!' })
      } finally {
        findByIdSpy.mockRestore()
        releaseVersionCheck.resolve()
      }

      const loginResponse = await pendingLogin
      expect(loginResponse.status).toBe(200)
      await loginAgent.get('/api/auth/me').expect(401)
    })

    it('does not recreate a deleted session when its delayed Mongo touch runs after redemption', async () => {
      const target = await registerTestStudent(app, {
        email: 'recovery-touch-race@example.test',
        username: 'Recovery_Touch_Race',
      })
      const administrator = await registerTestStudent(app, {
        email: 'recovery-touch-admin@example.test',
        username: 'Recovery_Touch_Admin',
      })
      recoveryUserIds.add(target.user.id)
      recoveryUserIds.add(administrator.user.id)
      await userModel(database).updateOne(
        { _id: administrator.user.id },
        { $set: { globalRoles: ['admin'] } },
      )
      const recovery = createRecoveryService(database, {
        now: () => currentTime,
        clientOrigin: authOptions.clientOrigin,
      })
      const issued = await recovery.issueAdminStudentReset(
        { id: administrator.user.id, globalRoles: ['admin'] },
        target.user.id,
        { identityVerified: true },
      )
      const token = new URLSearchParams(new URL(issued.resetUrl).hash.slice(1)).get('token')
      const syntheticSessionId = `recovery-touch-${target.user.id}`
      const sessionData = {
        userId: target.user.id,
        authVersion: 1,
        absoluteExpiresAt: new Date(currentTime + 60000),
      }
      await database.db.collection('auth_sessions').insertOne({
        _id: syntheticSessionId,
        session: sessionData,
        expires: new Date(currentTime + 60000),
      })
      const store = new AuthMongoStore(
        {},
        database.db.collection('auth_sessions'),
        () => currentTime,
      )
      await recovery.resetStudentPassword({ token, password: 'Recovery-Touch-New-Password-2026!' })
      expect(
        await database.db.collection('auth_sessions').countDocuments({ _id: syntheticSessionId }),
      ).toBe(0)
      await new Promise((resolve, reject) => {
        store.touch(syntheticSessionId, sessionData, (error) => (error ? reject(error) : resolve()))
      })
      expect(
        await database.db.collection('auth_sessions').countDocuments({ _id: syntheticSessionId }),
      ).toBe(0)
    })
  },
)

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
