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
let baseRegistry
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
  baseRegistry = createSyntheticAttemptRegistry()
  await initializeAttemptStorage(database, baseRegistry)
})

beforeEach(() => {
  registry = baseRegistry
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
    name: `Board School ${suffix}`,
    slug: `board-${suffix}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Board Class ${suffix}`,
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

function setAttempt(attempt, fields) {
  return database.db
    .collection('game_attempts')
    .updateOne({ _id: new Types.ObjectId(attempt.attemptId) }, { $set: fields })
}

const inClass = (cohortId) => ({ kind: 'cohort', cohortId })
const board = (account, cohortId, query = '') =>
  account.agent.get(`/api/cohorts/${cohortId}/leaderboard${query}`).set('Origin', origin)
const games = (account, cohortId, query = '') =>
  account.agent.get(`/api/cohorts/${cohortId}/leaderboard/games${query}`).set('Origin', origin)
const q = (extra = '') => `?gameId=${syntheticGameId}${extra}`

async function setupClass() {
  const cohortId = await newCohort()
  const ann = await createStudent()
  const bob = await createStudent()
  await addMember(ann.user.id, cohortId)
  await addMember(bob.user.id, cohortId)
  return { cohortId, ann, bob }
}

describe('class leaderboard API', () => {
  it('ranks best scores for a student in the class and hides private fields', async () => {
    const { cohortId, ann, bob } = await setupClass()
    currentTime += 1000
    await completeOne(ann, inClass(cohortId), false)
    currentTime += 1000
    await completeOne(ann, inClass(cohortId), true)
    currentTime += 1000
    await completeOne(bob, inClass(cohortId), true)

    const response = await board(bob, cohortId, q()).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'competitive',
        'gameId',
        'me',
        'page',
        'pageSize',
        'rows',
        'rulesetVersion',
        'total',
        'view',
      ].sort(),
    )
    expect(response.body).toMatchObject({
      gameId: syntheticGameId,
      rulesetVersion: 'fixture-1',
      competitive: true,
      view: 'best',
      page: 1,
      pageSize: 25,
      total: 2,
    })
    expect(
      response.body.rows.map((row) => [row.rank, row.username, row.score, row.isSelf]),
    ).toEqual([
      [1, ann.user.username, 10, false],
      [1, bob.user.username, 10, true],
    ])
    expect(response.body.me).toMatchObject({ username: bob.user.username, isSelf: true })
    for (const row of response.body.rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['avatarId', 'isSelf', 'maxScore', 'rank', 'score', 'username'].sort(),
      )
    }
    expect(JSON.stringify(response.body)).not.toMatch(
      /"id"|playerId|email|attemptId|@|rulesetKey|state/,
    )
  })

  it('builds an all-time board with points and plays', async () => {
    const { cohortId, ann, bob } = await setupClass()
    currentTime += 1000
    await completeOne(ann, inClass(cohortId), true)
    await completeOne(ann, inClass(cohortId), false)
    await completeOne(bob, inClass(cohortId), true)
    const response = await board(ann, cohortId, q('&view=all-time')).expect(200)
    expect(response.body.rows.map((row) => [row.username, row.points, row.plays])).toEqual(
      [
        [ann.user.username, 100, 2],
        [bob.user.username, 100, 1],
      ].sort((a, b) => a[0].localeCompare(b[0])),
    )
    expect(Object.keys(response.body.rows[0]).sort()).toEqual(
      ['avatarId', 'bestScore', 'isSelf', 'maxScore', 'plays', 'points', 'rank', 'username'].sort(),
    )
  })

  it('returns the same 404 for foreign, malformed, pending and removed access', async () => {
    const { cohortId, ann } = await setupClass()
    const otherCohortId = await newCohort()
    const pending = await createStudent()
    const removed = await createStudent()
    await addMember(pending.user.id, cohortId, 'pending')
    await addMember(removed.user.id, cohortId, 'removed')
    const foreign = await board(ann, otherCohortId, q()).expect(404)
    const malformed = await board(ann, 'not-an-id', q()).expect(404)
    expect(foreign.body.error).toEqual(malformed.body.error)
    await board(pending, cohortId, q()).expect(404)
    await board(removed, cohortId, q()).expect(404)
    await games(removed, cohortId).expect(404)
  })

  it('drops a student removed after playing', async () => {
    const { cohortId, ann, bob } = await setupClass()
    await completeOne(ann, inClass(cohortId), true)
    await completeOne(bob, inClass(cohortId), true)
    await membershipModel(database).updateOne(
      { userId: new Types.ObjectId(bob.user.id), cohortId: new Types.ObjectId(cohortId) },
      { $set: { status: 'removed' } },
    )
    const response = await board(ann, cohortId, q()).expect(200)
    expect(response.body.rows.map((row) => row.username)).toEqual([ann.user.username])
  })

  it('excludes staff, dual-role and personal attempts', async () => {
    const { cohortId, ann } = await setupClass()
    const instructor = await createStaff(['instructor'])
    await assign(instructor.user.id, cohortId)
    const dual = await createStudent()
    await addMember(dual.user.id, cohortId)
    await completeOne(dual, inClass(cohortId), true)
    await setRoles(dual, ['student', 'instructor'])
    await completeOne(instructor, inClass(cohortId), true)
    await completeOne(ann, { kind: 'personal' }, true)
    await completeOne(ann, inClass(cohortId), false)
    const response = await board(ann, cohortId, q('&view=all-time')).expect(200)
    expect(response.body.rows).toHaveLength(1)
    expect(response.body.rows[0]).toMatchObject({
      username: ann.user.username,
      plays: 1,
      points: 0,
    })
  })

  it('does not mix rulesets and defaults to the latest', async () => {
    const { cohortId, ann, bob } = await setupClass()
    currentTime += 1000
    await completeOne(ann, inClass(cohortId), true)
    currentTime += 1000
    const second = await completeOne(bob, inClass(cohortId), true)
    await setAttempt(second, { rulesetVersion: 'fixture-2' })

    const latest = await board(ann, cohortId, q()).expect(200)
    expect(latest.body.rulesetVersion).toBe('fixture-2')
    expect(latest.body.rows.map((row) => row.username)).toEqual([bob.user.username])
    const old = await board(ann, cohortId, q('&rulesetVersion=fixture-1')).expect(200)
    expect(old.body.rows.map((row) => row.username)).toEqual([ann.user.username])
    expect(old.body.me).toMatchObject({ username: ann.user.username })
    const listed = await games(ann, cohortId).expect(200)
    expect(listed.body.games).toEqual([
      { gameId: syntheticGameId, rulesetVersion: 'fixture-2', competitive: false },
    ])
  })

  it('counts only competitive attempts in the best view of a competitive ruleset', async () => {
    const { cohortId, ann, bob } = await setupClass()
    const attempt = await completeOne(ann, inClass(cohortId), true)
    await completeOne(bob, inClass(cohortId), false)
    await setAttempt(attempt, { competitiveEligible: false })
    const best = await board(bob, cohortId, q()).expect(200)
    expect(best.body.rows.map((row) => row.username)).toEqual([bob.user.username])
    const all = await board(bob, cohortId, q('&view=all-time')).expect(200)
    expect(all.body.total).toBe(2)
  })

  it('counts every attempt in the best view of a non-competitive ruleset', async () => {
    const { cohortId, ann } = await setupClass()
    const attempt = await completeOne(ann, inClass(cohortId), true)
    // a ruleset missing from the registry counts as non-competitive
    await setAttempt(attempt, { rulesetVersion: 'fixture-2', competitiveEligible: false })
    const response = await board(ann, cohortId, q()).expect(200)
    expect(response.body.competitive).toBe(false)
    expect(response.body.rows).toHaveLength(1)
    const listed = await games(ann, cohortId).expect(200)
    expect(listed.body.games[0].competitive).toBe(false)
  })

  it('lets an assigned instructor and an admin read but not an unassigned instructor', async () => {
    const { cohortId, ann } = await setupClass()
    await completeOne(ann, inClass(cohortId), true)
    const assigned = await createStaff(['instructor'])
    await assign(assigned.user.id, cohortId)
    const unassigned = await createStaff(['instructor'])
    const admin = await createStaff(['admin'])
    const seen = await board(assigned, cohortId, q()).expect(200)
    expect(seen.body.rows).toHaveLength(1)
    expect(seen.body.me).toBeNull()
    await board(admin, cohortId, q()).expect(200)
    await board(unassigned, cohortId, q()).expect(404)
    await games(unassigned, cohortId).expect(404)
  })

  it('rejects unknown keys, unknown games and bad values with 400', async () => {
    const { cohortId, ann } = await setupClass()
    await board(ann, cohortId, q('&extra=1')).expect(400)
    await board(ann, cohortId, '').expect(400)
    await board(ann, cohortId, '?gameId=no-such-game').expect(400)
    await board(ann, cohortId, q('&view=weekly')).expect(400)
    await board(ann, cohortId, q('&page=0')).expect(400)
    await games(ann, cohortId, '?page=1').expect(400)
  })

  it('returns an empty board for a registered game with no attempts', async () => {
    const { cohortId, ann } = await setupClass()
    const response = await board(ann, cohortId, q()).expect(200)
    expect(response.body).toMatchObject({ rulesetVersion: null, rows: [], total: 0, me: null })
    const listed = await games(ann, cohortId).expect(200)
    expect(listed.body).toEqual({ games: [] })
  })

  it('requires a session', async () => {
    const { cohortId } = await setupClass()
    await request(app).get(`/api/cohorts/${cohortId}/leaderboard${q()}`).expect(401)
  })
})
