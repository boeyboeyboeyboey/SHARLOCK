import { createHash } from 'node:crypto'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { userModel } from '../../../src/models/User.js'
import { createAdminService } from '../../../src/modules/admin/service.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import { createRecoveryService } from '../../../src/modules/recovery/service.js'
import { verifyPassword } from '../../../src/modules/auth/password.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

let database
let authOptions
let app
let admin
let fixture
const users = new Set()
const password = 'AlphaBravo1!'

function guard() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Activation tests require a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

function tokenFrom(url) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get('token')
}

async function newPublicAgent() {
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').expect(200)
  return { agent, csrfToken: csrf.body.csrfToken }
}

function postActivation(visitor, token, selectedPassword = password) {
  return visitor.agent
    .post('/api/auth/activate-account')
    .set('Origin', authOptions.clientOrigin)
    .set('X-CSRF-Token', visitor.csrfToken)
    .send({ token, password: selectedPassword })
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guard()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Activation tests require --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  guard()
  app = createTestApp(database, authOptions)
  admin = await registerTestStudent(app)
  users.add(admin.user.id)
  await userModel(database).updateOne({ _id: admin.user.id }, { $set: { globalRoles: ['admin'] } })
  fixture = await createAdminService(database, {
    clientOrigin: authOptions.clientOrigin,
  }).provisionInstructor(admin.user, {
    email: `activation-${admin.user.id}@example.test`,
    username: `teach-${admin.user.id.slice(-12)}`,
    avatarId: 'detective',
  })
  users.add(fixture.instructor.id)
})

