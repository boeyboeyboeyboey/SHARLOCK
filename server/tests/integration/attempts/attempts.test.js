import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { attemptModel } from '../../../src/modules/attempts/model.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'
import { createSyntheticAttemptRegistry, syntheticGameId } from './helpers.js'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'

const password = 'Synthetic-Test-Password-2026'
const owned = {
  users: new Set(),
  attempts: new Set(),
  institutions: new Set(),
  cohorts: new Set(),
  memberships: new Set(),
  assignments: new Set(),
}

let database
let baseAuthOptions
let authOptions
let app
let registry
let currentTime
let origin

function remember(collection, id) {
  owned[collection].add(id.toString())
}

function idValues(collection) {
  return [...owned[collection]].map((id) => new Types.ObjectId(id))
}

function testNow() {
  return () => currentTime
}

function createFeatureOptions() {
  return { attempts: { registry, now: testNow() } }
}

function createAppForRegistry(targetRegistry) {
  return createTestApp(
    database,
    { ...baseAuthOptions, now: testNow() },
    { attempts: { registry: targetRegistry, now: testNow() } },
  )
}

function createCurrentApp() {
  authOptions = { ...baseAuthOptions, now: testNow() }
  app = createTestApp(database, authOptions, createFeatureOptions())
  origin = authOptions.clientOrigin
  return app
}

async function createStudent(targetApp = app) {
  const student = await registerTestStudent(targetApp)
  remember('users', student.user.id)
  return student
}

async function loginStudent(targetApp, student) {
  const agent = request.agent(targetApp)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: student.email, password })
    .expect(200)
  return { agent, csrfToken: response.body.csrfToken }
}

