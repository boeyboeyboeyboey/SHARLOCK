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
import { userModel } from '../../../src/models/User.js'
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

async function newCohort() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institution = await institutionModel(database).create({
    name: `Results School ${suffix}`,
    slug: `results-${suffix}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Results Class ${suffix}`,
    term: '2026 T2',
    status: 'active',
  })
  remember('institutions', institution._id)
  remember('cohorts', cohort._id)
  return cohort._id.toString()
}

async function addMember(userId, cohortId, status = 'active') {
  const membership = await membershipModel(database).create({
    userId: new Types.ObjectId(userId),
    cohortId: new Types.ObjectId(cohortId),
    status,
  })
  remember('memberships', membership._id)
  return membership
}

async function assign(userId, cohortId) {
  const assignment = await instructorAssignmentModel(database).create({
    userId: new Types.ObjectId(userId),
    cohortId: new Types.ObjectId(cohortId),
    status: 'active',
  })
  remember('assignments', assignment._id)
}

async function setRoles(account, roles) {
  await userModel(database).updateOne(
    { _id: new Types.ObjectId(account.user.id) },
    { $set: { globalRoles: roles } },
  )
}

async function createStaff(roles = ['instructor']) {
  const account = await createStudent()
  await setRoles(account, roles)
  return account
}

async function completeOne(student, context, correct = true) {
  const attempt = await createAttempt(student, context)
  await answerAttempt(student, attempt, correct)
  await finishAttempt(student, attempt.attemptId)
  return attempt
}

const inClass = (cohortId) => ({ kind: 'cohort', cohortId })
const results = (account, cohortId, query = '') =>
  account.agent.get(`/api/cohorts/${cohortId}/results${query}`).set('Origin', origin)
const studentAttempts = (account, cohortId, studentId, query = '') =>
  account.agent
    .get(`/api/cohorts/${cohortId}/students/${studentId}/attempts${query}`)
    .set('Origin', origin)

