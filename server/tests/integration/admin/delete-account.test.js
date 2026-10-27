import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import { verifyPassword } from '../../../src/modules/auth/password.js'
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
const owned = { users: new Set(), institutions: new Set(), cohorts: new Set(), attempts: new Set() }
let database
let authOptions
let fixtureHash
let app
let admin
let student
let origin

function guardTestDatabase() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Refusing admin account fixtures outside a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

async function registerAdmin() {
  const account = await registerTestStudent(app)
  owned.users.add(account.user.id)
  await userModel(database).updateOne(
    { _id: new Types.ObjectId(account.user.id) },
    { $set: { globalRoles: ['admin'] } },
  )
  return account
}

async function createSyntheticUser(globalRoles = ['student'], accountStatus = 'active') {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const user = await userModel(database).create({
    emailNormalized: `account-${suffix}@example.test`,
    username: `account-${suffix}`,
    usernameNormalized: `account-${suffix}`,
    avatarId: 'mint',
    passwordHash: fixtureHash,
    globalRoles,
    accountStatus,
    authVersion: 1,
    passwordChangedAt: new Date(),
  })
  owned.users.add(user._id.toString())
  return user
}

async function createInstitutionAndCohort() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institution = await institutionModel(database).create({
    name: `Synthetic Account Campus ${suffix}`,
    slug: `synthetic-account-${suffix}`,
    status: 'active',
  })
  owned.institutions.add(institution._id.toString())
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Synthetic Account Class ${suffix}`,
    term: '2026 T2',
    status: 'active',
  })
  owned.cohorts.add(cohort._id.toString())
  return { institution, cohort }
}

async function login(email) {
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email, password })
    .expect(200)
  return { agent, csrfToken: response.body.csrfToken }
}

async function newPublicAgent() {
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
  return { agent, csrfToken: csrf.body.csrfToken }
}

function tokenFrom(url) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get('token')
}

function patchStatus(userId, accountStatus, expectedRevision, actor = admin) {
  return actor.agent
    .patch(`/api/admin/users/${userId}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrfToken)
    .send({ accountStatus, expectedRevision })
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test')
    throw new Error('Admin account integration requires NODE_ENV=test.')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guardTestDatabase()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Run admin account integration with --replica-set.')
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
  owned.attempts.clear()
  app = createTestApp(database, authOptions)
  origin = authOptions.clientOrigin
  admin = await registerAdmin()
  student = await createSyntheticUser()
})

