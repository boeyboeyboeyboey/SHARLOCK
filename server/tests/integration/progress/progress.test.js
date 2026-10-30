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
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'
import { createSyntheticAttemptRegistry, syntheticGameId } from '../attempts/helpers.js'

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

function historyRequest(student, query = '') {
  return student.agent.get(`/api/me/attempts${query}`).set('Origin', origin)
}

async function completeOne(student, context, correct = true) {
  const attempt = await createAttempt(student, context)
  await answerAttempt(student, attempt, correct)
  await finishAttempt(student, attempt.attemptId)
  return attempt
}

describe('personal progress API', () => {
  it('requires a session and sends no-store', async () => {
    for (const path of ['/api/me/progress', '/api/me/attempts']) {
      const response = await request(app).get(path).expect(401)
      expect(response.headers['cache-control']).toBe('no-store')
    }
  })

  it('lists only the caller completed attempts and hides private fields', async () => {
    const student = await createStudent()
    const other = await createStudent()
    const done = await completeOne(student)
    await createAttempt(student)
    const abandoned = await createAttempt(student)
    await database.db
      .collection('game_attempts')
      .updateOne(
        { _id: new Types.ObjectId(abandoned.attemptId) },
        { $set: { status: 'abandoned' } },
      )
    await completeOne(other)

    const response = await historyRequest(student).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.total).toBe(1)
    expect(response.body.attempts).toHaveLength(1)
    expect(response.body.attempts[0]).toEqual({
      attemptId: done.attemptId,
      gameId: syntheticGameId,
      rulesetVersion: 'fixture-1',
      contextKind: 'personal',
      score: 10,
      maxScore: 10,
      completedAt: expect.any(String),
    })
    expect(JSON.stringify(response.body)).not.toMatch(
      /playerId|processedActions|finalSnapshot|feedback/,
    )

    const progress = await student.agent.get('/api/me/progress').set('Origin', origin).expect(200)
    expect(progress.body.savingGameIds).toEqual([syntheticGameId])
    expect(progress.body.games).toEqual([
      expect.objectContaining({
        gameId: syntheticGameId,
        saves: true,
        completedCount: 1,
        points: 100,
      }),
    ])
    expect(progress.body).toMatchObject({ totalPoints: 100, maxPoints: 100 })
    expect(progress.body.topicOutcomes).toEqual([{ topic: 'contract', attempted: 1, passed: 1 }])
    expect(progress.body.achievements.map((a) => a.key)).toEqual([
      'first-clue',
      'perfect-case',
      'topic-expert',
      'timed-run',
    ])
    expect(progress.body.catalogue).toHaveLength(11)
    for (const item of progress.body.catalogue)
      expect(Object.keys(item).sort()).toEqual(['description', 'key', 'name'])
    const again = await student.agent.get('/api/me/progress').set('Origin', origin).expect(200)
    expect(again.body).toEqual(progress.body)
  })

  it('keeps completed class attempts after membership removal', async () => {
    const student = await createStudent()
    const { cohort, membership } = await createClass({ userId: student.user.id })
    await completeOne(student, { kind: 'cohort', cohortId: cohort._id.toString() })
    await membershipModel(database).updateOne(
      { _id: membership._id },
      { $set: { status: 'removed' } },
    )
    const response = await historyRequest(student).expect(200)
    expect(response.body.attempts.map((item) => item.contextKind)).toEqual(['cohort'])
  })

  it('rejects invalid filters and pages', async () => {
    const student = await createStudent()
    for (const query of [
      '?gameId=unknown-game',
      '?gameId[$ne]=x',
      '?gameId=a&gameId=b',
      '?page=0',
      '?page=-1',
      '?page=1.5',
      '?page=abc',
      '?page=10001',
      '?page[$gt]=1',
      '?extra=1',
    ]) {
      const response = await historyRequest(student, query).expect(400)
      expect(response.body.error.code).toBe('PROGRESS_INVALID_REQUEST')
    }
    await student.agent.get('/api/me/progress?x=1').set('Origin', origin).expect(400)
  })

  it('paginates newest first with identical repeat responses', async () => {
    const student = await createStudent()
    const ids = []
    for (let index = 0; index < 12; index += 1) {
      currentTime += 1000
      ids.push((await completeOne(student)).attemptId)
    }
    const first = await historyRequest(student, `?gameId=${syntheticGameId}`).expect(200)
    const second = await historyRequest(student, '?page=2').expect(200)
    const repeat = await historyRequest(student, `?gameId=${syntheticGameId}`).expect(200)
    expect(first.body.total).toBe(12)
    expect(first.body.attempts.map((item) => item.attemptId)).toEqual(ids.slice(2).reverse())
    expect(second.body.attempts.map((item) => item.attemptId)).toEqual(ids.slice(0, 2).reverse())
    expect(second.body.page).toBe(2)
    expect(repeat.body).toEqual(first.body)
    const empty = await historyRequest(student, '?page=3').expect(200)
    expect(empty.body.attempts).toEqual([])
  })
})
