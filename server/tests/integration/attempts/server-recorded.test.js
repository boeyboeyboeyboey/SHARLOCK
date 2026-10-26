import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Schema, Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'
import { createAttemptService } from '../../../src/modules/attempts/service.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

const gameId = 'recorded-fixture'
const password = 'Synthetic-Test-Password-2026'
const owned = { users: [], cohorts: [], institutions: [], memberships: [] }

let database
let baseAuthOptions
let app
let origin
let registry
let service

const stateSchema = new Schema(
  { points: { type: Number, required: true, min: 0, max: 10 } },
  { _id: false, strict: 'throw' },
)

function createRegistry() {
  return createAttemptRegistry([
    {
      id: gameId,
      rulesetVersion: 'fixture-1',
      current: true,
      competitive: true,
      serverRecorded: true,
      learningObjective: 'Practice the server-recorded path.',
      topicTags: ['recorded-fixture'],
      maxScore: 10,
      maxActions: 1,
      stateSchema,
      serializePublicState: (state) => ({ points: state.points }),
      summarize: (state) => ({
        score: state.points,
        feedback: { code: 'RECORDED' },
        topicOutcomes: [{ topic: 'recorded', achieved: state.points > 5, feedbackCode: 'R' }],
      }),
    },
  ])
}

async function createStudent() {
  const student = await registerTestStudent(app)
  owned.users.push(new Types.ObjectId(student.user.id))
  const agent = request.agent(app)
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
  const login = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: student.email, password })
    .expect(200)
  return { ...student, agent, csrfToken: login.body.csrfToken }
}

async function newCohort() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institution = await institutionModel(database).create({
    name: `Recorded School ${suffix}`,
    slug: `recorded-${suffix}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Recorded Class ${suffix}`,
    term: '2026 T2',
    status: 'active',
  })
  owned.institutions.push(institution._id)
  owned.cohorts.push(cohort._id)
  return cohort._id.toString()
}

async function addMember(userId, cohortId, status = 'active') {
  const membership = await membershipModel(database).create({
    userId: new Types.ObjectId(userId),
    cohortId: new Types.ObjectId(cohortId),
    status,
  })
  owned.memberships.push(membership._id)
}

const run = (student, overrides = {}) => ({
  context: { kind: 'personal' },
  mode: 'standard',
  startedAt: new Date(Date.now() - 5000),
  state: { points: 8 },
  resultKey: randomUUID(),
  ...overrides,
})

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Attempt integration tests require NODE_ENV=test.')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  baseAuthOptions = await initializeTestAuth(database, config)
  await initializeCohortStorage(database)
  registry = createRegistry()
  await initializeAttemptStorage(database, registry)
  service = createAttemptService(database, { registry })
})

beforeEach(() => {
  for (const ids of Object.values(owned)) ids.length = 0
  app = createTestApp(database, baseAuthOptions, { attempts: { registry } })
  origin = baseAuthOptions.clientOrigin
})

