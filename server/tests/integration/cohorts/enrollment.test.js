import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import { enrollmentCodeModel } from '../../../src/modules/cohorts/enrollment-code-model.js'
import { createCohortService } from '../../../src/modules/cohorts/service.js'
import { hashEnrollmentCode } from '../../../src/modules/cohorts/policy.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import {
  initializeTestAuth,
  createTestApp,
  registerTestStudent,
  testMailer,
  disposeTestAuthApps,
} from '../auth/helpers.js'

const password = 'Synthetic-Test-Password-2026'
const owned = { users: new Set(), institutions: new Set(), cohorts: new Set() }
let database
let authOptions
let app
let origin
let currentTime
let teacher
let unassignedTeacher
let student
let administrator
let cohort
let institution

function guardTestDatabase() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Refusing enrollment fixtures outside a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

async function registerRole(role = 'student') {
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

async function createWorld() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const createdInstitution = await institutionModel(database).create({
    name: `Enrollment School ${suffix}`,
    slug: `enroll-${suffix}`,
    status: 'active',
  })
  institution = createdInstitution
  owned.institutions.add(institution._id.toString())
  const createdCohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Class ${suffix}`,
    term: '2026 T2',
    status: 'active',
  })
  cohort = createdCohort
  owned.cohorts.add(cohort._id.toString())
  await instructorAssignmentModel(database).create({
    userId: new Types.ObjectId(teacher.user.id),
    cohortId: cohort._id,
    status: 'active',
  })
}

function requestCode(agent = teacher.agent, csrfToken = teacher.csrfToken, expectedRevision = 0) {
  return agent
    .post(`/api/cohorts/${cohort._id}/enrollment-codes`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send({ expectedRevision })
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test') throw new Error('Enrollment integration requires NODE_ENV=test.')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guardTestDatabase()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Run enrollment integration with --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  guardTestDatabase()
  owned.users.clear()
  owned.institutions.clear()
  owned.cohorts.clear()
  currentTime = Date.now()
  app = createTestApp(
    database,
    { ...authOptions, now: () => currentTime },
    { cohorts: { now: () => currentTime } },
  )
  origin = authOptions.clientOrigin
  student = await registerRole()
  teacher = await registerRole('instructor')
  unassignedTeacher = await registerRole('instructor')
  administrator = await registerRole('admin')
  await createWorld()
})

afterEach(async () => {
  if (!database) return
  guardTestDatabase()
  const users = [...owned.users].map((id) => new Types.ObjectId(id))
  const institutions = [...owned.institutions].map((id) => new Types.ObjectId(id))
  const cohorts = [...owned.cohorts].map((id) => new Types.ObjectId(id))
  await database.db.collection('enrollment_codes').deleteMany({ cohortId: { $in: cohorts } })
  await database.db.collection('memberships').deleteMany({ cohortId: { $in: cohorts } })
  await database.db
    .collection('instructor_assignments')
    .deleteMany({ $or: [{ userId: { $in: users } }, { cohortId: { $in: cohorts } }] })
  await database.db.collection('audit_events').deleteMany({
    $or: [
      { actorId: { $in: users } },
      { targetId: { $in: users } },
      { scopeCohortId: { $in: cohorts } },
    ],
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

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')('cohort enrollment API', () => {
  it('captures an invitation anonymously, carries it through registration, and consumes it once', async () => {
    const issued = await requestCode().expect(201)
    const rawCode = issued.body.rawCode
    const anonymous = request.agent(app)
    const csrf = await anonymous.get('/api/auth/csrf').set('Origin', origin).expect(200)
    await anonymous
      .post('/api/auth/class-invitation')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ code: rawCode })
      .expect(204)
    const invitedEmail = `invited-${randomUUID().replaceAll('-', '').slice(0, 12)}@example.test`
    const pending = await anonymous
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({
        email: invitedEmail,
        username: `invited-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        password,
        avatarId: 'mint',
      })
      .expect(202)
    // the invitation waits in the session while the email address is confirmed
    const registered = await anonymous
      .post('/api/auth/verify-email')
      .set('Origin', origin)
      .set('X-CSRF-Token', pending.body.csrfToken)
      .send({ code: testMailer(app).lastCodeFor(invitedEmail) })
      .expect(201)
    owned.users.add(registered.body.user.id)
    const state = await anonymous.get('/api/me/enrollment').set('Origin', origin).expect(200)
    expect(state.body).toEqual({ onboardingCompleted: false, hasInvitation: true })
    const joined = await anonymous
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', registered.body.csrfToken)
      .send({ invitation: true })
      .expect(200)
    expect(joined.body.membership).toMatchObject({
      cohortId: cohort._id.toString(),
      status: 'pending',
    })
    expect(joined.body.membership).not.toHaveProperty('userId')
    expect(
      await anonymous
        .get('/api/me/enrollment')
        .set('Origin', origin)
        .expect(200)
        .then(({ body }) => body),
    ).toEqual({ onboardingCompleted: true, hasInvitation: false })
    expect(
      await database.db.collection('enrollment_codes').findOne({ cohortId: cohort._id }),
    ).not.toHaveProperty('codeHash', rawCode)
    expect(await membershipModel(database).countDocuments({ cohortId: cohort._id })).toBe(1)
  })

  it('carries an anonymous invitation through the unauthenticated /me check and login', async () => {
    const issued = await requestCode().expect(201)
    const anonymous = request.agent(app)
    const csrf = await anonymous.get('/api/auth/csrf').set('Origin', origin).expect(200)
    await anonymous
      .post('/api/auth/class-invitation')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ code: issued.body.rawCode })
      .expect(204)
    await anonymous.get('/api/auth/me').set('Origin', origin).expect(401)
    const loginCsrf = await anonymous.get('/api/auth/csrf').set('Origin', origin).expect(200)
    const login = await anonymous
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', loginCsrf.body.csrfToken)
      .send({ email: student.email, password })
      .expect(200)
    expect(Object.keys(login.body).sort()).toEqual(['csrfToken', 'user'])
    expect(
      await anonymous
        .get('/api/me/enrollment')
        .set('Origin', origin)
        .expect(200)
        .then(({ body }) => body),
    ).toEqual({ onboardingCompleted: false, hasInvitation: true })
    const joined = await anonymous
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ invitation: true })
      .expect(200)
    expect(joined.body.membership).toMatchObject({
      cohortId: cohort._id.toString(),
      status: 'pending',
    })
    expect(
      await anonymous
        .get('/api/me/enrollment')
        .set('Origin', origin)
        .expect(200)
        .then(({ body }) => body),
    ).toEqual({ onboardingCompleted: true, hasInvitation: false })
  })

  it('supports manual join, idempotent retries, scoped staff decisions, removal and pending rejoin', async () => {
    const issued = await requestCode().expect(201)
    const code = issued.body.rawCode
    await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: 'BAD-CODE' })
      .expect(400)
    const first = await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code })
      .expect(200)
    const retry = await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: code.toLowerCase() })
      .expect(200)
    expect(retry.body).toEqual(first.body)
    expect(
      (await student.agent.get('/api/me/enrollment').expect(200)).body.onboardingCompleted,
    ).toBe(true)
    const listed = await teacher.agent
      .get(`/api/cohorts/${cohort._id}/memberships`)
      .set('Origin', origin)
      .expect(200)
    expect(listed.body).toMatchObject({ page: 1, total: 1 })
    expect(listed.body.memberships[0]).toMatchObject({
      id: first.body.membership.id,
      studentId: student.user.id,
      username: student.user.username,
      status: 'pending',
      decision: null,
      revision: 0,
    })
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|codeHash|userId/)
    await unassignedTeacher.agent
      .get(`/api/cohorts/${cohort._id}/memberships`)
      .set('Origin', origin)
      .expect(404)
    await student.agent
      .get(`/api/cohorts/${cohort._id}/memberships`)
      .set('Origin', origin)
      .expect(404)
    const approved = await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${first.body.membership.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'active', expectedRevision: 0 })
      .expect(200)
    expect(approved.body.membership).toMatchObject({
      status: 'active',
      decision: 'approved',
      revision: 1,
    })
    await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${first.body.membership.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'removed', expectedRevision: 0 })
      .expect(409)
    const removed = await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${first.body.membership.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'removed', expectedRevision: 1 })
      .expect(200)
    expect(removed.body.membership).toMatchObject({
      status: 'removed',
      decision: 'removed',
      revision: 2,
    })
    await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${first.body.membership.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'active', expectedRevision: 2 })
      .expect(409)
    const rejoined = await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code })
      .expect(200)
    expect(rejoined.body.membership).toMatchObject({
      status: 'pending',
      id: first.body.membership.id,
    })
    const record = await membershipModel(database).findById(first.body.membership.id).lean()
    expect(record).toMatchObject({
      status: 'pending',
      decision: null,
      revision: 3,
      approvedAt: null,
      approvedBy: null,
      removedAt: null,
      removedBy: null,
    })
  })

  it('rejects stale code generations, expired/revoked codes and inactive destinations', async () => {
    const first = await requestCode().expect(201)
    const oldCode = first.body.rawCode
    const second = await requestCode(teacher.agent, teacher.csrfToken, first.body.revision).expect(
      201,
    )
    expect(second.body.revision).toBe(first.body.revision + 1)
    await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: oldCode })
      .expect(404)
    await teacher.agent
      .delete(`/api/cohorts/${cohort._id}/enrollment-codes/${second.body.code.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ expectedRevision: second.body.revision - 1 })
      .expect(409)
    const revoked = await teacher.agent
      .delete(`/api/cohorts/${cohort._id}/enrollment-codes/${second.body.code.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ expectedRevision: second.body.revision })
      .expect(200)
    expect(revoked.body).toMatchObject({
      revision: second.body.revision + 1,
      code: { revokedAt: expect.any(String) },
    })
    await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: second.body.rawCode })
      .expect(404)
    const third = await requestCode(teacher.agent, teacher.csrfToken, revoked.body.revision).expect(
      201,
    )
    await enrollmentCodeModel(database).updateOne(
      { _id: new Types.ObjectId(third.body.code.id) },
      { $set: { expiresAt: new Date(currentTime - 1) } },
    )
    await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: third.body.rawCode })
      .expect(404)
  })

  it('serializes concurrent code rotation against enrollment and membership decisions', async () => {
    const issued = await requestCode().expect(201)
    const competing = await Promise.all([
      student.agent
        .post('/api/cohorts/join-requests')
        .set('Origin', origin)
        .set('X-CSRF-Token', student.csrfToken)
        .send({ code: issued.body.rawCode }),
      requestCode(teacher.agent, teacher.csrfToken, issued.body.revision),
    ])
    expect(competing.map(({ status }) => status).sort()).toEqual([200, 201])
    const membership = await membershipModel(database)
      .findOne({ userId: new Types.ObjectId(student.user.id), cohortId: cohort._id })
      .lean()
    const decisions = await Promise.all([
      teacher.agent
        .patch(`/api/cohorts/${cohort._id}/memberships/${membership._id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', teacher.csrfToken)
        .send({ status: 'active', expectedRevision: 0 }),
      administrator.agent
        .patch(`/api/cohorts/${cohort._id}/memberships/${membership._id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', administrator.csrfToken)
        .send({ status: 'removed', expectedRevision: 0 }),
    ])
    expect(decisions.map(({ status }) => status).sort()).toEqual([200, 409])
    expect(await membershipModel(database).findById(membership._id).lean()).toMatchObject({
      revision: 1,
    })
  })

  it('requires current sessions, CSRF/origin, and rolls code writes back when audit fails', async () => {
    const issued = await requestCode().expect(201)
    const missingCsrf = await student.agent
      .patch('/api/me/enrollment/onboarding')
      .set('Origin', origin)
      .send({ completed: true })
    expect(missingCsrf.status, JSON.stringify(missingCsrf.body)).toBe(403)
    await student.agent
      .patch('/api/me/enrollment/onboarding')
      .set('Origin', 'https://invalid.example')
      .set('X-CSRF-Token', student.csrfToken)
      .send({ completed: true })
      .expect(403)
    await student.agent
      .patch('/api/me/enrollment/onboarding')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ completed: true })
      .expect(204)
    const failing = createCohortService(database, {
      recordAuditEvent: async () => {
        throw new Error('synthetic audit failure')
      },
    })
    await expect(
      failing.issueCode(
        { id: administrator.user.id },
        cohort._id.toString(),
        { expectedRevision: issued.body.revision },
        {},
      ),
    ).rejects.toMatchObject({ status: 503 })
    const unchanged = await enrollmentCodeModel(database).findOne({ cohortId: cohort._id }).lean()
    expect(unchanged.codeHash).toBe(hashEnrollmentCode(issued.body.rawCode))
    expect(unchanged.revision).toBe(issued.body.revision)
  })

  it('bounds join requests and rolls onboarding, join, revoke and decision back on audit failure', async () => {
    const issued = await requestCode().expect(201)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await student.agent
        .post('/api/cohorts/join-requests')
        .set('Origin', origin)
        .set('X-CSRF-Token', student.csrfToken)
        .send({ code: 'INVALID' })
        .expect(400)
    }
    await student.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ code: 'INVALID' })
      .expect(429)

    const failing = createCohortService(database, {
      recordAuditEvent: async () => {
        throw new Error('synthetic audit failure')
      },
    })
    await expect(
      failing.completeOnboarding({ id: student.user.id }, { completed: true }),
    ).rejects.toMatchObject({ status: 503 })
    await expect(
      failing.join({ id: student.user.id }, { code: issued.body.rawCode }),
    ).rejects.toMatchObject({ status: 503 })
    await expect(
      failing.revokeCode({ id: teacher.user.id }, cohort._id.toString(), issued.body.code.id, {
        expectedRevision: issued.body.revision,
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(
      await userModel(database)
        .findById(student.user.id)
        .select('classOnboardingCompletedAt')
        .lean(),
    ).toMatchObject({ classOnboardingCompletedAt: null })
    expect(await membershipModel(database).countDocuments({ userId: student.user.id })).toBe(0)
    expect(await enrollmentCodeModel(database).findById(issued.body.code.id).lean()).toMatchObject({
      useCount: 0,
      revision: issued.body.revision,
      revokedAt: null,
    })

    const membership = await membershipModel(database).create({
      userId: new Types.ObjectId(student.user.id),
      cohortId: cohort._id,
      status: 'pending',
      requestedAt: new Date(currentTime),
    })
    await expect(
      failing.decide({ id: teacher.user.id }, cohort._id.toString(), membership._id.toString(), {
        status: 'active',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(await membershipModel(database).findById(membership._id).lean()).toMatchObject({
      status: 'pending',
      decision: null,
      revision: 0,
    })

    const sibling = await cohortModel(database).create({
      institutionId: institution._id,
      name: `Other class ${randomUUID().slice(0, 8)}`,
      term: '2026 T2',
      status: 'active',
    })
    owned.cohorts.add(sibling._id.toString())
    const foreignMembership = await membershipModel(database).create({
      userId: new Types.ObjectId(student.user.id),
      cohortId: sibling._id,
      status: 'pending',
      requestedAt: new Date(currentTime),
    })
    await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${foreignMembership._id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'removed', expectedRevision: 0 })
      .expect(404)
    const declined = await teacher.agent
      .patch(`/api/cohorts/${cohort._id}/memberships/${membership._id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status: 'removed', expectedRevision: 0 })
      .expect(200)
    expect(declined.body.membership).toMatchObject({
      status: 'removed',
      decision: 'declined',
      revision: 1,
    })
  })
})

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')('one class per student', () => {
  let sibling
  let siblingTeacherCode

  async function createSibling() {
    sibling = await cohortModel(database).create({
      institutionId: institution._id,
      name: `Sibling ${randomUUID().slice(0, 8)}`,
      term: '2026 T2',
      status: 'active',
    })
    owned.cohorts.add(sibling._id.toString())
    await instructorAssignmentModel(database).create({
      userId: new Types.ObjectId(teacher.user.id),
      cohortId: sibling._id,
      status: 'active',
    })
    const issued = await teacher.agent
      .post(`/api/cohorts/${sibling._id}/enrollment-codes`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ expectedRevision: 0 })
      .expect(201)
    siblingTeacherCode = issued.body.rawCode
  }

  function join(account, code) {
    return account.agent
      .post('/api/cohorts/join-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', account.csrfToken)
      .send({ code })
  }

  function decide(cohortId, membershipId, status, expectedRevision) {
    return teacher.agent
      .patch(`/api/cohorts/${cohortId}/memberships/${membershipId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', teacher.csrfToken)
      .send({ status, expectedRevision })
  }

  it('blocks a second class while one is pending or active, keeps same-class retries and allows a new class after removal', async () => {
    await createSibling()
    const firstCode = (await requestCode().expect(201)).body.rawCode
    const pending = await join(student, firstCode).expect(200)
    const blocked = await join(student, siblingTeacherCode).expect(409)
    expect(blocked.body.error).toMatchObject({
      code: 'COHORT_ALREADY_IN_CLASS',
      message: "You're already in a class. Leave it before joining another.",
    })
    expect(await membershipModel(database).countDocuments({ userId: student.user.id })).toBe(1)
    expect((await join(student, firstCode).expect(200)).body).toEqual(pending.body)

    await decide(cohort._id, pending.body.membership.id, 'active', 0).expect(200)
    await join(student, siblingTeacherCode).expect(409)

    await decide(cohort._id, pending.body.membership.id, 'removed', 1).expect(200)
    const next = await join(student, siblingTeacherCode).expect(200)
    expect(next.body.membership).toMatchObject({ status: 'pending' })
    await join(student, firstCode).expect(409)
  })

  it('refuses approval when the student already holds another active class and changes nothing', async () => {
    await createSibling()
    const userId = new Types.ObjectId(student.user.id)
    const pendingHere = await membershipModel(database).create({
      userId,
      cohortId: cohort._id,
      status: 'pending',
      requestedAt: new Date(currentTime),
    })
    await membershipModel(database).create({
      userId,
      cohortId: sibling._id,
      status: 'active',
      requestedAt: new Date(currentTime),
    })
    const refused = await decide(cohort._id, pendingHere._id, 'active', 0).expect(409)
    expect(refused.body.error).toMatchObject({
      code: 'COHORT_ALREADY_IN_CLASS',
      message: 'This student is already in another class.',
    })
    expect(await membershipModel(database).findById(pendingHere._id).lean()).toMatchObject({
      status: 'pending',
      decision: null,
      revision: 0,
    })
    await decide(cohort._id, pendingHere._id, 'removed', 0).expect(200)
  })

  it('does not limit staff or touch existing extra memberships', async () => {
    await createSibling()
    const code = (await requestCode().expect(201)).body.rawCode
    await join(teacher, code).expect(403)
    const userId = new Types.ObjectId(student.user.id)
    await membershipModel(database).create([
      { userId, cohortId: cohort._id, status: 'active', requestedAt: new Date(currentTime) },
      { userId, cohortId: sibling._id, status: 'active', requestedAt: new Date(currentTime) },
    ])
    const listed = await student.agent.get('/api/me/memberships').expect(200)
    expect(listed.body.memberships.filter(({ status }) => status === 'active')).toHaveLength(2)
  })
})
