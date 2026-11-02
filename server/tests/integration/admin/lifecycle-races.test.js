import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import { createAdminService } from '../../../src/modules/admin/service.js'
import { hashPassword } from '../../../src/modules/auth/password.js'
import { createAuditService } from '../../../src/modules/audit/service.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { enrollmentCodeModel } from '../../../src/modules/cohorts/enrollment-code-model.js'
import { createCohortService } from '../../../src/modules/cohorts/service.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { createRecoveryService } from '../../../src/modules/recovery/service.js'
import { createStudentRecoveryGuards } from '../../../src/modules/recovery/guards.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'

const owned = { users: new Set(), institutions: new Set(), cohorts: new Set() }
const password = 'Synthetic-Lifecycle-Race-2026!'
const resetPayload = { identityVerified: true }
let database
let currentTime
let fixtureHash
let admin
let instructor
let student
let institution
let cohort

function guardTestDatabase() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Refusing lifecycle race fixtures outside a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function createAccount(role, suffix) {
  const id = new Types.ObjectId()
  const user = await userModel(database).create({
    emailNormalized: `${role}-${suffix}-${id.toString().slice(-8)}@example.test`,
    username: `${role}_${suffix}_${id.toString().slice(-7)}`.slice(0, 32),
    usernameNormalized: `${role}_${suffix}_${id.toString().slice(-7)}`.slice(0, 32).toLowerCase(),
    avatarId: 'mint',
    passwordHash: fixtureHash,
    globalRoles: [role],
    accountStatus: 'active',
    authVersion: 1,
    passwordChangedAt: new Date(currentTime),
  })
  owned.users.add(user._id.toString())
  return { id: user._id.toString() }
}

function adminActor() {
  return { id: admin.id }
}

function instructorActor() {
  return { id: instructor.id }
}

async function deactivateCohort(expectedRevision = 0) {
  return createAdminService(database, { now: () => currentTime }).updateCohort(
    adminActor(),
    cohort._id.toString(),
    { status: 'inactive', expectedRevision },
  )
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test')
    throw new Error('Lifecycle race integration requires NODE_ENV=test.')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guardTestDatabase()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Run lifecycle race integration with --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
  fixtureHash = await hashPassword(password)
})

