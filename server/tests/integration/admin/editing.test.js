import { randomUUID } from 'node:crypto'
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
import { enrollmentCodeModel } from '../../../src/modules/cohorts/enrollment-code-model.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

const owned = { users: new Set(), institutions: new Set(), cohorts: new Set() }
let database
let authOptions
let app
let admin
let student
let instructor
let unassignedInstructor
let origin

function guardTestDatabase() {
  if (process.env.NODE_ENV !== 'test' || !database?.name.endsWith('_test')) {
    throw new Error('Refusing admin editing fixtures outside a disposable _test database.')
  }
  assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
}

async function registerRole(role) {
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

async function createInstitution(agent = admin.agent, csrfToken = admin.csrfToken) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const response = await agent
    .post('/api/admin/institutions')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send({ name: `Synthetic Campus ${suffix}`, slug: `synthetic-${suffix}` })
    .expect(201)
  owned.institutions.add(response.body.id)
  return response.body
}

async function createCohort(institutionId, agent = admin.agent, csrfToken = admin.csrfToken) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const response = await agent
    .post('/api/admin/cohorts')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send({ institutionId, name: `WAD2 ${suffix}`, term: '2026 T2' })
    .expect(201)
  owned.cohorts.add(response.body.id)
  return response.body
}

function patchInstitution(id, body, agent = admin.agent, csrfToken = admin.csrfToken) {
  return agent
    .patch(`/api/admin/institutions/${id}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send(body)
}

function patchCohort(id, body, agent = admin.agent, csrfToken = admin.csrfToken) {
  return agent
    .patch(`/api/admin/cohorts/${id}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send(body)
}

beforeAll(async () => {
  if (process.env.SHARLOCK_TEST_REPLICA_SET !== '1') return
  const config = validateEnvironment(process.env)
  if (config.nodeEnv !== 'test') {
    throw new Error('Admin editing integration requires NODE_ENV=test.')
  }
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  guardTestDatabase()
  const topology = await database.db.admin().command({ hello: 1 })
  if (!topology.setName) throw new Error('Run admin editing integration with --replica-set.')
  await initializeCohortStorage(database)
  await initializeAuditStorage(database)
  await initializeRecoveryStorage(database)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  guardTestDatabase()
  owned.users.clear()
  owned.institutions.clear()
  owned.cohorts.clear()
  app = createTestApp(database, authOptions, { audit: { now: Date.now }, admin: { now: Date.now } })
  origin = authOptions.clientOrigin
  admin = await registerRole('admin')
  student = await registerRole('student')
  instructor = await registerRole('instructor')
  unassignedInstructor = await registerRole('instructor')
})

afterEach(async () => {
  if (!database) return
  guardTestDatabase()
  const users = [...owned.users].map((id) => new Types.ObjectId(id))
  const institutions = [...owned.institutions].map((id) => new Types.ObjectId(id))
  const cohorts = [...owned.cohorts].map((id) => new Types.ObjectId(id))
  await database.db.collection('enrollment_codes').deleteMany({ cohortId: { $in: cohorts } })
  await database.db.collection('memberships').deleteMany({ cohortId: { $in: cohorts } })
  await database.db.collection('instructor_assignments').deleteMany({
    $or: [{ userId: { $in: users } }, { cohortId: { $in: cohorts } }],
  })
  await database.db.collection('audit_events').deleteMany({
    $or: [
      { actorId: { $in: users } },
      { targetId: { $in: users } },
      { targetId: { $in: institutions } },
      { targetId: { $in: cohorts } },
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

describe.skipIf(process.env.SHARLOCK_TEST_REPLICA_SET !== '1')(
  'admin institution and class editing API',
  () => {
    it(
      'requires administrator access and rejects changes to institution slugs and class parents',
      async () => {
        const institution = await createInstitution()
        const cohort = await createCohort(institution.id)
        const otherInstitution = await createInstitution()

        await request(app).patch(`/api/admin/institutions/${institution.id}`).expect(401)
        await patchInstitution(
          institution.id,
          { name: 'Student edit', expectedRevision: 0 },
          student.agent,
          student.csrfToken,
        ).expect(403)
        await patchInstitution(institution.id, {
          name: institution.name,
          status: institution.status,
          slug: 'changed-slug',
          expectedRevision: 0,
        }).expect(400)
        await patchCohort(cohort.id, {
          name: cohort.name,
          term: cohort.term,
          status: cohort.status,
          institutionId: otherInstitution.id,
          expectedRevision: 0,
        }).expect(400)

        const savedInstitution = await institutionModel(database).findById(institution.id).lean()
        const savedCohort = await cohortModel(database).findById(cohort.id).lean()
        expect(savedInstitution).toMatchObject({ name: institution.name, slug: institution.slug })
        expect(savedCohort.institutionId.toString()).toBe(institution.id)
      },
    )

    it(
      'applies partial edits with legacy revisions and rejects stale writes',
      async () => {
        const institution = await createInstitution()
        const cohort = await createCohort(institution.id)
        await institutionModel(database).updateOne(
          { _id: new Types.ObjectId(institution.id) },
          { $unset: { adminRevision: '' } },
        )
        await cohortModel(database).updateOne(
          { _id: new Types.ObjectId(cohort.id) },
          { $unset: { adminRevision: '' } },
        )

        const renamed = await patchInstitution(institution.id, {
          name: 'Renamed Synthetic Campus',
          expectedRevision: 0,
        }).expect(200)
        expect(renamed.body).toMatchObject({
          institution: {
            id: institution.id,
            name: 'Renamed Synthetic Campus',
            slug: institution.slug,
            revision: 1,
          },
        })
        await patchInstitution(institution.id, { status: 'inactive', expectedRevision: 0 })
          .expect(409)
          .then(({ body }) => expect(body.error.code).toBe('ADMIN_STALE_INSTITUTION'))

        const termed = await patchCohort(cohort.id, {
          term: '2027 T1',
          expectedRevision: 0,
        }).expect(200)
        expect(termed.body).toMatchObject({
          cohort: {
            id: cohort.id,
            institutionId: institution.id,
            name: cohort.name,
            term: '2027 T1',
            status: 'active',
            revision: 1,
          },
        })
        await patchCohort(cohort.id, { status: 'inactive', expectedRevision: 0 })
          .expect(409)
          .then(({ body }) => expect(body.error.code).toBe('ADMIN_STALE_COHORT'))
      },
    )

    it(
      'assigns multiple eligible sibling classes in one revision-checked replacement',
      async () => {
        const institution = await createInstitution()
        const firstCohort = await createCohort(institution.id)
        const secondCohort = await createCohort(institution.id)

        const assigned = await admin.agent
          .put(`/api/admin/instructors/${instructor.user.id}/assignments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ cohortIds: [firstCohort.id, secondCohort.id], expectedRevision: 0 })
          .expect(200)
        expect(assigned.body.instructor).toMatchObject({
          cohortIds: [firstCohort.id, secondCohort.id],
          assignmentRevision: 1,
        })

        const rows = await instructorAssignmentModel(database)
          .find({ userId: new Types.ObjectId(instructor.user.id), status: 'active' })
          .select('cohortId')
          .lean()
        expect(rows.map(({ cohortId }) => cohortId.toString()).sort()).toEqual(
          [firstCohort.id, secondCohort.id].sort(),
        )
      },
    )

    it(
      'preserves class history and enforces parent and reactivation rules',
      async () => {
        const institution = await createInstitution()
        const cohort = await createCohort(institution.id)
        await membershipModel(database).create({
          userId: new Types.ObjectId(student.user.id),
          cohortId: new Types.ObjectId(cohort.id),
          status: 'active',
          decision: 'approved',
          approvedAt: new Date(),
          approvedBy: new Types.ObjectId(admin.user.id),
        })

        const assigned = await admin.agent
          .put(`/api/admin/instructors/${instructor.user.id}/assignments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ cohortIds: [cohort.id], expectedRevision: 0 })
          .expect(200)
        expect(assigned.body.instructor).toMatchObject({
          cohortIds: [cohort.id],
          assignmentRevision: 1,
        })
        await admin.agent
          .put(`/api/admin/instructors/${instructor.user.id}/assignments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ cohortIds: [], expectedRevision: 0 })
          .expect(409)

        const issued = await instructor.agent
          .post(`/api/cohorts/${cohort.id}/enrollment-codes`)
          .set('Origin', origin)
          .set('X-CSRF-Token', instructor.csrfToken)
          .send({ expectedRevision: 0 })
          .expect(201)

        await patchInstitution(institution.id, { status: 'inactive', expectedRevision: 0 })
          .expect(409)
          .then(({ body }) => expect(body.error.code).toBe('ADMIN_INSTITUTION_HAS_CLASSES'))
        await patchCohort(cohort.id, { status: 'inactive', expectedRevision: 0 }).expect(200)

        const membership = await membershipModel(database)
          .findOne({
            userId: new Types.ObjectId(student.user.id),
            cohortId: new Types.ObjectId(cohort.id),
          })
          .lean()
        const assignment = await instructorAssignmentModel(database)
          .findOne({
            userId: new Types.ObjectId(instructor.user.id),
            cohortId: new Types.ObjectId(cohort.id),
          })
          .lean()
        const revoked = await enrollmentCodeModel(database)
          .findOne({ cohortId: new Types.ObjectId(cohort.id) })
          .lean()
        expect(membership).toMatchObject({ status: 'active', decision: 'approved' })
        expect(assignment).toMatchObject({ status: 'active' })
        expect(revoked).toMatchObject({
          revokedAt: expect.any(Date),
          revision: issued.body.revision + 1,
        })

        const instructors = await admin.agent
          .get('/api/admin/instructors')
          .set('Origin', origin)
          .expect(200)
        const instructorDto = instructors.body.instructors.find(
          ({ id }) => id === instructor.user.id,
        )
        expect(instructorDto.cohortIds).toEqual([cohort.id])
        expect(instructorDto.assignedCohorts).toMatchObject([
          {
            id: cohort.id,
            institutionId: institution.id,
            institutionStatus: 'active',
            name: cohort.name,
            term: cohort.term,
            status: 'inactive',
          },
        ])
        expect(JSON.stringify(instructorDto)).not.toMatch(/recoveryRevision|passwordHash|tokenHash/)

        const retained = await admin.agent
          .put(`/api/admin/instructors/${instructor.user.id}/assignments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ cohortIds: [cohort.id], expectedRevision: 1 })
          .expect(200)
        expect(retained.body.instructor).toMatchObject({
          cohortIds: [cohort.id],
          assignmentRevision: 2,
        })
        await admin.agent
          .put(`/api/admin/instructors/${unassignedInstructor.user.id}/assignments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ cohortIds: [cohort.id], expectedRevision: 0 })
          .expect(404)

        await patchInstitution(institution.id, {
          status: 'inactive',
          expectedRevision: 0,
        }).expect(200)
        await patchCohort(cohort.id, { status: 'active', expectedRevision: 1 }).expect(404)
        const rejectedCreation = await admin.agent
          .post('/api/admin/cohorts')
          .set('Origin', origin)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ institutionId: institution.id, name: 'Blocked class', term: '2027 T1' })
          .expect(404)
        expect(rejectedCreation.body.error.code).toBe('ADMIN_NOT_FOUND')
        const inactiveParentListing = await admin.agent
          .get('/api/admin/cohorts')
          .query({ institutionId: institution.id })
          .set('Origin', origin)
          .expect(200)
        expect(inactiveParentListing.body.cohorts).toContainEqual(
          expect.objectContaining({
            id: cohort.id,
            status: 'inactive',
            institutionStatus: 'inactive',
          }),
        )

        await patchInstitution(institution.id, {
          status: 'active',
          expectedRevision: 1,
        }).expect(200)
        const afterParentReactivation = await admin.agent
          .get('/api/admin/cohorts')
          .query({ institutionId: institution.id })
          .set('Origin', origin)
          .expect(200)
        expect(afterParentReactivation.body.cohorts).toContainEqual(
          expect.objectContaining({
            id: cohort.id,
            status: 'inactive',
            institutionStatus: 'active',
          }),
        )
        await patchCohort(cohort.id, { status: 'active', expectedRevision: 1 }).expect(200)

        const renewed = await instructor.agent
          .post(`/api/cohorts/${cohort.id}/enrollment-codes`)
          .set('Origin', origin)
          .set('X-CSRF-Token', instructor.csrfToken)
          .send({ expectedRevision: revoked.revision })
          .expect(201)
        expect(renewed.body.rawCode).not.toBe(issued.body.rawCode)
        expect(renewed.body.revision).toBe(revoked.revision + 1)
      },
    )
  },
)
