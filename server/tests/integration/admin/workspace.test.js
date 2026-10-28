import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { userModel } from '../../../src/models/User.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import { createAdminService } from '../../../src/modules/admin/service.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

const password = 'Synthetic-Test-Password-2026'
const owned = { users: new Set(), institutions: new Set(), cohorts: new Set() }
let database
let authOptions
let fixtureHash
let app
let admin
let student
let origin

function guardTestDatabase() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Refusing admin workspace fixtures outside a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

async function registerAccount(role) {
  const account = await registerTestStudent(app)
  owned.users.add(account.user.id)
  if (role !== 'student') {
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(account.user.id) },
      { $set: { globalRoles: [role] } },
    )
  }
  return account
}

async function createActiveInstructor() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const instructor = await userModel(database).create({
    emailNormalized: `teacher-${suffix}@example.test`,
    username: `teacher-${suffix}`,
    usernameNormalized: `teacher-${suffix}`,
    avatarId: 'mint',
    passwordHash: fixtureHash,
    globalRoles: ['instructor'],
    accountStatus: 'active',
    authVersion: 1,
    instructorAssignmentRevision: 0,
    passwordChangedAt: new Date(),
  })
  owned.users.add(instructor._id.toString())
  return instructor
}

async function createInstitutionAndCohort(agent, csrfToken) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institutionResponse = await agent
    .post('/api/admin/institutions')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send({ name: `Synthetic Campus ${suffix}`, slug: `synthetic-${suffix}` })
    .expect(201)
  const institution = institutionResponse.body
  owned.institutions.add(institution.id)
  const cohortResponse = await agent
    .post('/api/admin/cohorts')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send({ institutionId: institution.id, name: `WAD2 ${suffix}`, term: '2026 T2' })
    .expect(201)
  owned.cohorts.add(cohortResponse.body.id)
  return { institution, cohort: cohortResponse.body }
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test') throw new Error('Admin integration requires NODE_ENV=test.')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guardTestDatabase()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Run admin workspace integration with --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
  authOptions = await initializeTestAuth(database, config)
  fixtureHash = await hashPassword(password)
})

beforeEach(async () => {
  guardTestDatabase()
  owned.users.clear()
  owned.institutions.clear()
  owned.cohorts.clear()
  app = createTestApp(database, authOptions, { audit: { now: Date.now }, admin: { now: Date.now } })
  origin = authOptions.clientOrigin
  admin = await registerAccount('admin')
  student = await registerAccount('student')
})

