import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { connectDatabase } from '../../../src/config/database.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { auditEventModel } from '../../../src/modules/audit/model.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { createAuditService } from '../../../src/modules/audit/service.js'
import { userModel } from '../../../src/models/User.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

const baseTime = Date.now()

let database
let authOptions
let app
let currentTime
const userIds = new Set()
const requestIds = new Set()

async function createAccount(role = 'student') {
  const account = await registerTestStudent(app)
  userIds.add(account.user.id)
  if (role !== 'student') {
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(account.user.id) },
      { $set: { globalRoles: [role] } },
    )
  }
  return account
}

async function writeEvent(targetId, outcome = 'success', eventTime = currentTime) {
  currentTime = eventTime
  const requestId = randomUUID()
  requestIds.add(requestId)
  const service = createAuditService(database, { now: () => currentTime })
  await service.recordAuditEvent({
    eventType: 'admin.bootstrap',
    actorKind: 'operator',
    actorId: null,
    targetId,
    scopeCohortId: null,
    outcome,
    requestId,
  })
  currentTime = baseTime
}

beforeAll(async () => {
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test') throw new Error('Audit integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
  await initializeAuditStorage(database)
  currentTime = baseTime
  const now = () => currentTime
  authOptions = { ...authOptions, now }
})

beforeEach(() => {
  app = createTestApp(database, authOptions, { audit: { now: () => currentTime } })
})

afterAll(async () => {
  await disposeTestAuthApps()
  if (database?.readyState === 1) {
    const userObjectIds = [...userIds].map((id) => new Types.ObjectId(id))
    await Promise.all([
      userObjectIds.length
        ? userModel(database).deleteMany({ _id: { $in: userObjectIds } })
        : Promise.resolve(),
      userIds.size
        ? database.db
            .collection('auth_sessions')
            .deleteMany({ 'session.userId': { $in: [...userIds] } })
        : Promise.resolve(),
      requestIds.size
        ? auditEventModel(database).deleteMany({ requestId: { $in: [...requestIds] } })
        : Promise.resolve(),
    ])
    await database.close()
  }
})

describe('administrator audit event HTTP contract', () => {
  it('returns a safe 401 without a session and marks the response no-store', async () => {
    const response = await request(app).get('/api/admin/audit-events').expect(401)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
    expect(response.body.requestId).toBe(response.headers['x-request-id'])
  })

  it.each(['student', 'instructor'])('denies a currently authenticated %s actor', async (role) => {
    const account = await createAccount(role)
    const response = await account.agent.get('/api/admin/audit-events').expect(403)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.error.code).toBe('CAPABILITY_FORBIDDEN')
    expect(response.body.requestId).toBe(response.headers['x-request-id'])
  })

  it('adds current names for the administrator without storing them on the row', async () => {
    const admin = await createAccount('admin')
    const target = await createAccount()
    await writeEvent(target.user.id, 'success', baseTime - 500)
    const listed = await admin.agent
      .get('/api/admin/audit-events')
      .query({ page: '1', limit: '1' })
      .expect(200)
    expect(listed.body.events[0].targetName).toBe(target.user.username)
    const stored = await auditEventModel(database)
      .findOne({ requestId: listed.body.events[0].requestId })
      .lean()
    expect(JSON.stringify(stored)).not.toContain(target.user.username)
    await auditEventModel(database).deleteOne({ _id: stored._id })
  })

  it('filters, sorts, paginates and serializes only unexpired public event fields', async () => {
    const admin = await createAccount('admin')
    const older = await createAccount()
    const newer = await createAccount()
    const expired = await createAccount()
    await writeEvent(older.user.id, 'refused', baseTime - 2000)
    await writeEvent(newer.user.id, 'success', baseTime - 1000)
    await writeEvent(expired.user.id, 'failure', baseTime - 90 * 24 * 60 * 60 * 1000)
    const ownedUnexpiredEvents = {
      requestId: { $in: [...requestIds] },
      expiresAt: { $gt: new Date(baseTime) },
    }
    const beforeCount = await auditEventModel(database).countDocuments(ownedUnexpiredEvents)

    const firstPage = await admin.agent
      .get('/api/admin/audit-events')
      .query({ page: '1', limit: '1' })
      .expect(200)
    expect(firstPage.body).toMatchObject({ page: 1, total: 2 })
    expect(firstPage.body.events).toHaveLength(1)
    expect(firstPage.body.events[0]).toEqual({
      eventType: 'admin.bootstrap',
      actorKind: 'operator',
      actorId: null,
      targetId: newer.user.id,
      scopeCohortId: null,
      outcome: 'success',
      occurredAt: new Date(baseTime - 1000).toISOString(),
      requestId: expect.any(String),
      actorName: null,
      targetName: newer.user.username,
      cohortName: null,
    })
    expect(Object.keys(firstPage.body.events[0]).sort()).toEqual([
      'actorId',
      'actorKind',
      'actorName',
      'cohortName',
      'eventType',
      'occurredAt',
      'outcome',
      'requestId',
      'scopeCohortId',
      'targetId',
      'targetName',
    ])

    const secondPage = await admin.agent
      .get('/api/admin/audit-events')
      .query({ page: '2', limit: '1', eventType: 'admin.bootstrap' })
      .expect(200)
    expect(secondPage.body.events[0].targetId).toBe(older.user.id)
    expect(secondPage.body.total).toBe(2)

    const filtered = await admin.agent
      .get('/api/admin/audit-events')
      .query({
        from: new Date(baseTime - 1500).toISOString(),
        to: new Date(baseTime).toISOString(),
      })
      .expect(200)
    expect(filtered.body.events.map(({ targetId }) => targetId)).toEqual([newer.user.id])
    expect(await auditEventModel(database).countDocuments(ownedUnexpiredEvents)).toBe(beforeCount)
  })

  it('rejects repeated, object, operator, prototype and invalid date filters safely', async () => {
    const admin = await createAccount('admin')
    const invalidPaths = [
      '/api/admin/audit-events?page=1&page=2',
      '/api/admin/audit-events?page%5B%24gt%5D=0',
      '/api/admin/audit-events?%24where=true',
      '/api/admin/audit-events?__proto__=x',
      '/api/admin/audit-events?constructor=x',
      '/api/admin/audit-events?from=2026-02-30T00%3A00%3A00Z',
    ]
    for (const path of invalidPaths) {
      const response = await admin.agent.get(path).expect(400)
      expect(response.body.error).toEqual({
        code: 'AUDIT_INVALID_REQUEST',
        message: 'Check the request fields and try again.',
      })
      expect(response.text).not.toContain('__proto__')
      expect(response.text).not.toContain('$gt')
    }
  })

  it('rechecks role, account status, auth version and expiry on each request', async () => {
    const admin = await createAccount('admin')
    await admin.agent.get('/api/admin/audit-events').expect(200)
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(admin.user.id) },
      { $set: { globalRoles: ['student'] } },
    )
    await admin.agent.get('/api/admin/audit-events').expect(403)

    const disabled = await createAccount('admin')
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(disabled.user.id) },
      { $set: { accountStatus: 'disabled' } },
    )
    await disabled.agent.get('/api/admin/audit-events').expect(401)

    const versioned = await createAccount('admin')
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(versioned.user.id) },
      { $inc: { authVersion: 1 } },
    )
    await versioned.agent.get('/api/admin/audit-events').expect(401)

    const expired = await createAccount('admin')
    currentTime = baseTime + 30 * 60 * 1000
    await expired.agent.get('/api/admin/audit-events').expect(401)
    currentTime = baseTime
  })
})