afterEach(async () => {
  if (!database) return
  guardTestDatabase()
  const userIds = [...owned.users]
  const objectIds = userIds.map((id) => new Types.ObjectId(id))
  const institutionIds = [...owned.institutions].map((id) => new Types.ObjectId(id))
  const cohortIds = [...owned.cohorts].map((id) => new Types.ObjectId(id))
  await database.db.collection('password_resets').deleteMany({ userId: { $in: objectIds } })
  await database.db.collection('auth_sessions').deleteMany({ 'session.userId': { $in: userIds } })
  await database.db.collection('audit_events').deleteMany({
    $or: [{ actorId: { $in: objectIds } }, { targetId: { $in: objectIds } }],
  })
  await database.db.collection('game_attempts').deleteMany({
    _id: { $in: [...owned.attempts] },
  })
  await database.db.collection('memberships').deleteMany({ userId: { $in: objectIds } })
  await database.db.collection('instructor_assignments').deleteMany({ userId: { $in: objectIds } })
  await database.db.collection('cohorts').deleteMany({ _id: { $in: cohortIds } })
  await database.db.collection('institutions').deleteMany({ _id: { $in: institutionIds } })
  await database.db.collection('users').deleteMany({ _id: { $in: objectIds } })
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

const DAY = 24 * 60 * 60 * 1000

function body(overrides = {}, target = student) {
  return {
    confirmUsername: target.username,
    password,
    reasonCategory: 'duplicate',
    expectedRevision: 1,
    ...overrides,
  }
}

function postDelete(userId, payload, actor = admin) {
  return actor.agent
    .post(`/api/admin/users/${userId}/delete`)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrfToken)
    .send(payload)
}

async function addMembership(user, cohort, status = 'active') {
  return membershipModel(database).create({
    userId: user._id,
    cohortId: cohort._id,
    status,
    decision: status === 'active' ? 'approved' : null,
  })
}

async function addAttempt(user, cohort) {
  const { insertedId } = await database.db.collection('game_attempts').insertOne({
    playerId: user._id,
    gameId: 'synthetic-delete-test',
    status: 'completed',
    context: { kind: 'cohort', cohortId: cohort._id },
    startedAt: new Date(),
  })
  owned.attempts.add(insertedId)
  return insertedId
}

async function counts(userId) {
  const id = new Types.ObjectId(userId)
  return {
    users: await database.db.collection('users').countDocuments({ _id: id }),
    memberships: await database.db.collection('memberships').countDocuments({ userId: id }),
    sessions: await database.db
      .collection('auth_sessions')
      .countDocuments({ 'session.userId': userId }),
    resets: await database.db.collection('password_resets').countDocuments({ userId: id }),
  }
}

async function issueReset(userId) {
  await admin.agent
    .post(`/api/admin/users/${userId}/recovery`)
    .set('Origin', origin)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ identityVerified: true })
    .expect(200)
}

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')(
  'admin delete student account',
  () => {
    it('hard-deletes a student with no attempts and every dependent row', async () => {
      const { cohort } = await createInstitutionAndCohort()
      await addMembership(student, cohort)
      const session = await login(student.emailNormalized)
      await issueReset(student._id)
      expect(await counts(student._id.toString())).toEqual({
        users: 1,
        memberships: 1,
        sessions: 1,
        resets: 1,
      })

      const response = await postDelete(student._id, body()).expect(200)
      expect(response.body).toEqual({ outcome: 'deleted' })
      expect(await counts(student._id.toString())).toEqual({
        users: 0,
        memberships: 0,
        sessions: 0,
        resets: 0,
      })
      await session.agent.get('/api/auth/me').set('Origin', origin).expect(401)
    })

    it('anonymises a student with attempts and keeps the attempt link', async () => {
      const { cohort } = await createInstitutionAndCohort()
      await addMembership(student, cohort)
      const attemptId = await addAttempt(student, cohort)
      await userModel(database).updateOne({ _id: student._id }, { $set: { avatarId: 'mint' } })
      const session = await login(student.emailNormalized)
      await issueReset(student._id)
      const originalEmail = student.emailNormalized

      const response = await postDelete(student._id, body()).expect(200)
      expect(response.body).toEqual({ outcome: 'anonymised' })

      const user = await userModel(database)
        .findById(student._id)
        .select('+passwordHash +emailVerification +recoveryRevision')
        .lean()
      expect(user.username).toMatch(/^deleted-[a-f0-9]{8}$/)
      expect(user.usernameNormalized).toBe(user.username)
      expect(user.emailNormalized).toBe(`deleted-${student._id}@invalid`)
      expect(user).toMatchObject({
        accountStatus: 'deleted',
        avatarId: 'mint',
        howToPlayDismissed: [],
        authVersion: 2,
        recoveryRevision: 2,
      })
      expect(user.emailVerification ?? null).toBeNull()
      expect(user.passwordHash).not.toBe(fixtureHash)
      await expect(verifyPassword(user.passwordHash, password)).resolves.toBe(false)

      const membership = await membershipModel(database).findOne({ userId: student._id }).lean()
      expect(membership.status).toBe('removed')
      expect((await counts(student._id.toString())).sessions).toBe(0)
      const reset = await database.db.collection('password_resets').findOne({ userId: student._id })
      expect(reset.revokedAt).toBeInstanceOf(Date)
      expect(
        await database.db
          .collection('game_attempts')
          .countDocuments({ _id: attemptId, playerId: student._id }),
      ).toBe(1)
      await session.agent.get('/api/auth/me').set('Origin', origin).expect(401)

      const attempt = await newPublicAgent()
      const failed = await attempt.agent
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', attempt.csrfToken)
        .send({ email: originalEmail, password })
      expect(failed.status).toBe(401)
    })

    it('deletes a disabled student and refuses a repeat as not found', async () => {
      const disabled = await createSyntheticUser(['student'], 'disabled')
      await postDelete(disabled._id, body({}, disabled)).expect(200)
      const again = await postDelete(disabled._id, body({}, disabled)).expect(404)
      expect(again.body.error.code).toBe('ADMIN_NOT_FOUND')
      const missing = await postDelete(new Types.ObjectId(), body()).expect(404)
      expect(missing.body.error.code).toBe('ADMIN_NOT_FOUND')
    })

    it('refuses ineligible targets and bad input without changing anything or auditing', async () => {
      const instructor = await createSyntheticUser(['instructor'])
      const otherAdmin = await createSyntheticUser(['admin'])
      const mixed = await createSyntheticUser(['student', 'instructor'])
      for (const target of [instructor, otherAdmin, mixed]) {
        const response = await postDelete(target._id, body({}, target)).expect(403)
        expect(response.body.error.code).toBe('ADMIN_FORBIDDEN')
        expect(await counts(target._id.toString())).toMatchObject({ users: 1 })
      }
      const self = await postDelete(
        admin.user.id,
        body({}, { username: admin.user.username }),
      ).expect(403)
      expect(self.body.error.code).toBe('ADMIN_FORBIDDEN')

      const wrongPassword = await postDelete(
        student._id,
        body({ password: 'Wrong-Password-2026!' }),
      ).expect(403)
      expect(wrongPassword.body.error.code).toBe('ADMIN_PASSWORD_INVALID')
      await postDelete(student._id, body({ confirmUsername: 'someone-else' })).expect(400)
      await postDelete(student._id, body({ reasonCategory: 'other' })).expect(400)
      await postDelete(
        student._id,
        body({ reasonCategory: 'other', reasonNote: 'too short' }),
      ).expect(400)
      await postDelete(student._id, body({ reasonNote: 'x'.repeat(501) })).expect(400)
      await postDelete(student._id, body({ role: 'admin' })).expect(400)
      const stale = await postDelete(student._id, body({ expectedRevision: 9 })).expect(409)
      expect(stale.body.error.code).toBe('ADMIN_STALE_ACCOUNT')

      expect(await counts(student._id.toString())).toMatchObject({ users: 1 })
      expect(
        await database.db
          .collection('audit_events')
          .countDocuments({ eventType: 'admin.account.delete' }),
      ).toBe(0)
    })

    it('refuses callers without account-management capability', async () => {
      const studentSession = await login(student.emailNormalized)
      const other = await createSyntheticUser()
      await studentSession.agent
        .post(`/api/admin/users/${other._id}/delete`)
        .set('Origin', origin)
        .set('X-CSRF-Token', studentSession.csrfToken)
        .send(body({}, other))
        .expect(403)
      await request(app)
        .post(`/api/admin/users/${other._id}/delete`)
        .send(body({}, other))
        .expect(401)
      expect(await counts(other._id.toString())).toMatchObject({ users: 1 })
    })

    it('writes an audit row with 180-day expiry and no email or username', async () => {
      const target = await createSyntheticUser()
      const before = Date.now()
      await postDelete(
        target._id,
        body({ reasonCategory: 'other', reasonNote: 'registered with a reserved name' }, target),
      ).expect(200)
      const row = await database.db
        .collection('audit_events')
        .findOne({ eventType: 'admin.account.delete', targetId: target._id })
      expect(row).toMatchObject({
        actorId: new Types.ObjectId(admin.user.id),
        targetRole: 'student',
        accountOutcome: 'deleted',
        reasonCategory: 'other',
        reasonNote: 'registered with a reserved name',
        outcome: 'success',
      })
      expect(row.expiresAt.getTime() - row.occurredAt.getTime()).toBe(180 * DAY)
      expect(row.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
      const serialized = JSON.stringify(row)
      expect(serialized).not.toContain(target.emailNormalized)
      expect(serialized).not.toContain(target.username)
      expect(serialized).not.toContain(password)

      const listed = await admin.agent
        .get('/api/admin/audit-events?eventType=admin.account.delete')
        .set('Origin', origin)
        .expect(200)
      expect(listed.body.events[0]).toMatchObject({
        eventType: 'admin.account.delete',
        accountOutcome: 'deleted',
        reasonCategory: 'other',
      })
    })

    it('rolls everything back when the audit write fails', async () => {
      const { cohort } = await createInstitutionAndCohort()
      await addMembership(student, cohort)
      const session = await login(student.emailNormalized)
      const service = createAdminService(database, {
        recordAuditEvent: async () => {
          throw new Error('synthetic audit failure')
        },
      })
      await expect(
        service.deleteStudentAccount({ id: admin.user.id }, student._id.toString(), body(), {}),
      ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
      expect(await counts(student._id.toString())).toEqual({
        users: 1,
        memberships: 1,
        sessions: 1,
        resets: 0,
      })
      await session.agent.get('/api/auth/me').set('Origin', origin).expect(200)
    })

    it('hides deleted accounts from the list and refuses to re-enable them', async () => {
      const { cohort } = await createInstitutionAndCohort()
      await addMembership(student, cohort)
      await addAttempt(student, cohort)
      await postDelete(student._id, body()).expect(200)
      const list = await admin.agent
        .get('/api/admin/users?role=student')
        .set('Origin', origin)
        .expect(200)
      expect(list.body.users.map((user) => user.id)).not.toContain(student._id.toString())
      const byStatus = await admin.agent
        .get('/api/admin/users?accountStatus=active')
        .set('Origin', origin)
        .expect(200)
      expect(byStatus.body.users.map((user) => user.id)).not.toContain(student._id.toString())
      await admin.agent
        .get('/api/admin/users?accountStatus=deleted')
        .set('Origin', origin)
        .expect(400)
      const reenable = await patchStatus(student._id, 'active', 2).expect(404)
      expect(reenable.body.error.code).toBe('ADMIN_NOT_FOUND')
      await patchStatus(student._id, 'deleted', 2).expect(400)
    })

    it('removes the student from roster, class results and leaderboards', async () => {
      const { cohort } = await createInstitutionAndCohort()
      const viewer = await createSyntheticUser()
      await addMembership(viewer, cohort)
      await addMembership(student, cohort)
      await addAttempt(student, cohort)
      await postDelete(student._id, body()).expect(200)
      const viewerSession = await login(viewer.emailNormalized)
      const targetId = student._id.toString()

      const roster = await admin.agent
        .get(`/api/cohorts/${cohort._id}/memberships`)
        .set('Origin', origin)
      expect(JSON.stringify(roster.body)).not.toContain(targetId)
      const games = await viewerSession.agent
        .get(`/api/cohorts/${cohort._id}/leaderboard/games`)
        .set('Origin', origin)
      expect(JSON.stringify(games.body)).not.toContain(targetId)
      const results = await admin.agent
        .get(`/api/cohorts/${cohort._id}/results`)
        .set('Origin', origin)
      expect(JSON.stringify(results.body)).not.toContain(targetId)
    })

    it.each(['hard', 'anonymise'])(
      'lets the same email register again after a %s delete',
      async (path) => {
        const { cohort } = await createInstitutionAndCohort()
        if (path === 'anonymise') await addAttempt(student, cohort)
        const email = student.emailNormalized
        await postDelete(student._id, body()).expect(200)
        const fresh = await registerTestStudent(app, { email })
        owned.users.add(fresh.user.id)
        expect(fresh.user.id).not.toBe(student._id.toString())
      },
    )
  },
)
