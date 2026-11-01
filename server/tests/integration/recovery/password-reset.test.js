import { createHash } from 'node:crypto'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { AuthMongoStore } from '../../../src/modules/auth/session.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import {
  initializeTestAuth,
  createTestApp,
  disposeTestAuthApps,
  registerTestStudent,
} from '../auth/helpers.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import { createRecoveryService } from '../../../src/modules/recovery/service.js'

let database
let authOptions
let app
let admin
let instructor
let student
let cohortId
let institutionId
let currentTime
const users = new Set()
const resetPayload = { identityVerified: true }
const nextPassword = 'New-Student-Password-2026!'

function guard() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Student recovery tests require a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

function tokenFrom(url) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get('token')
}

async function newPublicAgent() {
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', authOptions.clientOrigin).expect(200)
  return { agent, csrfToken: csrf.body.csrfToken }
}

function postReset(visitor, token, password = nextPassword, extra = {}) {
  return visitor.agent
    .post('/api/auth/reset-password')
    .set('Origin', authOptions.clientOrigin)
    .set('X-CSRF-Token', visitor.csrfToken)
    .send({ token, password, ...extra })
}

function adminActor() {
  return { id: admin.user.id, globalRoles: ['admin'] }
}

function instructorActor() {
  return { id: instructor.user.id, globalRoles: ['instructor'] }
}

function service(options = {}) {
  return createRecoveryService(database, {
    now: () => currentTime,
    clientOrigin: authOptions.clientOrigin,
    ...options,
  })
}

async function issueByAdmin(targetId = student.user.id, actor = adminActor(), serviceOptions) {
  return service(serviceOptions).issueAdminStudentReset(actor, targetId, resetPayload)
}

async function createPureStudent(index) {
  const unique = new Types.ObjectId().toString()
  const user = await userModel(database).create({
    emailNormalized: `recovery-${index}-${unique}@example.test`,
    username: `recovery_${index}_${unique.slice(-8)}`,
    usernameNormalized: `recovery_${index}_${unique.slice(-8)}`.toLowerCase(),
    avatarId: 'mint',
    passwordHash: await hashPassword('Synthetic-Recovery-Password-2026!'),
    globalRoles: ['student'],
    accountStatus: 'active',
    authVersion: 1,
    passwordChangedAt: new Date(currentTime),
  })
  const created = {
    user: { id: user._id.toString(), username: user.username, avatarId: user.avatarId },
  }
  users.add(created.user.id)
  return created
}

