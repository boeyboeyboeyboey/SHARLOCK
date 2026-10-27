import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { LEVELS } from '../../../src/modules/games/clearance-tower/levels.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { predictionList, SOLUTIONS } from '../../unit/clearance-tower/solutions.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

const owned = {
  users: new Set(),
  institutions: new Set(),
  cohorts: new Set(),
  memberships: new Set(),
}

function remember(collection, id) {
  owned[collection].add(id.toString())
}

function idValues(collection) {
  return [...owned[collection]].map((id) => new Types.ObjectId(id))
}

async function registerStudent(app) {
  const student = await registerTestStudent(app)
  remember('users', student.user.id)
  return student
}

let database
let app
let auth
let origin
const base = '/api/games/clearance-tower'
const attemptsPath = `${base}/attempts`
// the news feature is stubbed so this suite exercises only the clearance tower routes
const newsStub = { store: {}, provider: { configured: false } }

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('Clearance tower integration tests require an isolated test database')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  auth = await initializeTestAuth(database, config)
  origin = auth.clientOrigin
  await initializeCohortStorage(database)
  await initializeAttemptStorage(database, createProductionAttemptRegistry())
})
beforeEach(() => {
  for (const ids of Object.values(owned)) ids.clear()
  app = createTestApp(database, auth, { news: newsStub })
})
afterEach(async () => {
  if (database) {
    assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
    const users = idValues('users')
    const cohorts = idValues('cohorts')
    const institutions = idValues('institutions')
    const memberships = idValues('memberships')
    if (users.length) {
      await database.db.collection('game_attempts').deleteMany({ playerId: { $in: users } })
      await database.db
        .collection('auth_sessions')
        .deleteMany({ 'session.userId': { $in: users.map(String) } })
    }
    if (memberships.length)
      await database.db.collection('memberships').deleteMany({ _id: { $in: memberships } })
    if (users.length) await database.db.collection('users').deleteMany({ _id: { $in: users } })
    if (cohorts.length)
      await database.db.collection('cohorts').deleteMany({ _id: { $in: cohorts } })
    if (institutions.length)
      await database.db.collection('institutions').deleteMany({ _id: { $in: institutions } })
  }
  await disposeTestAuthApps()
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

function post(student, path, body) {
  return student.agent
    .post(path)
    .set('Origin', origin)
    .set('X-CSRF-Token', student.csrfToken)
    .send(body)
}

function submitLevel(snapshot, levelId, overrides = {}) {
  const { policy, predictions } = SOLUTIONS[levelId]
  return {
    actionId: randomUUID(),
    expectedRevision: snapshot.revision,
    type: 'submit-level',
    payload: { levelId, policy, predictions: predictionList(predictions), ...overrides },
  }
}

async function cohortFor(student) {
  const institution = await institutionModel(database).create({
    name: 'Tower Test School',
    slug: `tower-${randomUUID()}`,
    status: 'active',
  })
  remember('institutions', institution._id)
  const cohort = await cohortModel(database).create({
    name: 'Tower Test Class',
    institutionId: institution._id,
    term: '2026',
    status: 'active',
  })
  const membership = await membershipModel(database).create({
    userId: student.user.id,
    cohortId: cohort._id,
    status: 'active',
  })
  remember('cohorts', cohort._id)
  remember('memberships', membership._id)
  return cohort
}

describe('saved clearance tower journey', () => {
  it('climbs all six levels and saves the summed score', async () => {
    const student = await registerStudent(app)
    const start = await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)
    expect(start.body.gameId).toBe('clearance-tower')
    expect(start.body.maxScore).toBe(600)
    const path = `/api/attempts/${start.body.attemptId}`
    const hidden = JSON.stringify(start.body)
    for (const level of LEVELS) {
      for (const prompt of level.predictions) expect(hidden).not.toContain(prompt.explanation)
      for (const event of level.day.filter((item) => item.kind !== 'work'))
        expect(hidden).not.toContain(event.story)
    }

    let snapshot = start.body
    let total = 0
    for (const level of LEVELS) {
      const sent = submitLevel(snapshot, level.id)
      snapshot = (await post(student, `${path}/actions`, sent).expect(200)).body
      total += SOLUTIONS[level.id].score
      expect(snapshot.score).toBe(total)
      // replaying the same action returns the recorded outcome
      expect((await post(student, `${path}/actions`, sent).expect(200)).body).toEqual(snapshot)
    }
    const again = submitLevel(snapshot, 'the-matrix')
    const rejected = await post(student, `${path}/actions`, again).expect(409)
    expect(rejected.body.error.code).toBe('CLEAR_LEVEL_SUBMITTED')

    const finish = { actionId: randomUUID(), expectedRevision: snapshot.revision }
    const done = await post(student, `${path}/complete`, finish).expect(200)
    expect(done.body).toMatchObject({ score: total, status: 'completed', persisted: true })
    expect(done.body.mode).toBe('practice')
    expect((await student.agent.get(path).expect(200)).body).toEqual(done.body)

    const other = await registerStudent(app)
    await other.agent.get(path).expect(404)
    await post(other, `${path}/actions`, submitLevel(done.body, 'the-gift')).expect(404)
  })

  it('shows the day only after a level is submitted and refuses unfinished or bad input', async () => {
    const student = await registerStudent(app)
    const start = await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)
    const path = `/api/attempts/${start.body.attemptId}`
    await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: start.body.revision,
    }).expect(409)
    await post(
      student,
      `${path}/actions`,
      submitLevel(start.body, 'the-matrix', { score: 600 }),
    ).expect(400)
    await post(
      student,
      `${path}/actions`,
      submitLevel(start.body, 'the-matrix', { levelId: 'x' }),
    ).expect(400)

    const played = await post(student, `${path}/actions`, submitLevel(start.body, 'the-matrix'))
    expect(played.status).toBe(200)
    const state = played.body.publicState
    const matrix = state.levels.find((level) => level.id === 'the-matrix')
    expect(matrix.result.events.length).toBeGreaterThan(0)
    const rest = state.levels.filter((level) => level.id !== 'the-matrix')
    expect(rest.every((level) => !('result' in level))).toBe(true)
    const text = JSON.stringify(rest)
    for (const level of LEVELS.filter((item) => item.id !== 'the-matrix'))
      for (const prompt of level.predictions) expect(text).not.toContain(prompt.explanation)
  })

  it('saves a class attempt onto the cohort leaderboard', async () => {
    const student = await registerStudent(app)
    const cohort = await cohortFor(student)
    const cohortId = String(cohort._id)
    const start = await post(student, attemptsPath, {
      context: { kind: 'cohort', cohortId },
    }).expect(201)
    const path = `/api/attempts/${start.body.attemptId}`
    const played = await post(student, `${path}/actions`, submitLevel(start.body, 'the-matrix'))
    expect(played.status).toBe(200)
    await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: played.body.revision,
    }).expect(200)

    const board = await student.agent
      .get(`/api/cohorts/${cohortId}/leaderboard?gameId=clearance-tower`)
      .set('Origin', origin)
      .expect(200)
    expect(board.body).toMatchObject({ gameId: 'clearance-tower', competitive: false })
    expect(board.body.rows.map((row) => [row.username, row.score, row.maxScore])).toEqual([
      [student.user.username, 100, 600],
    ])
  })
})