afterEach(async () => {
  if (database) {
    assertSafeTestDatabaseUri(process.env.TEST_MONGODB_URI, process.env.MONGO_URI)
    const db = database.db
    if (owned.users.length) {
      await db.collection('game_attempts').deleteMany({ playerId: { $in: owned.users } })
      await db
        .collection('auth_sessions')
        .deleteMany({ 'session.userId': { $in: owned.users.map(String) } })
      await db.collection('users').deleteMany({ _id: { $in: owned.users } })
    }
    await db.collection('memberships').deleteMany({ _id: { $in: owned.memberships } })
    await db.collection('cohorts').deleteMany({ _id: { $in: owned.cohorts } })
    await db.collection('institutions').deleteMany({ _id: { $in: owned.institutions } })
  }
  await disposeTestAuthApps()
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('server-recorded attempts', () => {
  it('records a completed attempt scored by summarize and readable over HTTP', async () => {
    const student = await createStudent()
    const input = run(student)
    const snapshot = await service.recordCompletedAttempt(student.user, gameId, input)
    expect(snapshot).toMatchObject({
      gameId,
      status: 'completed',
      mode: 'standard',
      score: 8,
      maxScore: 10,
      persisted: true,
      context: { kind: 'personal', cohortId: null },
      publicState: { points: 8 },
      feedback: { code: 'RECORDED' },
      topicOutcomes: [{ topic: 'recorded', achieved: true, feedbackCode: 'R' }],
    })
    const read = await student.agent
      .get(`/api/attempts/${snapshot.attemptId}`)
      .set('Origin', origin)
      .expect(200)
    expect(read.body.attemptId).toBe(snapshot.attemptId)
    expect(read.body.score).toBe(8)
  })

  it('is idempotent per player, game and result key', async () => {
    const student = await createStudent()
    const input = run(student)
    const first = await service.recordCompletedAttempt(student.user, gameId, input)
    const second = await service.recordCompletedAttempt(student.user, gameId, {
      ...input,
      state: { points: 1 },
    })
    expect(second.attemptId).toBe(first.attemptId)
    expect(second.score).toBe(8)
    const count = await database.db
      .collection('game_attempts')
      .countDocuments({ playerId: new Types.ObjectId(student.user.id) })
    expect(count).toBe(1)
    const parallel = await Promise.all(
      [1, 2, 3].map(() =>
        service.recordCompletedAttempt(
          student.user,
          gameId,
          run(student, { resultKey: 'race-key-0001' }),
        ),
      ),
    )
    expect(new Set(parallel.map((item) => item.attemptId)).size).toBe(1)
  })

  it('rejects invalid keys, state, modes and non-recorded games', async () => {
    const student = await createStudent()
    for (const bad of [
      { resultKey: 'short' },
      { resultKey: 'has space in key!' },
      { mode: 'timed' },
      { startedAt: 'nope' },
      { state: { points: 99 } },
      { state: { points: 1, extra: true } },
    ]) {
      await expect(
        service.recordCompletedAttempt(student.user, gameId, run(student, bad)),
      ).rejects.toMatchObject({ status: 400 })
    }
    await expect(
      service.recordCompletedAttempt(student.user, 'unknown-game', run(student)),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('bounds a future startedAt to the server clock', async () => {
    const student = await createStudent()
    const snapshot = await service.recordCompletedAttempt(
      student.user,
      gameId,
      run(student, { startedAt: new Date(Date.now() + 3_600_000) }),
    )
    expect(new Date(snapshot.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(snapshot.completedAt).getTime(),
    )
  })

  it('rejects foreign, pending and removed class contexts', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    const context = { kind: 'cohort', cohortId }
    await expect(
      service.recordCompletedAttempt(student.user, gameId, run(student, { context })),
    ).rejects.toThrow()
    await expect(service.resolveRunContext(student.user, context)).rejects.toThrow()
    const pending = await createStudent()
    await addMember(pending.user.id, cohortId, 'pending')
    await expect(
      service.recordCompletedAttempt(pending.user, gameId, run(pending, { context })),
    ).rejects.toThrow()
    const removed = await createStudent()
    await addMember(removed.user.id, cohortId, 'removed')
    await expect(
      service.recordCompletedAttempt(removed.user, gameId, run(removed, { context })),
    ).rejects.toThrow()
    const stored = await database.db.collection('game_attempts').countDocuments({
      playerId: { $in: owned.users },
    })
    expect(stored).toBe(0)
  })

  it('resolves a valid class context for a member', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    const resolved = await service.resolveRunContext(student.user, { kind: 'cohort', cohortId })
    expect(resolved).toMatchObject({ kind: 'cohort', cohortId })
    await expect(
      service.resolveRunContext(student.user, { kind: 'personal' }),
    ).resolves.toMatchObject({
      kind: 'personal',
    })
  })

  it('rejects public start, action and complete for serverRecorded games', async () => {
    const student = await createStudent()
    const start = await student.agent
      .post(`/api/games/${gameId}/attempts`)
      .set('Origin', origin)
      .set('X-CSRF-Token', student.csrfToken)
      .send({ context: { kind: 'personal' } })
      .expect(409)
    expect(start.body.error.code).toBe('ATTEMPT_SERVER_RECORDED')
    const snapshot = await service.recordCompletedAttempt(student.user, gameId, run(student))
    for (const [path, body] of [
      ['actions', { actionId: randomUUID(), expectedRevision: 0, type: 'answer', payload: {} }],
      ['complete', { actionId: randomUUID(), expectedRevision: 0 }],
    ]) {
      const response = await student.agent
        .post(`/api/attempts/${snapshot.attemptId}/${path}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', student.csrfToken)
        .send(body)
        .expect(409)
      expect(response.body.error.code).toBe('ATTEMPT_SERVER_RECORDED')
    }
  })

  it('shows a class result on the class leaderboard and keeps personal off it', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    await service.recordCompletedAttempt(
      student.user,
      gameId,
      run(student, { context: { kind: 'cohort', cohortId }, state: { points: 9 } }),
    )
    await service.recordCompletedAttempt(
      student.user,
      gameId,
      run(student, { state: { points: 10 } }),
    )
    const response = await student.agent
      .get(`/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}`)
      .set('Origin', origin)
      .expect(200)
    expect(response.body.rows.map((row) => [row.username, row.score])).toEqual([
      [student.user.username, 9],
    ])
  })
})