async function addStudentToCohort(userId, status = 'active') {
  await membershipModel(database).create({
    userId: new Types.ObjectId(userId),
    cohortId: new Types.ObjectId(cohortId),
    status,
  })
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guard()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Student recovery tests require --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  guard()
  currentTime = Date.now()
  app = createTestApp(database, { ...authOptions, now: () => currentTime })
  admin = await registerTestStudent(app)
  instructor = await registerTestStudent(app)
  student = await registerTestStudent(app)
  users.add(admin.user.id)
  users.add(instructor.user.id)
  users.add(student.user.id)
  await Promise.all([
    userModel(database).updateOne({ _id: admin.user.id }, { $set: { globalRoles: ['admin'] } }),
    userModel(database).updateOne(
      { _id: instructor.user.id },
      { $set: { globalRoles: ['instructor'] } },
    ),
  ])
  const institution = await institutionModel(database).create({
    name: `Recovery Institute ${admin.user.id.slice(-8)}`,
    slug: `recovery-${admin.user.id.slice(-12)}`,
    status: 'active',
  })
  institutionId = institution._id
  const cohort = await cohortModel(database).create({
    institutionId,
    name: 'Recovery Cohort',
    term: '2026',
    status: 'active',
  })
  cohortId = cohort._id
  await Promise.all([
    instructorAssignmentModel(database).create({
      userId: new Types.ObjectId(instructor.user.id),
      cohortId,
      status: 'active',
    }),
    addStudentToCohort(student.user.id),
  ])
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
  await database.db.collection('memberships').deleteMany({ userId: { $in: objectIds } })
  await database.db.collection('instructor_assignments').deleteMany({ userId: { $in: objectIds } })
  if (cohortId) await database.db.collection('cohorts').deleteOne({ _id: cohortId })
  if (institutionId) await database.db.collection('institutions').deleteOne({ _id: institutionId })
  await database.db.collection('users').deleteMany({ _id: { $in: objectIds } })
  users.clear()
  cohortId = null
  institutionId = null
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')('student password recovery', () => {
  it('limits lookup disclosure to admins and issues links only for eligible targets', async () => {
    const lookup = await admin.agent
      .post('/api/admin/recovery/lookup')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: student.email })
      .expect(200)
    expect(lookup.body.student).toEqual({
      id: student.user.id,
      username: student.user.username,
      email: student.email.toLowerCase(),
      avatarId: student.user.avatarId,
    })
    await instructor.agent
      .post('/api/admin/recovery/lookup')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', instructor.csrfToken)
      .send({ email: student.email })
      .expect(403)

    const adminIssue = await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(200)
    expect(adminIssue.body.expiresAt).toBe(new Date(currentTime + 30 * 60 * 1000).toISOString())
    expect(/^[A-Za-z0-9_-]{43}$/.test(tokenFrom(adminIssue.body.resetUrl))).toBe(true)

    const instructorIssue = await instructor.agent
      .post(`/api/cohorts/${cohortId}/students/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', instructor.csrfToken)
      .send(resetPayload)
      .expect(200)
    const oldToken = tokenFrom(adminIssue.body.resetUrl)
    const currentToken = tokenFrom(instructorIssue.body.resetUrl)
    const activeReset = await database.db.collection('password_resets').findOne({
      userId: new Types.ObjectId(student.user.id),
      purpose: 'student-password-reset',
      revokedAt: null,
      consumedAt: null,
    })
    expect(activeReset.tokenHash === createHash('sha256').update(currentToken).digest('hex')).toBe(
      true,
    )
    expect(JSON.stringify(activeReset).includes(oldToken)).toBe(false)
    expect(JSON.stringify(activeReset).includes(currentToken)).toBe(false)
    expect(JSON.stringify(instructorIssue.body).includes(activeReset.tokenHash)).toBe(false)
    const events = await database.db
      .collection('audit_events')
      .find({ targetId: new Types.ObjectId(student.user.id) })
      .toArray()
    expect(events.map(({ eventType }) => eventType).sort()).toEqual(
      ['cohort.student.recovery.issue', 'admin.student.recovery.issue'].sort(),
    )
    expect(
      events.every((event) => event.outcome === 'success' && event.occurredAt instanceof Date),
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.eventType === 'admin.student.recovery.issue' &&
          event.actorId.toString() === admin.user.id,
      ),
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.eventType === 'cohort.student.recovery.issue' &&
          event.actorId.toString() === instructor.user.id,
      ),
    ).toBe(true)
    expect(JSON.stringify(events).includes(oldToken)).toBe(false)
    await postReset(await newPublicAgent(), oldToken).expect(400)
  })

  it('allows an admin role through the admin flow, rejects its instructor fallback and excludes mixed targets', async () => {
    const noClassStudent = await createPureStudent(90)
    const noClassIssue = await issueByAdmin(noClassStudent.user.id)
    expect(noClassIssue.expiresAt).toBe(new Date(currentTime + 30 * 60 * 1000).toISOString())

    await userModel(database).updateOne(
      { _id: instructor.user.id },
      { $set: { globalRoles: ['admin', 'instructor'] } },
    )
    const dualActor = { id: instructor.user.id, globalRoles: ['admin', 'instructor'] }
    await instructor.agent
      .post(`/api/cohorts/${cohortId}/students/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', instructor.csrfToken)
      .send(resetPayload)
      .expect(403)
    await instructor.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', instructor.csrfToken)
      .send(resetPayload)
      .expect(200)
    await expect(
      service().issueInstructorStudentReset(
        dualActor,
        cohortId.toString(),
        student.user.id,
        resetPayload,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_FORBIDDEN', status: 403 })
    const dualRoleAdminIssue = await issueByAdmin(student.user.id, dualActor)
    expect(typeof dualRoleAdminIssue.resetUrl === 'string').toBe(true)

    await userModel(database).updateOne(
      { _id: student.user.id },
      { $set: { globalRoles: ['student', 'instructor'] } },
    )
    await expect(issueByAdmin()).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
    const mixedLookup = await admin.agent
      .post('/api/admin/recovery/lookup')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: student.email })
      .expect(200)
    expect(mixedLookup.body.student).toBeNull()
  })

  it('revalidates assignment and membership after a transaction snapshot is interrupted', async () => {
    for (const field of ['membership', 'assignment', 'issuer', 'target']) {
      const barrierReached = deferred()
      const releaseBarrier = deferred()
      let blocked = false
      let quotaCalls = 0
      const guardedService = service({
        consumeStudentIssueLimit: async () => {
          quotaCalls += 1
        },
        beforeRecoveryGuards: async ({ operation, targetId }) => {
          if (operation !== 'issue' || targetId !== student.user.id) return
          if (blocked) return
          blocked = true
          barrierReached.resolve()
          await releaseBarrier.promise
        },
      })
      const pending = guardedService.issueInstructorStudentReset(
        instructorActor(),
        cohortId.toString(),
        student.user.id,
        resetPayload,
      )
      await barrierReached.promise
      if (field === 'membership') {
        await membershipModel(database).updateOne(
          { userId: new Types.ObjectId(student.user.id), cohortId },
          { $set: { status: 'removed' } },
        )
      } else if (field === 'assignment') {
        await instructorAssignmentModel(database).updateOne(
          { userId: new Types.ObjectId(instructor.user.id), cohortId },
          { $set: { status: 'removed' } },
        )
      } else if (field === 'issuer') {
        await userModel(database).updateOne(
          { _id: instructor.user.id },
          { $set: { globalRoles: ['admin'] } },
        )
      } else if (field === 'target') {
        await userModel(database).updateOne(
          { _id: student.user.id },
          { $set: { globalRoles: ['student', 'instructor'] } },
        )
      }
      releaseBarrier.resolve()
      await expect(pending).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
      expect(quotaCalls).toBe(0)
      expect(
        await database.db.collection('password_resets').countDocuments({
          userId: new Types.ObjectId(student.user.id),
          purpose: 'student-password-reset',
          revokedAt: null,
          consumedAt: null,
        }),
      ).toBe(0)
      expect(
        await database.db.collection('audit_events').countDocuments({
          targetId: new Types.ObjectId(student.user.id),
          eventType: { $in: ['admin.student.recovery.issue', 'cohort.student.recovery.issue'] },
        }),
      ).toBe(0)
      if (field === 'assignment') {
        await instructorAssignmentModel(database).updateOne(
          { userId: new Types.ObjectId(instructor.user.id), cohortId },
          { $set: { status: 'active' } },
        )
      }
      if (field === 'membership') {
        await membershipModel(database).updateOne(
          { userId: new Types.ObjectId(student.user.id), cohortId },
          { $set: { status: 'active' } },
        )
      }
      if (field === 'issuer') {
        await userModel(database).updateOne(
          { _id: instructor.user.id },
          { $set: { globalRoles: ['instructor'] } },
        )
      }
      if (field === 'target') {
        await userModel(database).updateOne(
          { _id: student.user.id },
          { $set: { globalRoles: ['student'] } },
        )
      }
    }
  })

  it('charges a valid issuance once across a transaction retry and retains the charge after audit failure', async () => {
    const reached = deferred()
    const release = deferred()
    let blocked = false
    let guardCalls = 0
    let quotaCharges = 0
    const retryingService = service({
      consumeStudentIssueLimit: async () => {
        quotaCharges += 1
      },
      beforeRecoveryGuards: async ({ operation }) => {
        if (operation !== 'issue') return
        guardCalls += 1
        if (blocked) return
        blocked = true
        reached.resolve()
        await release.promise
      },
    })
    const pending = retryingService.issueAdminStudentReset(
      adminActor(),
      student.user.id,
      resetPayload,
    )
    await reached.promise
    await userModel(database).updateOne({ _id: student.user.id }, { $inc: { recoveryRevision: 1 } })
    release.resolve()
    const issued = await pending
    expect(guardCalls > 1).toBe(true)
    expect(quotaCharges).toBe(1)
    expect(typeof issued.resetUrl === 'string').toBe(true)

    let retainedCharge = 0
    const failingAudit = service({
      consumeStudentIssueLimit: async () => {
        retainedCharge += 1
      },
      recordAuditEvent: async () => {
        throw new Error('synthetic audit failure')
      },
    })
    const before = await database.db.collection('password_resets').countDocuments({
      userId: new Types.ObjectId(student.user.id),
      revokedAt: null,
      consumedAt: null,
    })
    await expect(
      failingAudit.issueAdminStudentReset(adminActor(), student.user.id, resetPayload),
    ).rejects.toMatchObject({ code: 'RECOVERY_FAILED', status: 503 })
    expect(retainedCharge).toBe(1)
    expect(
      await database.db.collection('password_resets').countDocuments({
        userId: new Types.ObjectId(student.user.id),
        revokedAt: null,
        consumedAt: null,
      }),
    ).toBe(before)
  })

  it('does not let ineligible requests poison the student quota and enforces its fourth eligible issue', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await membershipModel(database).updateOne(
        { userId: new Types.ObjectId(student.user.id), cohortId },
        { $set: { status: 'removed' } },
      )
      await instructor.agent
        .post(`/api/cohorts/${cohortId}/students/${student.user.id}/recovery`)
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', instructor.csrfToken)
        .send(resetPayload)
        .expect(400)
    }
    await membershipModel(database).updateOne(
      { userId: new Types.ObjectId(student.user.id), cohortId },
      { $set: { status: 'active' } },
    )
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(200)
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(200)
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(200)
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(429)
  })

  it('refuses a student whose membership is only pending, without charging the student quota', async () => {
    const pendingStudent = await createPureStudent('pending')
    await addStudentToCohort(pendingStudent.user.id, 'pending')
    const charged = []

    await expect(
      service({ consumeStudentIssueLimit: (id) => charged.push(id) }).issueInstructorStudentReset(
        instructorActor(),
        cohortId.toString(),
        pendingStudent.user.id,
        resetPayload,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE', status: 400 })
    expect(charged).toEqual([])
  })

  it('refuses a class the instructor is not assigned to, and a student of another class', async () => {
    const otherCohort = await cohortModel(database).create({
      institutionId,
      name: 'Another Cohort',
      term: '2026',
      status: 'active',
    })
    const otherStudent = await createPureStudent('other')
    await membershipModel(database).create({
      userId: new Types.ObjectId(otherStudent.user.id),
      cohortId: otherCohort._id,
      status: 'active',
    })

    // the unassigned class, with its own student
    await expect(
      service().issueInstructorStudentReset(
        instructorActor(),
        otherCohort._id.toString(),
        otherStudent.user.id,
        resetPayload,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE', status: 400 })
    // the instructor's own class id cannot reach a student of another class
    await expect(
      service().issueInstructorStudentReset(
        instructorActor(),
        cohortId.toString(),
        otherStudent.user.id,
        resetPayload,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE', status: 400 })
    // and the unassigned class id cannot reach the instructor's own student
    await expect(
      service().issueInstructorStudentReset(
        instructorActor(),
        otherCohort._id.toString(),
        student.user.id,
        resetPayload,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE', status: 400 })
  })

  it('stores the http request id on each audit row, so it can be matched to a response', async () => {
    const issue = await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(200)
    const issued = await database.db
      .collection('audit_events')
      .findOne({
        eventType: 'admin.student.recovery.issue',
        targetId: new Types.ObjectId(student.user.id),
      })
    expect(issued.requestId).toBe(issue.headers['x-request-id'])

    const visitor = await newPublicAgent()
    const redeem = await postReset(visitor, tokenFrom(issue.body.resetUrl)).expect(204)
    const redeemed = await database.db
      .collection('audit_events')
      .findOne({
        eventType: 'account.student.password_reset',
        targetId: new Types.ObjectId(student.user.id),
      })
    expect(redeemed.requestId).toBe(redeem.headers['x-request-id'])
  })

  it('rejects recovery requests without CSRF, with a foreign origin, or with extra fields', async () => {
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .send(resetPayload)
      .expect(403)
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', 'http://untrusted.example')
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(403)
    await admin.agent
      .post(`/api/admin/users/${student.user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ ...resetPayload, role: 'admin' })
      .expect(400)
    expect(
      await database.db.collection('password_resets').countDocuments({
        userId: new Types.ObjectId(student.user.id),
      }),
    ).toBe(0)
  })

  it('consumes a token once, revokes sessions and rolls all changes back when audit fails', async () => {
    const issue = await issueByAdmin()
    const token = tokenFrom(issue.resetUrl)
    const authenticatedReset = await postReset(
      { agent: admin.agent, csrfToken: admin.csrfToken },
      token,
    ).expect(400)
    expect(authenticatedReset.body.error.code).toBe('RECOVERY_UNAVAILABLE')
    const before = await userModel(database).findById(student.user.id).lean()
    const syntheticSessionId = `recovery-session-${student.user.id}`
    await database.db.collection('auth_sessions').insertOne({
      _id: syntheticSessionId,
      session: { userId: student.user.id, authVersion: before.authVersion },
      expires: new Date(currentTime + 60000),
    })
    const failingAudit = service({
      recordAuditEvent: async () => {
        throw new Error('synthetic audit failure')
      },
    })
    await expect(
      failingAudit.resetStudentPassword({ token, password: nextPassword }),
    ).rejects.toMatchObject({
      code: 'RECOVERY_FAILED',
      status: 503,
    })
    const rolledBack = await userModel(database).findById(student.user.id).lean()
    const unconsumed = await database.db.collection('password_resets').findOne({
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    expect(rolledBack.authVersion).toBe(before.authVersion)
    expect(unconsumed.consumedAt === null).toBe(true)
    expect(
      await database.db.collection('auth_sessions').countDocuments({ _id: syntheticSessionId }),
    ).toBe(1)

    const redeemed = await newPublicAgent()
    await postReset(redeemed, token).expect(204)
    await redeemed.agent.get('/api/auth/me').expect(401)
    const after = await userModel(database).findById(student.user.id).lean()
    expect(after.authVersion).toBe(before.authVersion + 1)
    expect(
      await database.db.collection('auth_sessions').countDocuments({ _id: syntheticSessionId }),
    ).toBe(0)
    await postReset(await newPublicAgent(), token).expect(400)
  })

  it('expires reset links and rechecks active cohort and institution status at redemption', async () => {
    const expiredIssue = await issueByAdmin()
    const expiredToken = tokenFrom(expiredIssue.resetUrl)
    await database.db
      .collection('password_resets')
      .updateOne(
        { tokenHash: createHash('sha256').update(expiredToken).digest('hex') },
        { $set: { expiresAt: new Date(currentTime - 1) } },
      )
    const response = await postReset(await newPublicAgent(), expiredToken).expect(400)
    expect(response.body.error.code).toBe('RECOVERY_UNAVAILABLE')

    for (const inactive of ['cohort', 'institution']) {
      const issue = await service().issueInstructorStudentReset(
        instructorActor(),
        cohortId.toString(),
        student.user.id,
        resetPayload,
      )
      const token = tokenFrom(issue.resetUrl)
      if (inactive === 'cohort') {
        await cohortModel(database).updateOne({ _id: cohortId }, { $set: { status: 'inactive' } })
      } else {
        await institutionModel(database).updateOne(
          { _id: institutionId },
          { $set: { status: 'inactive' } },
        )
      }
      await expect(
        service().resetStudentPassword({ token, password: nextPassword }),
      ).rejects.toMatchObject({
        code: 'RECOVERY_UNAVAILABLE',
      })
      if (inactive === 'cohort') {
        await cohortModel(database).updateOne({ _id: cohortId }, { $set: { status: 'active' } })
      } else {
        await institutionModel(database).updateOne(
          { _id: institutionId },
          { $set: { status: 'active' } },
        )
      }
    }
  })

  it('rolls back redemption writes when the link expires after eligibility reads', async () => {
    const issue = await issueByAdmin()
    const token = tokenFrom(issue.resetUrl)
    const resetTokenHash = createHash('sha256').update(token).digest('hex')
    const sessionId = `expiry-race-session-${student.user.id}`
    await database.db.collection('auth_sessions').insertOne({
      _id: sessionId,
      session: { userId: student.user.id, authVersion: 1 },
      expires: new Date(currentTime + 60000),
    })
    const User = userModel(database)
    const before = await User.findById(student.user.id)
      .select('+passwordHash +recoveryRevision')
      .lean()
    const resetEventsBefore = await database.db.collection('audit_events').countDocuments({
      targetId: new Types.ObjectId(student.user.id),
      eventType: 'account.student.password_reset',
    })
    const expiryBoundary = Date.parse(issue.expiresAt)
    const expiringService = service({
      beforeRecoveryGuards: async ({ operation }) => {
        if (operation === 'redeem') currentTime = expiryBoundary + 1
      },
    })

    await expect(
      expiringService.resetStudentPassword({ token, password: nextPassword }),
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
    const after = await User.findById(student.user.id)
      .select('+passwordHash +recoveryRevision')
      .lean()
    const reset = await database.db.collection('password_resets').findOne({
      tokenHash: resetTokenHash,
    })
    expect(after.authVersion).toBe(before.authVersion)
    expect(after.recoveryRevision).toBe(before.recoveryRevision)
    expect(after.passwordHash === before.passwordHash).toBe(true)
    expect(after.passwordChangedAt.getTime()).toBe(before.passwordChangedAt.getTime())
    expect(reset.consumedAt === null && reset.revokedAt === null).toBe(true)
    expect(await database.db.collection('auth_sessions').countDocuments({ _id: sessionId })).toBe(1)
    expect(
      await database.db.collection('audit_events').countDocuments({
        targetId: new Types.ObjectId(student.user.id),
        eventType: 'account.student.password_reset',
      }),
    ).toBe(resetEventsBefore)
  })

  it('makes a reissued link supersede a redemption that has not acquired its guards', async () => {
    const firstIssue = await issueByAdmin()
    const oldToken = tokenFrom(firstIssue.resetUrl)
    const reached = deferred()
    const release = deferred()
    let blocked = false
    const waitingRedemption = service({
      beforeRecoveryGuards: async ({ operation }) => {
        if (operation !== 'redeem' || blocked) return
        blocked = true
        reached.resolve()
        await release.promise
      },
    }).resetStudentPassword({ token: oldToken, password: nextPassword })
    await reached.promise
    const latestIssue = await issueByAdmin()
    release.resolve()
    await expect(waitingRedemption).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
    const oldRecord = await database.db.collection('password_resets').findOne({
      tokenHash: createHash('sha256').update(oldToken).digest('hex'),
    })
    expect(oldRecord.revokedAt instanceof Date).toBe(true)
    await service().resetStudentPassword({
      token: tokenFrom(latestIssue.resetUrl),
      password: nextPassword,
    })
    const afterRedemptionIssue = await issueByAdmin()
    await service().resetStudentPassword({
      token: tokenFrom(afterRedemptionIssue.resetUrl),
      password: 'Recovery-After-Redemption-2026!',
    })
  })

  it('serializes simultaneous redemption and permits a delayed session touch to leave deletion intact', async () => {
    const issue = await issueByAdmin()
    const token = tokenFrom(issue.resetUrl)
    const results = await Promise.allSettled([
      service().resetStudentPassword({ token, password: nextPassword }),
      service().resetStudentPassword({ token, password: 'Another-Student-Password-2026!' }),
    ])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
    expect(
      await database.db.collection('password_resets').countDocuments({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        consumedAt: { $ne: null },
      }),
    ).toBe(1)

    const sessionId = `delayed-touch-${student.user.id}`
    await database.db.collection('auth_sessions').insertOne({
      _id: sessionId,
      session: { userId: student.user.id },
      expires: new Date(currentTime + 60000),
    })
    await database.db.collection('auth_sessions').deleteOne({ _id: sessionId })
    const store = new AuthMongoStore({}, database.db.collection('auth_sessions'), () => currentTime)
    await new Promise((resolve, reject) => {
      store.touch(
        sessionId,
        { userId: student.user.id, absoluteExpiresAt: new Date(currentTime + 60000) },
        (error) => (error ? reject(error) : resolve()),
      )
    })
    expect(await database.db.collection('auth_sessions').countDocuments({ _id: sessionId })).toBe(0)
  })

  it('applies the staff, lookup and reset IP caps to their actual HTTP routes', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await admin.agent
        .post('/api/admin/recovery/lookup')
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ email: `missing-${attempt}@example.test` })
        .expect(200)
    }
    await admin.agent
      .post('/api/admin/recovery/lookup')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: 'missing-last@example.test' })
      .expect(429)

    const resetVisitor = await newPublicAgent()
    await resetVisitor.agent
      .post('/api/auth/reset-password')
      .set('Origin', authOptions.clientOrigin)
      .send({ token: 'A'.repeat(43), password: nextPassword })
      .expect(403)
    await resetVisitor.agent
      .post('/api/auth/reset-password')
      .set('Origin', 'http://untrusted.example')
      .set('X-CSRF-Token', resetVisitor.csrfToken)
      .send({ token: 'A'.repeat(43), password: nextPassword })
      .expect(403)
    const malformedReset = await postReset(resetVisitor, 'A'.repeat(43), nextPassword, {
      role: 'admin',
    }).expect(400)
    expect(malformedReset.body.error.code).toBe('RECOVERY_INVALID_REQUEST')
    const malformedToken = await postReset(resetVisitor, 'A'.repeat(42)).expect(400)
    expect(malformedToken.body.error.code).toBe('RECOVERY_INVALID_REQUEST')
    const malformedPassword = await postReset(resetVisitor, 'A'.repeat(43), 'weak').expect(400)
    expect(malformedPassword.body.error.code).toBe('RECOVERY_INVALID_REQUEST')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const rejected = await postReset(resetVisitor, 'A'.repeat(43)).expect(400)
      expect(rejected.body.error.code).toBe('RECOVERY_UNAVAILABLE')
    }
    await postReset(resetVisitor, 'A'.repeat(43)).expect(429)

    const targets = []
    for (let index = 0; index < 11; index += 1) targets.push(await createPureStudent(index))
    for (const target of targets.slice(0, 10)) {
      await admin.agent
        .post(`/api/admin/users/${target.user.id}/recovery`)
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(resetPayload)
        .expect(200)
    }
    await admin.agent
      .post(`/api/admin/users/${targets[10].user.id}/recovery`)
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(resetPayload)
      .expect(429)
  })
})

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