describe('instructor class results API', () => {
  it('lets an assigned instructor read counted students only', async () => {
    const cohortId = await newCohort()
    const otherCohortId = await newCohort()
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)

    const good = await createStudent()
    const wrong = await createStudent()
    const multi = await createStudent()
    const pending = await createStudent()
    const removed = await createStudent()
    const promoted = await createStudent()
    const quiet = await createStudent()
    await addMember(good.user.id, cohortId)
    await addMember(wrong.user.id, cohortId)
    await addMember(multi.user.id, cohortId)
    await addMember(multi.user.id, otherCohortId)
    const pendingMembership = await addMember(pending.user.id, cohortId)
    const removedMembership = await addMember(removed.user.id, cohortId)
    await addMember(promoted.user.id, cohortId)
    await addMember(quiet.user.id, cohortId)

    currentTime += 1000
    await completeOne(good, inClass(cohortId), true)
    currentTime += 1000
    await completeOne(wrong, inClass(cohortId), false)
    currentTime += 1000
    await completeOne(multi, inClass(cohortId), true)
    await completeOne(multi, inClass(otherCohortId), true)
    await completeOne(multi, { kind: 'personal' }, true)
    await completeOne(pending, inClass(cohortId), true)
    await completeOne(removed, inClass(cohortId), true)
    await completeOne(promoted, inClass(cohortId), true)
    await completeOne(instructor, inClass(cohortId), true)
    await membershipModel(database).updateOne(
      { _id: pendingMembership._id },
      { $set: { status: 'pending' } },
    )
    await membershipModel(database).updateOne(
      { _id: removedMembership._id },
      { $set: { status: 'removed' } },
    )
    await setRoles(promoted, ['instructor'])

    const response = await results(instructor, cohortId).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(Object.keys(response.body).sort()).toEqual(
      ['activeStudents', 'cohort', 'games', 'page', 'pageSize', 'students', 'total'].sort(),
    )
    expect(response.body.cohort).toEqual({
      id: cohortId,
      name: expect.stringContaining('Results Class'),
      term: '2026 T2',
    })
    expect(response.body).toMatchObject({ activeStudents: 4, total: 4, page: 1, pageSize: 50 })
    expect(response.body.games).toEqual([
      {
        gameId: syntheticGameId,
        rulesetVersion: 'fixture-1',
        studentsAttempted: 3,
        averageBestPercent: 67,
        topics: [{ topic: 'contract', studentsAttempted: 3, studentsPassed: 2 }],
      },
    ])
    expect(response.body.students.map((row) => row.id).sort()).toEqual(
      [good, wrong, multi, quiet].map((row) => row.user.id).sort(),
    )
    for (const row of response.body.students) {
      expect(Object.keys(row).sort()).toEqual(
        ['avatarId', 'completedAttempts', 'games', 'id', 'lastCompletedAt', 'username'].sort(),
      )
    }
    const multiRow = response.body.students.find((row) => row.id === multi.user.id)
    expect(multiRow).toMatchObject({
      completedAttempts: 1,
      games: [{ gameId: syntheticGameId, bestPercent: 100 }],
    })
    const quietRow = response.body.students.find((row) => row.id === quiet.user.id)
    expect(quietRow).toMatchObject({ completedAttempts: 0, lastCompletedAt: null, games: [] })
    const names = response.body.students.map((row) => row.username.toLowerCase())
    expect(names).toEqual([...names].sort())
    expect(JSON.stringify(response.body)).not.toMatch(
      /email|playerId|rulesetKey|processedActions|finalSnapshot|feedbackJson|revision|@/,
    )

    for (const excluded of [pending, removed, promoted, instructor]) {
      await studentAttempts(instructor, cohortId, excluded.user.id).expect(404)
    }
  })

  it('returns an empty class with null averages', async () => {
    const cohortId = await newCohort()
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)
    const response = await results(instructor, cohortId).expect(200)
    expect(response.body.activeStudents).toBe(0)
    expect(response.body.students).toEqual([])
    expect(response.body.games).toEqual([
      {
        gameId: syntheticGameId,
        rulesetVersion: null,
        studentsAttempted: 0,
        averageBestPercent: null,
        topics: [],
      },
    ])
  })

  it('hides classes from unassigned staff, foreign staff and students', async () => {
    const cohortId = await newCohort()
    const elsewhereId = await newCohort()
    const unassigned = await createStaff()
    const foreign = await createStaff()
    await assign(foreign.user.id, elsewhereId)
    const student = await createStudent()
    await addMember(student.user.id, cohortId)
    const missing = new Types.ObjectId().toString()
    for (const caller of [unassigned, foreign, student]) {
      await results(caller, cohortId).expect(404)
      await studentAttempts(caller, cohortId, student.user.id).expect(404)
    }
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)
    await results(instructor, missing).expect(404)
    await results(instructor, 'not-an-id').expect(404)
    await studentAttempts(instructor, cohortId, 'not-an-id').expect(404)
    await studentAttempts(instructor, cohortId, missing).expect(404)
    const outsider = await createStudent()
    await studentAttempts(instructor, cohortId, outsider.user.id).expect(404)
    // a student of another class the instructor teaches elsewhere is not reachable through this one
    const elsewhereStudent = await createStudent()
    await addMember(elsewhereStudent.user.id, elsewhereId)
    await studentAttempts(instructor, cohortId, elsewhereStudent.user.id).expect(404)
    const stranger = await request(app).get(`/api/cohorts/${cohortId}/results`).expect(401)
    expect(stranger.headers['cache-control']).toBe('no-store')
    await request(app)
      .get(`/api/cohorts/${cohortId}/students/${student.user.id}/attempts`)
      .expect(401)
  })

  it('lets an administrator read any class', async () => {
    const cohortId = await newCohort()
    const admin = await createStaff(['admin'])
    const student = await createStudent()
    await addMember(student.user.id, cohortId)
    await completeOne(student, inClass(cohortId))
    const response = await results(admin, cohortId).expect(200)
    expect(response.body.activeStudents).toBe(1)
    await studentAttempts(admin, cohortId, student.user.id).expect(200)
  })

  it('rejects malformed queries', async () => {
    const cohortId = await newCohort()
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)
    const student = await createStudent()
    await addMember(student.user.id, cohortId)
    for (const query of ['?x=1', '?page=0', '?page=x', '?page=1&page=2', '?page[$gt]=1']) {
      const response = await results(instructor, cohortId, query).expect(400)
      expect(response.body.error.code).toBe('CLASS_RESULTS_INVALID_REQUEST')
    }
    for (const query of ['?gameId=nope', '?gameId[$ne]=x', '?page=0', '?x=1']) {
      await studentAttempts(instructor, cohortId, student.user.id, query).expect(400)
    }
  })

  it('paginates and filters a student attempt history newest first', async () => {
    const cohortId = await newCohort()
    const otherCohortId = await newCohort()
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)
    const student = await createStudent()
    await addMember(student.user.id, cohortId)
    await addMember(student.user.id, otherCohortId)
    const ids = []
    for (let index = 0; index < 12; index += 1) {
      currentTime += 1000
      ids.push((await completeOne(student, inClass(cohortId), index % 2 === 0)).attemptId)
    }
    await completeOne(student, inClass(otherCohortId))
    await completeOne(student, { kind: 'personal' })
    const first = await studentAttempts(instructor, cohortId, student.user.id).expect(200)
    expect(first.headers['cache-control']).toBe('no-store')
    expect(first.body.student).toEqual({
      id: student.user.id,
      username: student.user.username,
      avatarId: 'mint',
    })
    expect(first.body).toMatchObject({ page: 1, pageSize: 10, total: 12 })
    expect(first.body.attempts.map((item) => item.id)).toEqual(ids.slice(2).reverse())
    expect(first.body.attempts[0]).toEqual({
      id: ids[11],
      gameId: syntheticGameId,
      rulesetVersion: 'fixture-1',
      score: 0,
      maxScore: 10,
      completedAt: expect.any(String),
      topicOutcomes: [{ topic: 'contract', achieved: false, feedbackCode: 'FIXTURE_RESULT' }],
    })
    const second = await studentAttempts(
      instructor,
      cohortId,
      student.user.id,
      `?gameId=${syntheticGameId}&page=2`,
    ).expect(200)
    expect(second.body.attempts.map((item) => item.id)).toEqual(ids.slice(0, 2).reverse())
  })

  it('paginates the student list', async () => {
    const cohortId = await newCohort()
    const instructor = await createStaff()
    await assign(instructor.user.id, cohortId)
    for (let index = 0; index < 51; index += 1) {
      const tag = `${String(index).padStart(2, '0')}${randomUUID().replaceAll('-', '').slice(0, 8)}`
      const user = await userModel(database).create({
        emailNormalized: `bulk-${tag}@example.test`,
        username: `bulk${tag}`,
        usernameNormalized: `bulk${tag}`,
        passwordHash: 'x',
        avatarId: 'mint',
        passwordChangedAt: new Date(),
      })
      remember('users', user._id)
      await addMember(user._id.toString(), cohortId)
    }
    const first = await results(instructor, cohortId).expect(200)
    const second = await results(instructor, cohortId, '?page=2').expect(200)
    expect(first.body.students).toHaveLength(50)
    expect(second.body.students).toHaveLength(1)
    expect(second.body).toMatchObject({ page: 2, total: 51, activeStudents: 51 })
  })
})