afterEach(async () => {
  if (!database) return
  guard()
  const ids = [...users]
  const objectIds = ids.map((id) => new Types.ObjectId(id))
  await database.db.collection('password_resets').deleteMany({ userId: { $in: objectIds } })
  await database.db.collection('auth_sessions').deleteMany({ 'session.userId': { $in: ids } })
  await database.db
    .collection('audit_events')
    .deleteMany({ $or: [{ actorId: { $in: objectIds } }, { targetId: { $in: objectIds } }] })
  await database.db.collection('users').deleteMany({ _id: { $in: objectIds } })
  users.clear()
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')(
  'instructor activation transactions',
  () => {
    it('activates once under simultaneous requests, hashes the password, revokes sessions and requires normal login', async () => {
      const token = tokenFrom(fixture.activationUrl)
      const before = await userModel(database)
        .findById(fixture.instructor.id)
        .select('+passwordHash')
        .lean()
      const stored = await database.db.collection('password_resets').findOne({ userId: before._id })
      expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
      expect(JSON.stringify(stored)).not.toContain(token)
      await database.db.collection('auth_sessions').insertOne({
        _id: `activation-synthetic-${fixture.instructor.id}`,
        session: { userId: fixture.instructor.id },
        expires: new Date(Date.now() + 60000),
      })
      const visitors = await Promise.all([newPublicAgent(), newPublicAgent()])
      const results = await Promise.all(visitors.map((visitor) => postActivation(visitor, token)))
      expect(results.map(({ status }) => status).sort()).toEqual([204, 400])
      const after = await userModel(database)
        .findById(fixture.instructor.id)
        .select('+passwordHash')
        .lean()
      expect(after.accountStatus).toBe('active')
      expect(after.authVersion).toBe(before.authVersion + 1)
      expect(await verifyPassword(after.passwordHash, password)).toBe(true)
      expect(
        await database.db
          .collection('auth_sessions')
          .countDocuments({ 'session.userId': fixture.instructor.id }),
      ).toBe(0)
      expect(
        await database.db.collection('audit_events').countDocuments({
          eventType: 'account.instructor.activate',
          targetId: before._id,
        }),
      ).toBe(1)
      await visitors[0].agent.get('/api/auth/me').expect(401)
      const login = await newPublicAgent()
      await login.agent
        .post('/api/auth/login')
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', login.csrfToken)
        .send({ email: fixture.instructor.email, password })
        .expect(200)
      await postActivation(await newPublicAgent(), token).expect(400)
    })

    it('supersedes the old link and rejects expired links without changing the account', async () => {
      const reissued = await createAdminService(database, {
        clientOrigin: authOptions.clientOrigin,
      }).reissueActivation(admin.user, fixture.instructor.id, {})
      await postActivation(await newPublicAgent(), tokenFrom(fixture.activationUrl)).expect(400)
      const token = tokenFrom(reissued.activationUrl)
      await database.db
        .collection('password_resets')
        .updateOne(
          { tokenHash: createHash('sha256').update(token).digest('hex') },
          { $set: { expiresAt: new Date(Date.now() - 1) } },
        )
      await postActivation(await newPublicAgent(), token).expect(400)
      expect((await userModel(database).findById(fixture.instructor.id).lean()).accountStatus).toBe(
        'disabled',
      )
      expect(
        await database.db.collection('audit_events').countDocuments({
          eventType: 'account.instructor.activate',
          targetId: new Types.ObjectId(fixture.instructor.id),
        }),
      ).toBe(0)
    })

    it('fails closed when the target role or account version changes, including staff with student roles', async () => {
      const token = tokenFrom(fixture.activationUrl)
      const before = await userModel(database).findById(fixture.instructor.id).lean()
      for (const roles of [['admin'], ['instructor', 'student']]) {
        await userModel(database).updateOne({ _id: before._id }, { $set: { globalRoles: roles } })
        await postActivation(await newPublicAgent(), token).expect(400)
      }
      await userModel(database).updateOne(
        { _id: before._id },
        { $set: { globalRoles: ['instructor'] }, $inc: { authVersion: 1 } },
      )
      await postActivation(await newPublicAgent(), token).expect(400)
      const reset = await database.db
        .collection('password_resets')
        .findOne({ userId: before._id, revokedAt: null })
      expect(reset.consumedAt).toBe(null)
      expect((await userModel(database).findById(before._id).lean()).accountStatus).toBe('disabled')
    })

    it('reports the ended sessions only after activation commits', async () => {
      const sessionId = `activation-ended-${fixture.instructor.id}`
      await database.db.collection('auth_sessions').insertOne({
        _id: sessionId,
        session: { userId: fixture.instructor.id },
        expires: new Date(Date.now() + 60000),
      })
      const token = tokenFrom(fixture.activationUrl)
      const onSessionsEnded = vi.fn()
      const failing = createRecoveryService(database, {
        clientOrigin: authOptions.clientOrigin,
        onSessionsEnded,
        recordAuditEvent: async () => {
          throw new Error('synthetic audit failure')
        },
      })
      await expect(failing.activateAccount({ token, password })).rejects.toBeDefined()
      expect(onSessionsEnded).not.toHaveBeenCalled()

      const working = createRecoveryService(database, {
        clientOrigin: authOptions.clientOrigin,
        onSessionsEnded,
      })
      await working.activateAccount({ token, password })
      expect(onSessionsEnded).toHaveBeenCalledExactlyOnceWith([sessionId])
    })

    it('rolls back token consumption, password, account status and session deletion if auditing fails', async () => {
      const before = await userModel(database)
        .findById(fixture.instructor.id)
        .select('+passwordHash')
        .lean()
      const sessionId = `activation-rollback-${fixture.instructor.id}`
      await database.db.collection('auth_sessions').insertOne({
        _id: sessionId,
        session: { userId: fixture.instructor.id },
        expires: new Date(Date.now() + 60000),
      })
      const token = tokenFrom(fixture.activationUrl)
      const failing = createRecoveryService(database, {
        clientOrigin: authOptions.clientOrigin,
        recordAuditEvent: async () => {
          throw new Error('synthetic audit failure')
        },
      })
      await expect(failing.activateAccount({ token, password })).rejects.toMatchObject({
        code: 'ACTIVATION_FAILED',
        status: 503,
      })
      const after = await userModel(database).findById(before._id).select('+passwordHash').lean()
      expect(after.passwordHash).toBe(before.passwordHash)
      expect(after.authVersion).toBe(before.authVersion)
      expect(after.accountStatus).toBe('disabled')
      expect(await database.db.collection('auth_sessions').countDocuments({ _id: sessionId })).toBe(
        1,
      )
      expect(
        (await database.db.collection('password_resets').findOne({ userId: before._id }))
          .consumedAt,
      ).toBe(null)
      await postActivation(await newPublicAgent(), token).expect(204)
    })

    it('never consumes a link through GET, bad origin, missing CSRF or forged body fields', async () => {
      const token = tokenFrom(fixture.activationUrl)
      const visitor = await newPublicAgent()
      await visitor.agent.get('/api/auth/activate-account').expect(404)
      await visitor.agent
        .post('/api/auth/activate-account')
        .set('Origin', 'http://untrusted.test')
        .set('X-CSRF-Token', visitor.csrfToken)
        .send({ token, password })
        .expect(403)
      await visitor.agent
        .post('/api/auth/activate-account')
        .set('Origin', authOptions.clientOrigin)
        .send({ token, password })
        .expect(403)
      await visitor.agent
        .post('/api/auth/activate-account')
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', visitor.csrfToken)
        .send({ token, password, globalRoles: ['admin'] })
        .expect(400)
      expect((await userModel(database).findById(fixture.instructor.id).lean()).accountStatus).toBe(
        'disabled',
      )
      await postActivation(visitor, token).expect(204)
    })

    it('bounds activation guesses without logging token or password values', async () => {
      const visitor = await newPublicAgent()
      for (let index = 0; index < 10; index += 1) {
        const response = await postActivation(visitor, 'A'.repeat(43)).expect(400)
        expect(JSON.stringify(response.body)).not.toContain(password)
        expect(JSON.stringify(response.body)).not.toContain('A'.repeat(43))
      }
      await postActivation(visitor, tokenFrom(fixture.activationUrl)).expect(429)
      expect((await userModel(database).findById(fixture.instructor.id).lean()).accountStatus).toBe(
        'disabled',
      )
    })
  },
)