beforeEach(async () => {
  guardTestDatabase()
  owned.users.clear()
  owned.institutions.clear()
  owned.cohorts.clear()
  currentTime = Date.now()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  ;[admin, instructor, student] = await Promise.all([
    createAccount('admin', suffix),
    createAccount('instructor', suffix),
    createAccount('student', suffix),
  ])
  institution = await institutionModel(database).create({
    name: `Lifecycle School ${suffix}`,
    slug: `lifecycle-${suffix}`,
    status: 'active',
  })
  owned.institutions.add(institution._id.toString())
  cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Lifecycle Class ${suffix}`,
    term: '2026 T2',
    status: 'active',
  })
  owned.cohorts.add(cohort._id.toString())
  await Promise.all([
    instructorAssignmentModel(database).create({
      userId: new Types.ObjectId(instructor.id),
      cohortId: cohort._id,
      status: 'active',
    }),
    membershipModel(database).create({
      userId: new Types.ObjectId(student.id),
      cohortId: cohort._id,
      status: 'active',
    }),
  ])
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
  await database.db.collection('password_resets').deleteMany({ userId: { $in: users } })
  await database.db.collection('audit_events').deleteMany({
    $or: [
      { actorId: { $in: users } },
      { targetId: { $in: users } },
      { scopeCohortId: { $in: cohorts } },
    ],
  })
  await database.db.collection('users').deleteMany({ _id: { $in: users } })
  await database.db.collection('cohorts').deleteMany({ _id: { $in: cohorts } })
  await database.db.collection('institutions').deleteMany({ _id: { $in: institutions } })
})

afterAll(async () => {
  await database?.close()
})

describe('institution and cohort lifecycle serialization', () => {
  it('reads and increments nonzero hidden recovery revisions on every guarded record', async () => {
    const Assignment = instructorAssignmentModel(database)
    const Membership = membershipModel(database)
    const assignment = await Assignment.findOne({
      userId: new Types.ObjectId(instructor.id),
      cohortId: cohort._id,
    }).lean()
    const membership = await Membership.findOne({
      userId: new Types.ObjectId(student.id),
      cohortId: cohort._id,
    }).lean()
    await Promise.all([
      database.db
        .collection('users')
        .updateMany(
          { _id: { $in: [new Types.ObjectId(instructor.id), new Types.ObjectId(student.id)] } },
          { $set: { recoveryRevision: 2 } },
        ),
      database.db
        .collection('institutions')
        .updateOne({ _id: institution._id }, { $set: { recoveryRevision: 2 } }),
      database.db
        .collection('cohorts')
        .updateOne({ _id: cohort._id }, { $set: { recoveryRevision: 2 } }),
      database.db
        .collection('instructor_assignments')
        .updateOne({ _id: assignment._id }, { $set: { recoveryRevision: 2 } }),
      database.db
        .collection('memberships')
        .updateOne({ _id: membership._id }, { $set: { recoveryRevision: 2 } }),
    ])
    const guards = createStudentRecoveryGuards(database)
    const scope = {
      issuerId: new Types.ObjectId(instructor.id),
      targetId: new Types.ObjectId(student.id),
      scopeCohortId: cohort._id,
    }
    const guardedRecords = [
      ['users', new Types.ObjectId(instructor.id)],
      ['users', new Types.ObjectId(student.id)],
      ['institutions', institution._id],
      ['cohorts', cohort._id],
      ['instructor_assignments', assignment._id],
      ['memberships', membership._id],
    ]
    for (const expectedRevision of [2, 3]) {
      const session = await database.startSession()
      try {
        await session.withTransaction(async () => {
          const eligibility = await guards.readEligibility(scope, session)
          expect([
            eligibility.issuer.recoveryRevision,
            eligibility.target.recoveryRevision,
            eligibility.institution.recoveryRevision,
            eligibility.cohort.recoveryRevision,
            eligibility.assignment.recoveryRevision,
            eligibility.membership.recoveryRevision,
          ]).toEqual(Array(6).fill(expectedRevision))
          await guards.acquireEligibility(eligibility, session)
        })
      } finally {
        await session.endSession()
      }
      const revisions = await Promise.all(
        guardedRecords.map(
          async ([collection, id]) =>
            (await database.db.collection(collection).findOne({ _id: id })).recoveryRevision,
        ),
      )
      expect(revisions).toEqual(Array(6).fill(expectedRevision + 1))
    }
  })

  it('does not commit an active child under an institution deactivated during child creation', async () => {
    const reachedCreateAudit = deferred()
    const releaseCreateAudit = deferred()
    const reachedDeactivateWrite = deferred()
    let blocked = false
    const audit = createAuditService(database, { now: () => currentTime })
    const creatingAdmin = createAdminService(database, {
      now: () => currentTime,
      recordAuditEvent: async (...args) => {
        if (args[0].eventType === 'admin.cohort.create' && !blocked) {
          blocked = true
          reachedCreateAudit.resolve()
          await releaseCreateAudit.promise
        }
        return audit.recordAuditEvent(...args)
      },
    })
    const Institution = institutionModel(database)
    const originalFindOneAndUpdate = Institution.findOneAndUpdate
    Institution.findOneAndUpdate = function (filter, update, options) {
      if (update?.$set?.status === 'inactive') reachedDeactivateWrite.resolve()
      return originalFindOneAndUpdate.call(this, filter, update, options)
    }
    const creation = creatingAdmin.createCohort(adminActor(), {
      institutionId: institution._id.toString(),
      name: 'Concurrent new class',
      term: '2026 T2',
    })
    const creationOutcome = creation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    await Promise.race([
      reachedCreateAudit.promise.then(() => 'barrier'),
      creationOutcome.then(() => 'settled'),
    ])
    const deactivation = createAdminService(database, { now: () => currentTime }).updateInstitution(
      adminActor(),
      institution._id.toString(),
      { status: 'inactive', expectedRevision: 0 },
    )
    const deactivationOutcome = deactivation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    try {
      await Promise.race([
        reachedDeactivateWrite.promise.then(() => 'barrier'),
        deactivationOutcome.then(() => 'settled'),
      ])
    } finally {
      releaseCreateAudit.resolve()
    }
    const outcomes = await Promise.all([creationOutcome, deactivationOutcome])
    Institution.findOneAndUpdate = originalFindOneAndUpdate
    const finalInstitution = await Institution.findById(institution._id).lean()
    const activeChildren = await cohortModel(database).countDocuments({
      institutionId: institution._id,
      status: 'active',
    })
    expect(finalInstitution.status === 'inactive' && activeChildren > 0).toBe(false)
    expect(outcomes.some(({ status }) => status === 'fulfilled')).toBe(true)
  })

  it('does not reactivate a child under an institution deactivated at the same time', async () => {
    await deactivateCohort(0)
    const reachedUpdateAudit = deferred()
    const releaseUpdateAudit = deferred()
    const reachedDeactivateWrite = deferred()
    let blocked = false
    const audit = createAuditService(database, { now: () => currentTime })
    const reactivatingAdmin = createAdminService(database, {
      now: () => currentTime,
      recordAuditEvent: async (...args) => {
        if (args[0].eventType === 'admin.cohort.reactivate' && !blocked) {
          blocked = true
          reachedUpdateAudit.resolve()
          await releaseUpdateAudit.promise
        }
        return audit.recordAuditEvent(...args)
      },
    })
    const Institution = institutionModel(database)
    const originalFindOneAndUpdate = Institution.findOneAndUpdate
    Institution.findOneAndUpdate = function (filter, update, options) {
      if (update?.$set?.status === 'inactive') reachedDeactivateWrite.resolve()
      return originalFindOneAndUpdate.call(this, filter, update, options)
    }
    const reactivation = reactivatingAdmin.updateCohort(adminActor(), cohort._id.toString(), {
      status: 'active',
      expectedRevision: 1,
    })
    const reactivationOutcome = reactivation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    await Promise.race([
      reachedUpdateAudit.promise.then(() => 'barrier'),
      reactivationOutcome.then(() => 'settled'),
    ])
    const deactivation = createAdminService(database, { now: () => currentTime }).updateInstitution(
      adminActor(),
      institution._id.toString(),
      { status: 'inactive', expectedRevision: 0 },
    )
    const deactivationOutcome = deactivation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    try {
      await Promise.race([
        reachedDeactivateWrite.promise.then(() => 'barrier'),
        deactivationOutcome.then(() => 'settled'),
      ])
    } finally {
      releaseUpdateAudit.resolve()
    }
    const outcomes = await Promise.all([reactivationOutcome, deactivationOutcome])
    Institution.findOneAndUpdate = originalFindOneAndUpdate
    const finalInstitution = await Institution.findById(institution._id).lean()
    const activeChildren = await cohortModel(database).countDocuments({
      institutionId: institution._id,
      status: 'active',
    })
    expect(finalInstitution.status === 'inactive' && activeChildren > 0).toBe(false)
    expect(outcomes.some(({ status }) => status === 'fulfilled')).toBe(true)
  })

  it('rechecks cohort eligibility after recovery issue guards are delayed', async () => {
    const reached = deferred()
    const release = deferred()
    const recovery = createRecoveryService(database, {
      now: () => currentTime,
      clientOrigin: 'http://localhost:5173',
      beforeRecoveryGuards: async ({ operation }) => {
        if (operation !== 'issue') return
        reached.resolve()
        await release.promise
      },
    })
    const pendingIssue = recovery.issueInstructorStudentReset(
      instructorActor(),
      cohort._id.toString(),
      student.id,
      resetPayload,
    )
    await reached.promise
    await deactivateCohort(0)
    release.resolve()
    await expect(pendingIssue).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
    expect(
      await database.db.collection('password_resets').countDocuments({
        userId: new Types.ObjectId(student.id),
        revokedAt: null,
        consumedAt: null,
      }),
    ).toBe(0)
  })

  it('rechecks cohort eligibility after recovery redemption guards are delayed', async () => {
    const issuer = createRecoveryService(database, {
      now: () => currentTime,
      clientOrigin: 'http://localhost:5173',
    })
    const issued = await issuer.issueInstructorStudentReset(
      instructorActor(),
      cohort._id.toString(),
      student.id,
      resetPayload,
    )
    const token = new URLSearchParams(new URL(issued.resetUrl).hash.slice(1)).get('token')
    const reached = deferred()
    const release = deferred()
    const recovery = createRecoveryService(database, {
      now: () => currentTime,
      clientOrigin: 'http://localhost:5173',
      beforeRecoveryGuards: async ({ operation }) => {
        if (operation !== 'redeem') return
        reached.resolve()
        await release.promise
      },
    })
    const pendingRedemption = recovery.resetStudentPassword({ token, password })
    await reached.promise
    await deactivateCohort(0)
    release.resolve()
    await expect(pendingRedemption).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' })
    expect(
      await database.db.collection('password_resets').countDocuments({
        userId: new Types.ObjectId(student.id),
        revokedAt: null,
        consumedAt: null,
      }),
    ).toBe(1)
  })

  it('leaves no active invitation code when issue and class deactivation overlap', async () => {
    const reachedIssueAudit = deferred()
    const releaseIssueAudit = deferred()
    const audit = createAuditService(database, { now: () => currentTime })
    const cohortService = createCohortService(database, {
      now: () => currentTime,
      recordAuditEvent: async (...args) => {
        if (args[0].eventType === 'cohort.code.issue') {
          reachedIssueAudit.resolve()
          await releaseIssueAudit.promise
        }
        return audit.recordAuditEvent(...args)
      },
    })
    const pendingIssue = cohortService.issueCode(instructorActor(), cohort._id.toString(), {
      expectedRevision: 0,
    })
    const issueOutcome = pendingIssue.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    await Promise.race([
      reachedIssueAudit.promise.then(() => 'barrier'),
      issueOutcome.then(() => 'settled'),
    ])
    const pendingDeactivation = deactivateCohort(0)
    const deactivationOutcome = pendingDeactivation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )
    releaseIssueAudit.resolve()
    const outcomes = await Promise.all([issueOutcome, deactivationOutcome])
    const finalCohort = await cohortModel(database).findById(cohort._id).lean()
    if (finalCohort.status === 'active') await deactivateCohort(finalCohort.adminRevision ?? 0)
    const code = await enrollmentCodeModel(database).findOne({ cohortId: cohort._id }).lean()
    expect(code === null || code.revokedAt instanceof Date).toBe(true)
    expect(outcomes.some(({ status }) => status === 'fulfilled')).toBe(true)
  })

  it('filters roster rows again after a class becomes inactive between access and aggregate', async () => {
    const Membership = membershipModel(database)
    const originalAggregate = Membership.aggregate
    const reachedAggregate = deferred()
    const releaseAggregate = deferred()
    Membership.aggregate = function (...args) {
      reachedAggregate.resolve()
      return releaseAggregate.promise.then(() => originalAggregate.apply(this, args))
    }
    const pendingRoster = createCohortService(database, { now: () => currentTime }).listMembers(
      instructorActor(),
      cohort._id.toString(),
    )
    try {
      await reachedAggregate.promise
      await deactivateCohort(0)
    } finally {
      releaseAggregate.resolve()
      Membership.aggregate = originalAggregate
    }
    const result = await pendingRoster
    expect(result.memberships).toEqual([])
    expect(result.total).toBe(0)
  })
})