async function createClass({
  userId,
  status = 'active',
  instructor = false,
  institutionStatus = 'active',
  cohortStatus = 'active',
}) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institution = await institutionModel(database).create({
    name: `Attempt School ${suffix}`,
    slug: `attempt-${suffix}`,
    status: institutionStatus,
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Attempt Class ${suffix}`,
    term: '2026 T2',
    status: cohortStatus,
  })
  remember('institutions', institution._id)
  remember('cohorts', cohort._id)

  if (instructor) {
    const assignment = await instructorAssignmentModel(database).create({
      userId: new Types.ObjectId(userId),
      cohortId: cohort._id,
      status,
    })
    remember('assignments', assignment._id)
    return { cohort, assignment }
  }

  const membership = await membershipModel(database).create({
    userId: new Types.ObjectId(userId),
    cohortId: cohort._id,
    status,
  })
  remember('memberships', membership._id)
  return { cohort, membership }
}

function startRequest(student, body = { context: { kind: 'personal' } }, gameId = syntheticGameId) {
  return student.agent
    .post(`/api/games/${gameId}/attempts`)
    .set('Origin', origin)
    .set('X-CSRF-Token', student.csrfToken)
    .send(body)
}

function actionRequest(student, attemptId, action) {
  return student.agent
    .post(`/api/attempts/${attemptId}/actions`)
    .set('Origin', origin)
    .set('X-CSRF-Token', student.csrfToken)
    .send(action)
}

function completeRequest(student, attemptId, action) {
  return student.agent
    .post(`/api/attempts/${attemptId}/complete`)
    .set('Origin', origin)
    .set('X-CSRF-Token', student.csrfToken)
    .send(action)
}

async function createAttempt(student, context = { kind: 'personal' }) {
  const response = await startRequest(student, { context }).expect(201)
  remember('attempts', response.body.attemptId)
  return response.body
}

async function answerAttempt(student, attempt, correct = true) {
  return actionRequest(student, attempt.attemptId, {
    actionId: randomUUID(),
    expectedRevision: 0,
    type: 'answer',
    payload: { correct },
  }).expect(200)
}

async function finishAttempt(student, attemptId, expectedRevision = 1, actionId = randomUUID()) {
  return completeRequest(student, attemptId, { actionId, expectedRevision }).expect(200)
}

async function createInstructor() {
  const account = await createStudent()
  await userModel(database).updateOne(
    { _id: new Types.ObjectId(account.user.id) },
    { $set: { globalRoles: ['instructor'] } },
  )
  account.user.globalRoles = ['instructor']
  return account
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') {
    throw new Error('Attempt integration tests require NODE_ENV=test.')
  }
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  baseAuthOptions = await initializeTestAuth(database, config)
  await initializeCohortStorage(database)
  registry = createSyntheticAttemptRegistry()
  await initializeAttemptStorage(database, registry)
})

beforeEach(() => {
  for (const ids of Object.values(owned)) ids.clear()
  currentTime = Date.now()
  createCurrentApp()
})

afterEach(async () => {
  if (database) {
    assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
    const attempts = idValues('attempts')
    const users = idValues('users')
    const cohorts = idValues('cohorts')
    const institutions = idValues('institutions')
    const memberships = idValues('memberships')
    const assignments = idValues('assignments')
    if (attempts.length)
      await database.db.collection('game_attempts').deleteMany({ _id: { $in: attempts } })
    if (memberships.length)
      await database.db.collection('memberships').deleteMany({ _id: { $in: memberships } })
    if (assignments.length) {
      await database.db
        .collection('instructor_assignments')
        .deleteMany({ _id: { $in: assignments } })
    }
    if (users.length) {
      await database.db
        .collection('auth_sessions')
        .deleteMany({ 'session.userId': { $in: users.map(String) } })
      await database.db.collection('users').deleteMany({ _id: { $in: users } })
    }
    if (cohorts.length)
      await database.db.collection('cohorts').deleteMany({ _id: { $in: cohorts } })
    if (institutions.length) {
      await database.db.collection('institutions').deleteMany({ _id: { $in: institutions } })
    }
  }
  await disposeTestAuthApps()
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('saved attempt API', () => {
  it('applies injected start limits per ip and answers 429 once they are spent', async () => {
    app = createTestApp(
      database,
      { ...baseAuthOptions, now: testNow() },
      { attempts: { registry, now: testNow(), limits: { startIp: 1 } } },
    )
    const first = await createStudent()
    const second = await createStudent()
    await createAttempt(first)
    const limited = await startRequest(second).expect(429)
    expect(limited.headers['ratelimit-policy']).toMatch(/^1;w=900/)
  })

  it('requires a live session and mutation checks, rejects extra fields, and returns only public state', async () => {
    const student = await createStudent()
    const anonymous = request(app)
    const unauthenticated = await anonymous.get(`/api/attempts/${new Types.ObjectId()}`).expect(401)
    expect(unauthenticated.headers['cache-control']).toBe('no-store')

    const missingCsrf = await student.agent
      .post(`/api/games/${syntheticGameId}/attempts`)
      .set('Origin', origin)
      .send({ context: { kind: 'personal' } })
      .expect(403)
    expect(missingCsrf.body.error.code).toBe('CSRF_INVALID')

    const wrongOrigin = await startRequest(student)
      .set('Origin', 'http://untrusted.example')
      .expect(403)
    expect(wrongOrigin.body.error.code).toBe('ORIGIN_FORBIDDEN')

    await startRequest(student, { context: { kind: 'personal' }, score: 10 }).expect(400)
    await startRequest(student, {
      context: { kind: 'personal', cohortId: new Types.ObjectId().toString() },
    }).expect(400)
    await startRequest(student).query({ rulesetVersion: 'forged' }).expect(400)
    const unsupported = await startRequest(student, undefined, 'unregistered-game').expect(404)
    expect(unsupported.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const malformed = await request(app)
      .post(`/api/games/${syntheticGameId}/attempts`)
      .set('Content-Type', 'application/json')
      .send('{"context":')
      .expect(400)
    expect(malformed.body.error.code).toBe('INVALID_JSON')
    const oversized = await request(app)
      .post('/api/unrelated')
      .set('Content-Type', 'application/json')
      .send(`{"payload":"${'x'.repeat(17 * 1024)}"}`)
      .expect(413)
    expect(oversized.body.error.code).toBe('BODY_TOO_LARGE')

    const started = await createAttempt(student)
    expect(started).toMatchObject({
      gameId: syntheticGameId,
      rulesetVersion: 'fixture-1',
      context: { kind: 'personal', cohortId: null },
      mode: 'standard',
      status: 'active',
      revision: 0,
      score: 0,
      maxScore: 10,
      persisted: true,
      publicState: { round: 0 },
      completedAt: null,
    })
    expect(started).not.toHaveProperty('feedback')
    expect(started).not.toHaveProperty('topicOutcomes')
    expect(JSON.stringify(started)).not.toContain('synthetic-private-answer')
    const persistedStarted = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(persistedStarted.state.secret).toBe('synthetic-private-answer')
    expect(persistedStarted.competitiveEligible).toBe(false)

    const missingActionCsrf = await student.agent
      .post(`/api/attempts/${started.attemptId}/actions`)
      .set('Origin', origin)
      .send({
        actionId: randomUUID(),
        expectedRevision: 0,
        type: 'answer',
        payload: { correct: true },
      })
      .expect(403)
    expect(missingActionCsrf.body.error.code).toBe('CSRF_INVALID')
    const missingCompleteCsrf = await student.agent
      .post(`/api/attempts/${started.attemptId}/complete`)
      .set('Origin', origin)
      .send({ actionId: randomUUID(), expectedRevision: 0 })
      .expect(403)
    expect(missingCompleteCsrf.body.error.code).toBe('CSRF_INVALID')
    const wrongActionOrigin = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    })
      .set('Origin', 'http://untrusted.example')
      .expect(403)
    expect(wrongActionOrigin.body.error.code).toBe('ORIGIN_FORBIDDEN')
    const wrongCompleteOrigin = await completeRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
    })
      .set('Origin', 'http://untrusted.example')
      .expect(403)
    expect(wrongCompleteOrigin.body.error.code).toBe('ORIGIN_FORBIDDEN')
    await student.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .query({ debug: 'true' })
      .expect(400)

    const invalidAction = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
      score: 999,
    }).expect(400)
    expect(invalidAction.body.error.code).toBe('ATTEMPT_INVALID_REQUEST')
    const invalidPayload = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true, note: 'forged' },
    }).expect(400)
    expect(invalidPayload.body.error.code).toBe('ATTEMPT_INVALID_REQUEST')
    await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    })
      .query({ score: '10' })
      .expect(400)
    await student.agent
      .post(`/api/attempts/${started.attemptId}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .query({ score: '10' })
      .send({ actionId: randomUUID(), expectedRevision: 0 })
      .expect(400)
    const invalidCompletion = await completeRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      score: 999,
    }).expect(400)
    expect(invalidCompletion.body.error.code).toBe('ATTEMPT_INVALID_REQUEST')
  })

  it('stores completion, replays canonical action receipts, and survives app recreation', async () => {
    const student = await createStudent()
    const started = await createAttempt(student)
    const actionId = randomUUID()
    const action = {
      actionId,
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }
    const applied = await actionRequest(student, started.attemptId, action).expect(200)
    expect(applied.body).toMatchObject({ revision: 1, status: 'active', publicState: { round: 1 } })
    expect(JSON.stringify(applied.body)).not.toContain('synthetic-private-answer')

    const replay = await actionRequest(student, started.attemptId, {
      actionId,
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(200)
    expect(replay.body).toEqual(applied.body)
    expect(JSON.stringify(replay.body)).not.toContain('synthetic-private-answer')

    const changedUse = await actionRequest(student, started.attemptId, {
      ...action,
      expectedRevision: 1,
      payload: { correct: false },
    }).expect(409)
    expect(changedUse.body.error.code).toBe('ATTEMPT_ACTION_CONFLICT')

    const completionId = randomUUID()
    const completed = await finishAttempt(student, started.attemptId, 1, completionId)
    expect(completed.body).toMatchObject({
      status: 'completed',
      revision: 2,
      score: 10,
      feedback: { code: 'FIXTURE_COMPLETE' },
      topicOutcomes: [{ topic: 'contract', achieved: true, feedbackCode: 'FIXTURE_RESULT' }],
    })
    expect(JSON.stringify(completed.body)).not.toContain('synthetic-private-answer')

    const replayedCompletion = await finishAttempt(student, started.attemptId, 0, completionId)
    expect(replayedCompletion.body).toEqual(completed.body)
    const repeatedCompletion = await finishAttempt(student, started.attemptId, 0, randomUUID())
    expect(repeatedCompletion.body).toEqual(completed.body)
    expect(JSON.stringify(repeatedCompletion.body)).not.toContain('synthetic-private-answer')

    const recreatedApp = createTestApp(
      database,
      { ...baseAuthOptions, now: testNow() },
      createFeatureOptions(),
    )
    const restoredStudent = await loginStudent(recreatedApp, student)
    const restored = await restoredStudent.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(restored.body).toEqual(completed.body)
    expect(JSON.stringify(restored.body)).not.toContain('synthetic-private-answer')
    expect(restored.headers['cache-control']).toBe('no-store')
  })

  it('keeps completed snapshots readable with an explicitly empty registry', async () => {
    const student = await createStudent()
    const started = await createAttempt(student)
    await answerAttempt(student, started)
    const completed = await finishAttempt(student, started.attemptId)

    const emptyRegistryApp = createAppForRegistry(createAttemptRegistry())
    const restoredStudent = await loginStudent(emptyRegistryApp, student)
    const publicStart = await startRequest(restoredStudent).expect(404)
    expect(publicStart.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const retainedResult = await restoredStudent.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(retainedResult.body).toEqual(completed.body)
  })

  it('limits access to the owner and rechecks current class membership on each active request', async () => {
    const student = await createStudent()
    const foreignStudent = await createStudent()
    const instructor = await createInstructor()
    const { cohort, membership } = await createClass({ userId: student.user.id })
    const context = { kind: 'cohort', cohortId: cohort._id.toString() }
    const completedClassAttempt = await createAttempt(student, context)
    const storedStudentAttempt = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(completedClassAttempt.attemptId),
    })
    expect(storedStudentAttempt.competitiveEligible).toBe(true)
    await answerAttempt(student, completedClassAttempt)
    await finishAttempt(student, completedClassAttempt.attemptId)
    const activeClassAttempt = await createAttempt(student, context)

    const foreignRead = await foreignStudent.agent
      .get(`/api/attempts/${completedClassAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(404)
    expect(foreignRead.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const staffRead = await instructor.agent
      .get(`/api/attempts/${completedClassAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(404)
    expect(staffRead.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const foreignAction = await actionRequest(foreignStudent, completedClassAttempt.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(404)
    expect(foreignAction.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const foreignCompletion = await completeRequest(
      foreignStudent,
      completedClassAttempt.attemptId,
      {
        actionId: randomUUID(),
        expectedRevision: 0,
      },
    ).expect(404)
    expect(foreignCompletion.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const ownAttemptAfterForeignRequests = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(completedClassAttempt.attemptId),
    })
    expect(ownAttemptAfterForeignRequests.revision).toBe(2)
    const staffAction = await actionRequest(instructor, completedClassAttempt.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(404)
    expect(staffAction.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const staffCompletion = await completeRequest(instructor, completedClassAttempt.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
    }).expect(404)
    expect(staffCompletion.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    const ownAttemptAfterDeniedMutations = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(completedClassAttempt.attemptId),
    })
    expect(ownAttemptAfterDeniedMutations.revision).toBe(2)

    await membershipModel(database).updateOne(
      { _id: membership._id },
      { $set: { status: 'removed' } },
    )

    const retainedResult = await student.agent
      .get(`/api/attempts/${completedClassAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(retainedResult.body.status).toBe('completed')
    const deniedActiveRead = await student.agent
      .get(`/api/attempts/${activeClassAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(404)
    expect(deniedActiveRead.body.error.code).toBe('COHORT_NOT_FOUND')
    const deniedMutation = await actionRequest(student, activeClassAttempt.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(404)
    expect(deniedMutation.body.error.code).toBe('COHORT_NOT_FOUND')

    const assignedInstructor = await createInstructor()
    const { cohort: instructorCohort, assignment } = await createClass({
      userId: assignedInstructor.user.id,
      instructor: true,
    })
    const instructorContext = {
      kind: 'cohort',
      cohortId: instructorCohort._id.toString(),
    }
    const instructorCompletedAttempt = await createAttempt(assignedInstructor, instructorContext)
    const storedInstructorAttempt = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(instructorCompletedAttempt.attemptId),
    })
    expect(storedInstructorAttempt.competitiveEligible).toBe(false)
    await answerAttempt(assignedInstructor, instructorCompletedAttempt)
    await finishAttempt(assignedInstructor, instructorCompletedAttempt.attemptId)
    const instructorActiveAttempt = await createAttempt(assignedInstructor, instructorContext)
    await instructorAssignmentModel(database).updateOne(
      { _id: assignment._id },
      { $set: { status: 'removed' } },
    )
    const retainedInstructorResult = await assignedInstructor.agent
      .get(`/api/attempts/${instructorCompletedAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(retainedInstructorResult.body.status).toBe('completed')
    const deniedInstructorAttempt = await assignedInstructor.agent
      .get(`/api/attempts/${instructorActiveAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(404)
    expect(deniedInstructorAttempt.body.error.code).toBe('COHORT_NOT_FOUND')
  })

  it('rejects pending memberships and inactive accounts, and never writes when GET crosses the deadline', async () => {
    const student = await createStudent()
    const { cohort } = await createClass({ userId: student.user.id, status: 'pending' })
    const pending = await startRequest(student, {
      context: { kind: 'cohort', cohortId: cohort._id.toString() },
    }).expect(404)
    expect(pending.body.error.code).toBe('COHORT_NOT_FOUND')
    const { cohort: inactiveParentCohort } = await createClass({
      userId: student.user.id,
      institutionStatus: 'inactive',
    })
    const inactiveParent = await startRequest(student, {
      context: { kind: 'cohort', cohortId: inactiveParentCohort._id.toString() },
    }).expect(404)
    expect(inactiveParent.body.error.code).toBe('COHORT_NOT_FOUND')

    const started = await createAttempt(student)
    currentTime += 60_000
    const deadlineAction = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(409)
    expect(deadlineAction.body.error.code).toBe('ATTEMPT_DEADLINE_PASSED')
    const lateRead = await student.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(lateRead.body).toMatchObject({ status: 'active', revision: 0, completedAt: null })
    const latest = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(latest).toMatchObject({ status: 'active', revision: 0, completedAt: null })

    const completed = await finishAttempt(student, started.attemptId, 0)
    expect(completed.body).toMatchObject({ status: 'completed', revision: 1, score: 0 })

    await userModel(database).updateOne(
      { _id: new Types.ObjectId(student.user.id) },
      { $set: { accountStatus: 'disabled' } },
    )
    const inactiveSession = await student.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .expect(401)
    expect(inactiveSession.body.error.code).toBe('AUTHENTICATION_REQUIRED')

    const staleVersionStudent = await createStudent()
    const staleVersionAttempt = await createAttempt(staleVersionStudent)
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(staleVersionStudent.user.id) },
      { $inc: { authVersion: 1 } },
    )
    const staleVersionRead = await staleVersionStudent.agent
      .get(`/api/attempts/${staleVersionAttempt.attemptId}`)
      .set('Origin', origin)
      .expect(401)
    expect(staleVersionRead.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('allows only one concurrent action revision and keeps completion idempotent', async () => {
    const student = await createStudent()
    const started = await createAttempt(student)
    const firstId = randomUUID()
    const secondId = randomUUID()
    const responses = await Promise.all([
      actionRequest(student, started.attemptId, {
        actionId: firstId,
        expectedRevision: 0,
        type: 'answer',
        payload: { correct: true },
      }),
      actionRequest(student, started.attemptId, {
        actionId: secondId,
        expectedRevision: 0,
        type: 'answer',
        payload: { correct: false },
      }),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    const failed = responses.find((response) => response.status === 409)
    expect(failed.body.error.code).toBe('ATTEMPT_STALE_REVISION')
    const winner = responses.find((response) => response.status === 200)
    expect(winner.body.revision).toBe(1)

    const completions = await Promise.all([
      finishAttempt(student, started.attemptId, 1, randomUUID()),
      finishAttempt(student, started.attemptId, 1, randomUUID()),
    ])
    expect(completions[0].body).toEqual(completions[1].body)
    expect(completions[0].body.status).toBe('completed')

    const retryAttempt = await createAttempt(student)
    const sharedAction = {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }
    const sharedActionResponses = await Promise.all([
      actionRequest(student, retryAttempt.attemptId, sharedAction),
      actionRequest(student, retryAttempt.attemptId, sharedAction),
    ])
    expect(sharedActionResponses.map((response) => response.status)).toEqual([200, 200])
    expect(sharedActionResponses[0].body).toEqual(sharedActionResponses[1].body)
    const afterSameActionRace = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(retryAttempt.attemptId),
    })
    expect(afterSameActionRace.revision).toBe(1)
    expect(afterSameActionRace.processedActions).toHaveLength(1)
  })

  it('keeps terminal receipts beyond the gameplay action limit and replays old actions', async () => {
    const limitedRegistry = createSyntheticAttemptRegistry({ maxActions: 1 })
    const limitedApp = createAppForRegistry(limitedRegistry)
    const student = await createStudent(limitedApp)
    const started = await createAttempt(student)
    const actionId = randomUUID()
    const action = {
      actionId,
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }
    const applied = await actionRequest(student, started.attemptId, action).expect(200)
    const replay = await actionRequest(student, started.attemptId, {
      ...action,
      expectedRevision: 0,
    }).expect(200)
    expect(replay.body).toEqual(applied.body)

    const rejected = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 1,
      type: 'answer',
      payload: { correct: false },
    }).expect(409)
    expect(rejected.body.error.code).toBe('ATTEMPT_ACTION_LIMIT')

    const completed = await finishAttempt(student, started.attemptId, 1)
    expect(completed.body.status).toBe('completed')
    const replayAfterCompletion = await actionRequest(student, started.attemptId, {
      ...action,
      expectedRevision: 0,
    }).expect(200)
    expect(replayAfterCompletion.body).toEqual(applied.body)
    const stored = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(stored.processedActions).toHaveLength(2)
  })

  it('reserves enough document bytes for completion after large public receipts', async () => {
    const publicText = 'x'.repeat(100_000)
    const largeRegistry = createSyntheticAttemptRegistry({
      maxActions: 255,
      overrides: {
        serializePublicState(state) {
          return { round: state.round, publicText }
        },
      },
    })
    const largeApp = createAppForRegistry(largeRegistry)
    const student = await createStudent(largeApp)
    const started = await createAttempt(student)
    expect(started.publicState.publicText).toHaveLength(publicText.length)

    let revision = 0
    let rejectedAction
    let beforeRejectedAction
    let actionCount = 0
    while (actionCount < 60) {
      const action = {
        actionId: randomUUID(),
        expectedRevision: revision,
        type: 'answer',
        payload: { correct: true },
      }
      const before = await database.db.collection('game_attempts').findOne({
        _id: new Types.ObjectId(started.attemptId),
      })
      const response = await actionRequest(student, started.attemptId, action)
      actionCount += 1
      if (response.status !== 200) {
        rejectedAction = response
        beforeRejectedAction = before
        break
      }
      revision = response.body.revision
    }

    expect(rejectedAction).toBeDefined()
    expect(actionCount).toBeLessThanOrEqual(60)
    expect(rejectedAction.status).toBe(409)
    expect(rejectedAction.body.error.code).toBe('ATTEMPT_ACTION_LIMIT')
    const afterRejectedAction = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(afterRejectedAction.revision).toBe(beforeRejectedAction.revision)
    expect(afterRejectedAction.state).toEqual(beforeRejectedAction.state)
    expect(afterRejectedAction.processedActions).toEqual(beforeRejectedAction.processedActions)

    const completed = await finishAttempt(student, started.attemptId, revision)
    expect(completed.body).toMatchObject({ status: 'completed', revision: revision + 1 })
    expect(completed.body.publicState.publicText).toHaveLength(publicText.length)
    const storedCompleted = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(storedCompleted.status).toBe('completed')
    expect(storedCompleted.processedActions).toHaveLength(revision + 1)
  })

  it('abandons without a result, replays once, and uses the terminal slot at the gameplay cap', async () => {
    const limitedRegistry = createSyntheticAttemptRegistry({ maxActions: 1 })
    const limitedApp = createAppForRegistry(limitedRegistry)
    const student = await createStudent(limitedApp)
    const started = await createAttempt(student)
    const abandonId = randomUUID()
    const abandon = {
      actionId: abandonId,
      expectedRevision: 0,
      type: 'abandon',
      payload: {},
    }
    const abandoned = await actionRequest(student, started.attemptId, abandon).expect(200)
    expect(abandoned.body).toMatchObject({
      status: 'abandoned',
      revision: 1,
      completedAt: null,
      score: 0,
    })
    expect(abandoned.body).not.toHaveProperty('feedback')
    expect(abandoned.body).not.toHaveProperty('topicOutcomes')
    const replay = await actionRequest(student, started.attemptId, {
      ...abandon,
      expectedRevision: 0,
    }).expect(200)
    expect(replay.body).toEqual(abandoned.body)
    const rejectedAction = await actionRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 1,
      type: 'answer',
      payload: { correct: true },
    }).expect(409)
    expect(rejectedAction.body.error.code).toBe('ATTEMPT_CLOSED')
    const rejectedCompletion = await completeRequest(student, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 1,
    }).expect(409)
    expect(rejectedCompletion.body.error.code).toBe('ATTEMPT_CLOSED')
    const storedAbandoned = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(storedAbandoned.processedActions).toHaveLength(1)
    expect(storedAbandoned.processedActions[0].actionId).toBe(abandonId)
    expect(storedAbandoned.finalSnapshotJson).toBeNull()
    expect(storedAbandoned.feedbackJson).toBeNull()
    expect(storedAbandoned.topicOutcomes).toHaveLength(0)

    const cappedAttempt = await createAttempt(student)
    await answerAttempt(student, cappedAttempt)
    const cappedAbandon = await actionRequest(student, cappedAttempt.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 1,
      type: 'abandon',
      payload: {},
    }).expect(200)
    expect(cappedAbandon.body.status).toBe('abandoned')
    const storedCappedAbandon = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(cappedAttempt.attemptId),
    })
    expect(storedCappedAbandon.processedActions).toHaveLength(2)
    expect(
      storedCappedAbandon.processedActions.filter((receipt) =>
        receipt.outcomeJson.includes('abandoned'),
      ),
    ).toHaveLength(1)
    expect(storedCappedAbandon.finalSnapshotJson).toBeNull()
  })

  it('supports untimed practice and refuses a practice adapter with a deadline', async () => {
    const practiceRegistry = createSyntheticAttemptRegistry({
      mode: 'practice',
      deadlineOffsetMs: null,
    })
    const practiceApp = createAppForRegistry(practiceRegistry)
    const student = await createStudent(practiceApp)
    const practice = await createAttempt(student)
    expect(practice).toMatchObject({ mode: 'practice', deadlineAt: null })
    const storedPractice = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(practice.attemptId),
    })
    expect(storedPractice.competitiveEligible).toBe(false)

    const invalidPracticeRegistry = createSyntheticAttemptRegistry({
      mode: 'practice',
      deadlineOffsetMs: 60_000,
    })
    const invalidPracticeApp = createAppForRegistry(invalidPracticeRegistry)
    const invalidPracticeStudent = await loginStudent(invalidPracticeApp, student)
    const invalidStart = await startRequest(invalidPracticeStudent).expect(503)
    expect(invalidStart.body.error.code).toBe('ATTEMPT_UNAVAILABLE')
    const invalidPracticeWrites = await database.db.collection('game_attempts').countDocuments({
      playerId: new Types.ObjectId(student.user.id),
    })
    expect(invalidPracticeWrites).toBe(1)
  })

  it('maps adapter and storage failures safely without mutating saved state', async () => {
    const student = await createStudent()
    const started = await createAttempt(student)
    const initial = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })

    const throwingRegistry = createSyntheticAttemptRegistry({
      overrides: {
        applyAction(state, { payload }) {
          if (!payload.correct) throw new Error('synthetic-private-callback-error')
          return { ...state, round: 1, correct: payload.correct }
        },
      },
    })
    const throwingApp = createAppForRegistry(throwingRegistry)
    const throwingStudent = await loginStudent(throwingApp, student)
    const callbackFailure = await actionRequest(throwingStudent, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: false },
    }).expect(503)
    expect(callbackFailure.body.error.code).toBe('ATTEMPT_UNAVAILABLE')
    expect(JSON.stringify(callbackFailure.body)).not.toContain('synthetic-private-callback-error')

    const invalidSummaryRegistry = createSyntheticAttemptRegistry({
      overrides: {
        summarize() {
          return { score: 11, feedback: { code: 'INVALID' }, topicOutcomes: [] }
        },
      },
    })
    const invalidSummaryApp = createAppForRegistry(invalidSummaryRegistry)
    const invalidSummaryStudent = await loginStudent(invalidSummaryApp, student)
    const invalidSummary = await actionRequest(invalidSummaryStudent, started.attemptId, {
      actionId: randomUUID(),
      expectedRevision: 0,
      type: 'answer',
      payload: { correct: true },
    }).expect(503)
    expect(invalidSummary.body.error.code).toBe('ATTEMPT_UNAVAILABLE')

    const oversizedRegistry = createSyntheticAttemptRegistry({
      overrides: {
        serializePublicState() {
          return { publicText: 'x'.repeat(140_000) }
        },
      },
    })
    const oversizedApp = createAppForRegistry(oversizedRegistry)
    const oversizedStudent = await loginStudent(oversizedApp, student)
    const oversizedRead = await oversizedStudent.agent
      .get(`/api/attempts/${started.attemptId}`)
      .set('Origin', origin)
      .expect(503)
    expect(oversizedRead.body.error.code).toBe('ATTEMPT_UNAVAILABLE')
    expect(JSON.stringify(oversizedRead.body)).not.toContain('synthetic-private-answer')

    const storageApp = createAppForRegistry(registry)
    const storageStudent = await loginStudent(storageApp, student)
    const model = attemptModel(database, registry).discriminators[
      `GameAttempt:${syntheticGameId}@fixture-1`
    ]
    const originalFindOneAndUpdate = model.findOneAndUpdate
    model.findOneAndUpdate = async () => {
      throw new Error('synthetic-private-storage-error')
    }
    let storageFailure
    try {
      storageFailure = await actionRequest(storageStudent, started.attemptId, {
        actionId: randomUUID(),
        expectedRevision: 0,
        type: 'answer',
        payload: { correct: true },
      }).expect(503)
    } finally {
      model.findOneAndUpdate = originalFindOneAndUpdate
    }
    expect(storageFailure.body.error.code).toBe('ATTEMPT_UNAVAILABLE')
    expect(JSON.stringify(storageFailure.body)).not.toContain('synthetic-private-storage-error')

    const afterFailures = await database.db.collection('game_attempts').findOne({
      _id: new Types.ObjectId(started.attemptId),
    })
    expect(afterFailures).toMatchObject({
      revision: 0,
      status: 'active',
      state: { round: 0, correct: false, secret: 'synthetic-private-answer' },
      processedActions: [],
    })
    expect(afterFailures.updatedAt).toEqual(initial.updatedAt)

    const malformedStateRegistry = createSyntheticAttemptRegistry({
      overrides: {
        createState({ now }) {
          return {
            state: {
              round: 0,
              secret: 'synthetic-private-answer',
              correct: false,
              unexpected: true,
            },
            mode: 'standard',
            deadlineAt: new Date(now.getTime() + 60_000),
          }
        },
      },
    })
    const malformedStateApp = createAppForRegistry(malformedStateRegistry)
    const malformedStateStudent = await loginStudent(malformedStateApp, student)
    const malformedState = await startRequest(malformedStateStudent).expect(503)
    expect(malformedState.body.error.code).toBe('ATTEMPT_UNAVAILABLE')
    expect(JSON.stringify(malformedState.body)).not.toContain('synthetic-private-answer')
    const malformedStateWrites = await database.db.collection('game_attempts').countDocuments({
      playerId: new Types.ObjectId(student.user.id),
    })
    expect(malformedStateWrites).toBe(1)
  })
})