afterEach(async () => {
  if (!database) return
  guardTestDatabase()
  const users = [...owned.users].map((id) => new Types.ObjectId(id))
  const institutions = [...owned.institutions].map((id) => new Types.ObjectId(id))
  const cohorts = [...owned.cohorts].map((id) => new Types.ObjectId(id))
  await database.db.collection('instructor_assignments').deleteMany({ userId: { $in: users } })
  await database.db.collection('password_resets').deleteMany({ userId: { $in: users } })
  await database.db.collection('audit_events').deleteMany({
    $or: [{ actorId: { $in: users } }, { targetId: { $in: users } }],
  })
  await database.db
    .collection('auth_sessions')
    .deleteMany({ 'session.userId': { $in: [...owned.users] } })
  await database.db.collection('cohorts').deleteMany({ _id: { $in: cohorts } })
  await database.db.collection('institutions').deleteMany({ _id: { $in: institutions } })
  await database.db.collection('users').deleteMany({ _id: { $in: users } })
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')('admin workspace API', () => {
  it('creates and lists active institutions and cohorts, and rejects inactive or missing parents', async () => {
    const { institution, cohort } = await createInstitutionAndCohort(admin.agent, admin.csrfToken)
    expect(institution).toMatchObject({
      name: expect.stringContaining('Synthetic Campus'),
      status: 'active',
    })
    expect(cohort).toMatchObject({
      institutionId: institution.id,
      institutionName: institution.name,
      status: 'active',
    })

    const listed = await admin.agent.get('/api/admin/cohorts').set('Origin', origin).expect(200)
    expect(listed.body).toMatchObject({ page: 1, total: 1 })
    expect(listed.body.cohorts).toHaveLength(1)
    await admin.agent
      .post('/api/admin/cohorts')
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        institutionId: new Types.ObjectId().toString(),
        name: 'Missing parent',
        term: '2026 T2',
      })
      .expect(404)
    await admin.agent
      .post('/api/admin/institutions')
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: institution.name, slug: institution.slug })
      .expect(409)
  })

  it('provisions a separate disabled instructor and reissues a private activation link', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
    const response = await admin.agent
      .post('/api/admin/instructors')
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        email: `provision-${suffix}@example.test`,
        username: `teach-${suffix}`,
        avatarId: 'mint',
      })
      .expect(201)
    owned.users.add(response.body.instructor.id)
    expect(response.body.instructor).toMatchObject({ accountStatus: 'disabled', cohortIds: [] })
    expect(response.body).toHaveProperty('activationUrl')
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|authVersion|tokenHash/)

    const tokenRecord = await database.db.collection('password_resets').findOne({
      userId: new Types.ObjectId(response.body.instructor.id),
      purpose: 'activation',
    })
    expect(tokenRecord).toMatchObject({ consumedAt: null, revokedAt: null })
    expect(tokenRecord.tokenHash).not.toContain(response.body.activationUrl.split('/').pop())
    const reissued = await admin.agent
      .post(`/api/admin/instructors/${response.body.instructor.id}/activation`)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(200)
    expect(reissued.body.activationUrl).not.toBe(response.body.activationUrl)
    await admin.agent
      .post(`/api/admin/instructors/${response.body.instructor.id}/activation`)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ token: 'unexpected' })
      .expect(400)
  })

  it('provisions an administrator through a one-time link, never promotes an existing account and keeps instructor flow intact', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
    const body = {
      email: `newadmin-${suffix}@example.test`,
      username: `newadmin-${suffix}`,
      avatarId: 'mint',
    }
    const post = (agent, csrfToken, payload = body, headers = {}) =>
      agent
        .post('/api/admin/administrators')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrfToken)
        .set(headers)
        .send(payload)

    await request(app).post('/api/admin/administrators').send(body).expect(401)
    await post(student.agent, student.csrfToken).expect(403)
    await admin.agent.post('/api/admin/administrators').set('Origin', origin).send(body).expect(403)
    await post(admin.agent, admin.csrfToken, body, { Origin: 'https://evil.example.test' }).expect(
      403,
    )
    await post(admin.agent, admin.csrfToken, { ...body, globalRoles: ['admin'] }).expect(400)

    const created = await post(admin.agent, admin.csrfToken).expect(201)
    owned.users.add(created.body.administrator.id)
    expect(created.body.administrator).toMatchObject({ accountStatus: 'disabled' })
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|authVersion|tokenHash/)
    const stored = await userModel(database).findById(created.body.administrator.id).lean()
    expect(stored.globalRoles).toEqual(['admin'])

    // existing accounts are never promoted
    await post(admin.agent, admin.csrfToken).expect(409)
    const studentRow = await userModel(database).findById(student.user.id).lean()
    await post(admin.agent, admin.csrfToken, {
      ...body,
      email: studentRow.emailNormalized,
      username: `other-${suffix}`,
    }).expect(409)
    expect((await userModel(database).findById(student.user.id).lean()).globalRoles).toEqual([
      'student',
    ])

    // the link finishes only the stored role and then allows normal sign-in
    const token = new URLSearchParams(new URL(created.body.activationUrl).hash.slice(1)).get(
      'token',
    )
    const visitor = request.agent(app)
    const csrf = await visitor.get('/api/auth/csrf').expect(200)
    await visitor
      .post('/api/auth/activate-account')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ token, password })
      .expect(204)
    const login = request.agent(app)
    const loginCsrf = await login.get('/api/auth/csrf').expect(200)
    await login
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', loginCsrf.body.csrfToken)
      .send({ email: body.email, password })
      .expect(200)
    await login.get('/api/admin/institutions').set('Origin', origin).expect(200)

    const events = await database.db
      .collection('audit_events')
      .find({ targetId: new Types.ObjectId(created.body.administrator.id) })
      .project({ eventType: 1, actorId: 1 })
      .toArray()
    expect(events.map(({ eventType }) => eventType).sort()).toEqual([
      'account.administrator.activate',
      'admin.administrator.activation.issue',
      'admin.administrator.provision',
    ])

    // pending administrators are not reachable through the instructor reissue route
    await admin.agent
      .post(`/api/admin/instructors/${created.body.administrator.id}/activation`)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(404)
  })

  describe('pending administrators', () => {
    const tokenOf = (url) => new URLSearchParams(new URL(url).hash.slice(1)).get('token')

    async function provisionPending() {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
      const created = await admin.agent
        .post('/api/admin/administrators')
        .set('Origin', origin)
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          email: `pending-${suffix}@example.test`,
          username: `pending-${suffix}`,
          avatarId: 'mint',
        })
        .expect(201)
      owned.users.add(created.body.administrator.id)
      return created.body
    }

    const act = (who, id, action, headers = {}) =>
      who.agent
        .post(`/api/admin/administrators/${id}/${action}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', who.csrfToken)
        .set(headers)
        .send({})

    async function activate(token) {
      const visitor = request.agent(app)
      const csrf = await visitor.get('/api/auth/csrf').expect(200)
      return visitor
        .post('/api/auth/activate-account')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
        .send({ token, password })
    }

    const listPending = () =>
      admin.agent.get('/api/admin/administrators/pending').set('Origin', origin)

    it('lists only never-activated administrators with safe fields', async () => {
      await createActiveInstructor()
      const pending = await provisionPending()
      const listed = await listPending().expect(200)
      expect(listed.body.administrators).toEqual([
        {
          id: pending.administrator.id,
          username: pending.administrator.username,
          email: pending.administrator.email,
          provisionedAt: expect.any(String),
          linkExpiresAt: pending.expiresAt,
          linkStatus: 'pending',
        },
      ])
      expect(listed.body).toMatchObject({ page: 1, total: 1 })
      await admin.agent
        .get('/api/admin/administrators/pending?role=admin')
        .set('Origin', origin)
        .expect(400)
    })

    it('reissues a link that replaces the old one, then drops out after activation', async () => {
      const pending = await provisionPending()
      const id = pending.administrator.id
      const reissued = await act(admin, id, 'activation').expect(200)
      expect(Object.keys(reissued.body).sort()).toEqual(['activationUrl', 'expiresAt'])
      await activate(tokenOf(pending.activationUrl)).then((res) =>
        expect(res.status).toBeGreaterThanOrEqual(400),
      )
      await activate(tokenOf(reissued.body.activationUrl)).then((res) =>
        expect(res.status).toBe(204),
      )
      expect((await listPending().expect(200)).body.administrators).toEqual([])
      await act(admin, id, 'activation').expect(404)
      await act(admin, id, 'delete').expect(404)
      expect(await userModel(database).exists({ _id: id })).toBeTruthy()
    })

    it('cancels a pending administrator, its tokens and its link, with an audit event', async () => {
      const pending = await provisionPending()
      const id = pending.administrator.id
      await act(admin, id, 'delete').expect(200, { outcome: 'cancelled' })
      expect(await userModel(database).exists({ _id: id })).toBeNull()
      expect(
        await database.db
          .collection('password_resets')
          .countDocuments({ userId: new Types.ObjectId(id) }),
      ).toBe(0)
      const events = await database.db
        .collection('audit_events')
        .find({ eventType: 'admin.administrator.cancel', targetId: new Types.ObjectId(id) })
        .toArray()
      expect(events).toHaveLength(1)
      expect(events[0].actorId.toString()).toBe(admin.user.id)
      await activate(tokenOf(pending.activationUrl)).then((res) =>
        expect(res.status).toBeGreaterThanOrEqual(400),
      )
      await act(admin, id, 'delete').expect(404)
    })

    it('rejects non-admins and missing CSRF tokens', async () => {
      const pending = await provisionPending()
      const id = pending.administrator.id
      for (const who of [student]) {
        await who.agent.get('/api/admin/administrators/pending').set('Origin', origin).expect(403)
        await act(who, id, 'activation').expect(403)
        await act(who, id, 'delete').expect(403)
      }
      const instructor = await registerAccount('instructor')
      await instructor.agent
        .get('/api/admin/administrators/pending')
        .set('Origin', origin)
        .expect(403)
      await act(instructor, id, 'activation').expect(403)
      await act(instructor, id, 'delete').expect(403)
      await admin.agent
        .post(`/api/admin/administrators/${id}/delete`)
        .set('Origin', origin)
        .send({})
        .expect(403)
      expect(await userModel(database).exists({ _id: id })).toBeTruthy()
    })
  })

  it('replaces active instructor assignments with revision checks and hides admin APIs from students', async () => {
    const { cohort } = await createInstitutionAndCohort(admin.agent, admin.csrfToken)
    const secondCohortResponse = await admin.agent
      .post('/api/admin/cohorts')
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        institutionId: cohort.institutionId,
        name: 'Concurrent assignment target',
        term: '2026 T2',
      })
      .expect(201)
    owned.cohorts.add(secondCohortResponse.body.id)
    const instructor = await createActiveInstructor()
    const route = `/api/admin/instructors/${instructor._id}/assignments`
    const competing = await Promise.all([
      admin.agent
        .put(route)
        .set('Origin', origin)
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ cohortIds: [cohort.id], expectedRevision: 0 }),
      admin.agent
        .put(route)
        .set('Origin', origin)
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ cohortIds: [secondCohortResponse.body.id], expectedRevision: 0 }),
    ])
    expect(competing.map((result) => result.status).sort()).toEqual([200, 409])
    const winningCohortIds = competing.find((result) => result.status === 200).body.instructor
      .cohortIds
    const activePairs = await instructorAssignmentModel(database)
      .find({ userId: instructor._id, status: 'active' })
      .select('cohortId')
      .lean()
    expect(activePairs.map(({ cohortId }) => cohortId.toString())).toEqual(winningCohortIds)
    await admin.agent
      .put(route)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ cohortIds: [], expectedRevision: 0 })
      .expect(409)

    await request(app).get('/api/admin/institutions').expect(401)
    await student.agent.get('/api/admin/institutions').set('Origin', origin).expect(403)
    const removed = await userModel(database).updateOne(
      { _id: new Types.ObjectId(admin.user.id) },
      { $set: { globalRoles: ['student'] } },
    )
    expect(removed.modifiedCount).toBe(1)
    await admin.agent.get('/api/admin/institutions').set('Origin', origin).expect(403)
  })

  it('rolls back each privileged write when its audit writer fails', async () => {
    const service = createAdminService(database, {
      recordAuditEvent: async () => {
        throw new Error('synthetic audit failure')
      },
    })
    const actor = { id: admin.user.id }
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const institutionSlug = `rollback-${suffix}`

    await expect(
      service.createInstitution(actor, { name: `Rollback ${suffix}`, slug: institutionSlug }, {}),
    ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
    expect(await institutionModel(database).countDocuments({ slug: institutionSlug })).toBe(0)

    const institution = await institutionModel(database).create({
      name: `Existing ${suffix}`,
      slug: `existing-${suffix}`,
      status: 'active',
    })
    owned.institutions.add(institution._id.toString())
    await expect(
      service.createCohort(
        actor,
        { institutionId: institution._id.toString(), name: 'Rollback class', term: '2026 T2' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
    expect(await cohortModel(database).countDocuments({ institutionId: institution._id })).toBe(0)

    const email = `rollback-${suffix}@example.test`
    await expect(
      service.provisionInstructor(
        actor,
        { email, username: `rollback-${suffix}`, avatarId: 'mint' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
    expect(await userModel(database).countDocuments({ emailNormalized: email })).toBe(0)

    const cohort = await cohortModel(database).create({
      institutionId: institution._id,
      name: 'Assignment rollback class',
      term: '2026 T2',
      status: 'active',
    })
    owned.cohorts.add(cohort._id.toString())
    const instructor = await createActiveInstructor()
    await expect(
      service.setAssignments(
        actor,
        instructor._id.toString(),
        { cohortIds: [cohort._id.toString()], expectedRevision: 0 },
        {},
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
    const unchanged = await userModel(database).findById(instructor._id).lean()
    expect(unchanged.instructorAssignmentRevision).toBe(0)
    expect(
      await instructorAssignmentModel(database).countDocuments({ userId: instructor._id }),
    ).toBe(0)
  })
})
