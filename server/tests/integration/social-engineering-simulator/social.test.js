import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { createSocialEngineeringService } from '../../../src/modules/games/social-engineering-simulator/service.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

let database
let app
let authOptions
let origin
const base = '/api/games/social-engineering-simulator'
const gameId = 'social-engineering-simulator'
const personal = { kind: 'personal' }
const owned = { users: [], cohorts: [], institutions: [], memberships: [] }
// the news feature is stubbed so this suite exercises only the social routes
const newsStub = { store: {}, provider: { configured: false } }

// a fake adapter so the suite never touches the network
const fakeAdapter = {
  configured: true,
  mode: 'local',
  chat: async () => ({ content: 'Could you read me the code?' }),
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
    .send({ email: student.email, password: 'Synthetic-Test-Password-2026' })
    .expect(200)
  return { ...student, agent, csrfToken: login.body.csrfToken }
}

// signed-in helpers: every mutation carries the origin and csrf token
const post = (student, path, body) =>
  student.agent.post(path).set('Origin', origin).set('X-CSRF-Token', student.csrfToken).send(body)
const get = (student, path) => student.agent.get(path).set('Origin', origin)

async function newCohort() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const institution = await institutionModel(database).create({
    name: `Soc School ${suffix}`,
    slug: `soc-${suffix}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Soc Class ${suffix}`,
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
  return membership
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('Social integration tests require an isolated test database')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
  await initializeCohortStorage(database)
  await initializeAttemptStorage(database, createProductionAttemptRegistry())
  origin = authOptions.clientOrigin
  app = createTestApp(database, authOptions, {
    news: newsStub,
    socialEngineering: {
      service: createSocialEngineeringService({ adapter: fakeAdapter }),
    },
  })
})

afterEach(async () => {
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
  for (const ids of Object.values(owned)) ids.length = 0
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

// starts a session, sends one message and completes with the given decision
async function play(student, context, decision = 'verify-independently') {
  const start = await post(student, `${base}/session`, { context }).expect(200)
  await post(student, `${base}/message`, {
    sessionId: start.body.sessionId,
    content: 'Who is this?',
  }).expect(200)
  const done = await post(student, `${base}/complete`, {
    sessionId: start.body.sessionId,
    decision,
  }).expect(200)
  return { start: start.body, done: done.body }
}

describe('social engineering simulator http api', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await request(app)
      .post(`${base}/session`)
      .send({ context: personal })
      .expect(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
    await request(app).post(`${base}/message`).send({}).expect(401)
  })

  it('saves a personal run as a readable attempt and replays the same result', async () => {
    const student = await createStudent()
    const { start, done } = await play(student, personal)
    expect(done).toMatchObject({ score: 100, maxScore: 100, saved: true, outcome: 'resisted' })
    expect(done.attempt).toMatchObject({ score: 100, maxScore: 100, persisted: true })
    const read = await get(student, `/api/attempts/${done.attempt.attemptId}`).expect(200)
    expect(read.body).toMatchObject({
      gameId,
      mode: 'practice',
      status: 'completed',
      score: 100,
      context: { kind: 'personal' },
    })
    expect(JSON.stringify(read.body)).not.toContain(start.resetCode)
    const again = await post(student, `${base}/complete`, {
      sessionId: start.sessionId,
      decision: 'verify-independently',
    }).expect(200)
    expect(again.body.attempt.attemptId).toBe(done.attempt.attemptId)
  })

  it('puts a class run on the class leaderboard', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    const { done } = await play(student, { kind: 'cohort', cohortId }, 'refuse')
    expect(done).toMatchObject({ saved: true, score: 75 })
    const board = await get(
      student,
      `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}`,
    ).expect(200)
    expect(board.body.rows.map((row) => [row.username, row.score])).toEqual([
      [student.user.username, 75],
    ])
  })

  it('hides a session from other players and refuses another class at start', async () => {
    const owner = await createStudent()
    const other = await createStudent()
    const start = await post(owner, `${base}/session`, { context: personal }).expect(200)
    const { sessionId } = start.body
    const probes = [
      ['message', { sessionId, content: 'hi' }],
      ['verifier-message', { sessionId, content: 'hi' }],
      ['nudge', { sessionId }],
      ['complete', { sessionId, decision: 'refuse' }],
    ]
    for (const [path, body] of probes) {
      const response = await post(other, `${base}/${path}`, body)
      expect(response.status, path).not.toBe(200)
      expect(response.body.error.code, path).not.toBe('SOC_INVALID_BODY')
    }
    const missing = await post(other, `${base}/complete`, { sessionId, decision: 'refuse' })
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('LLM_SESSION_NOT_FOUND')
    // the owner is unaffected
    await post(owner, `${base}/complete`, { sessionId, decision: 'refuse' }).expect(200)
    const cohortId = await newCohort()
    const foreign = await post(owner, `${base}/session`, {
      context: { kind: 'cohort', cohortId },
    })
    expect([403, 404]).toContain(foreign.status)
  })

  it('returns the score with saved false when membership ends mid-run', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    const membership = await addMember(student.user.id, cohortId)
    const start = await post(student, `${base}/session`, {
      context: { kind: 'cohort', cohortId },
    }).expect(200)
    await membershipModel(database).updateOne({ _id: membership._id }, { status: 'removed' })
    const done = await post(student, `${base}/complete`, {
      sessionId: start.body.sessionId,
      decision: 'refuse',
    }).expect(200)
    expect(done.body.saved).toBe(false)
    expect(done.body.saveError.code).toBeTruthy()
    expect(done.body).toHaveProperty('score')
  })

  it('refuses the public attempt route for this server-recorded game', async () => {
    const student = await createStudent()
    const response = await post(student, `/api/games/${gameId}/attempts`, {
      context: personal,
    }).expect(409)
    expect(response.body.error.code).toBe('ATTEMPT_SERVER_RECORDED')
  })

  it('requires a context to start a session', async () => {
    const student = await createStudent()
    const response = await post(student, `${base}/session`, {}).expect(400)
    expect(response.body.error.code).toBe('SOC_INVALID_BODY')
  })
})
