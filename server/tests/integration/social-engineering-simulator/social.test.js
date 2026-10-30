import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import {
  createRng,
  generateCall,
  planShift,
} from '../../../src/modules/games/social-engineering-simulator/callGenerator.js'
import { createSocialEngineeringService } from '../../../src/modules/games/social-engineering-simulator/service.js'
import { createShiftService } from '../../../src/modules/games/social-engineering-simulator/shiftService.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

let database
let app
let scriptedApp
let authOptions
let origin
const base = '/api/games/social-engineering-simulator'
const gameId = 'social-engineering-simulator'
const personal = { kind: 'personal' }
const owned = { users: [], cohorts: [], institutions: [], memberships: [] }
// the news feature is stubbed so this suite exercises only the social routes
const newsStub = { store: {}, provider: { configured: false } }

const shiftBase = `${base}/shift`
const SHIFT_SEED = 777
const CALL_SEEDS = [1001, 2002, 3003, 4004]

// every shift draws the same five seeds, so the test knows each private call
let drawn = 0
function seedCycle() {
  const seeds = [SHIFT_SEED, ...CALL_SEEDS]
  return () => seeds[drawn++ % seeds.length]
}
const shiftCalls = () => {
  const plan = planShift(createRng(SHIFT_SEED))
  return CALL_SEEDS.map((seed, index) => generateCall({ seed, index, genuine: plan[index] }))
}

// a fake adapter so the suite never touches the network
const fakeAdapter = {
  configured: true,
  mode: 'local',
  chat: async () => ({ content: 'Could you read me the code?' }),
}

async function createStudent(target = app) {
  const student = await registerTestStudent(target)
  owned.users.push(new Types.ObjectId(student.user.id))
  const agent = request.agent(target)
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
      shift: createShiftService({ adapter: fakeAdapter, randomSeedFn: seedCycle() }),
    },
  })
  // no keys at all: the shift runs fully scripted
  scriptedApp = createTestApp(database, authOptions, {
    news: newsStub,
    socialEngineering: { shift: createShiftService({ randomSeedFn: seedCycle() }) },
  })
})

beforeEach(() => {
  drawn = 0
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

// plays the four seeded calls with the right decision, using a desk tool first
async function playShift(student, context) {
  const first = await post(student, `${shiftBase}/start`, { context }).expect(200)
  const { shiftId } = first.body
  for (const [index, call] of shiftCalls().entries()) {
    if (index > 0) await post(student, `${shiftBase}/next`, { shiftId }).expect(200)
    await post(student, `${shiftBase}/tool`, { shiftId, tool: 'directory' }).expect(200)
    await post(student, `${shiftBase}/decide`, {
      shiftId,
      decision: call.genuine ? 'grant' : 'refuse',
    }).expect(200)
  }
  const done = await post(student, `${shiftBase}/complete`, { shiftId }).expect(200)
  return { start: first.body, done: done.body }
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

  it('scores a single call without saving it now that the shift is the saved ruleset', async () => {
    const student = await createStudent()
    const { done } = await play(student, personal, 'refuse')
    expect(done).toMatchObject({ saved: false, saveError: { code: 'SOC_SINGLE_CALL_NOT_SAVED' } })
    expect(done.score).toBeGreaterThan(0)
  })

  it('saves a personal shift as one readable attempt and replays the same result', async () => {
    const student = await createStudent()
    const { start, done } = await playShift(student, personal)
    expect(done).toMatchObject({ score: 430, maxScore: 430, saved: true, outcome: 'resisted' })
    expect(done.attempt).toMatchObject({ score: 430, maxScore: 430, persisted: true })
    const read = await get(student, `/api/attempts/${done.attempt.attemptId}`).expect(200)
    expect(read.body).toMatchObject({
      gameId,
      mode: 'practice',
      status: 'completed',
      score: 430,
      rulesetVersion: '2026-10-31',
      context: { kind: 'personal' },
    })
    for (const call of shiftCalls()) {
      expect(JSON.stringify(read.body)).not.toContain(call.secret.code)
    }
    const again = await post(student, `${shiftBase}/complete`, { shiftId: start.shiftId }).expect(
      200,
    )
    expect(again.body.attempt.attemptId).toBe(done.attempt.attemptId)
    const stored = await database.db
      .collection('game_attempts')
      .countDocuments({ playerId: new Types.ObjectId(student.user.id), gameId })
    expect(stored).toBe(1)
  })

  it('plays a fully scripted shift when no adapter is configured', async () => {
    const student = await createStudent(scriptedApp)
    const { start, done } = await playShift(student, personal)
    expect(start).toMatchObject({ mode: 'scripted', colleagueMode: 'scripted' })
    expect(done).toMatchObject({ saved: true, mode: 'scripted' })
    const chat = await post(student, `${shiftBase}/start`, { context: personal }).expect(200)
    const reply = await post(student, `${shiftBase}/message`, {
      shiftId: chat.body.shiftId,
      content: 'who are you?',
    }).expect(200)
    expect(reply.body.replyMode).toBe('scripted')
  })

  it('uses the fake adapter for chat on the same routes', async () => {
    const student = await createStudent()
    const first = await post(student, `${shiftBase}/start`, { context: personal }).expect(200)
    expect(first.body.mode).toBe('ai')
    const reply = await post(student, `${shiftBase}/message`, {
      shiftId: first.body.shiftId,
      content: 'who are you?',
    }).expect(200)
    expect(reply.body).toMatchObject({ replyMode: 'model', reply: 'Could you read me the code?' })
  })

  it('ends the shift after three typed codes and saves the played calls once', async () => {
    const student = await createStudent()
    const first = await post(student, `${shiftBase}/start`, { context: personal }).expect(200)
    const { shiftId } = first.body
    let last
    for (const [index, call] of shiftCalls().slice(0, 3).entries()) {
      if (index > 0) await post(student, `${shiftBase}/next`, { shiftId }).expect(200)
      last = await post(student, `${shiftBase}/message`, {
        shiftId,
        content: `it is ${call.secret.code}`,
      }).expect(200)
    }
    expect(last.body).toMatchObject({ leaked: true, strikes: 3, finishReason: 'strikes' })
    const done = await post(student, `${shiftBase}/complete`, { shiftId }).expect(200)
    expect(done.body).toMatchObject({ saved: true, outcome: 'compromised', endedEarly: true })
    const stored = await database.db
      .collection('game_attempts')
      .countDocuments({ playerId: new Types.ObjectId(student.user.id), gameId })
    expect(stored).toBe(1)
  })

  it('puts a class shift on the class leaderboard', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    const { done } = await playShift(student, { kind: 'cohort', cohortId })
    expect(done).toMatchObject({ saved: true, score: 430 })
    const board = await get(
      student,
      `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}`,
    ).expect(200)
    expect(board.body.rows.map((row) => [row.username, row.score])).toEqual([
      [student.user.username, 430],
    ])
  })

  it('hides a shift from other players and refuses another class at start', async () => {
    const owner = await createStudent()
    const other = await createStudent()
    const start = await post(owner, `${shiftBase}/start`, { context: personal }).expect(200)
    const { shiftId } = start.body
    const probes = [
      ['message', { shiftId, content: 'hi' }],
      ['colleague', { shiftId, content: 'hi' }],
      ['tool', { shiftId, tool: 'directory' }],
      ['hint', { shiftId }],
      ['nudge', { shiftId }],
      ['decide', { shiftId, decision: 'refuse' }],
      ['next', { shiftId }],
      ['complete', { shiftId }],
    ]
    for (const [path, body] of probes) {
      const response = await post(other, `${shiftBase}/${path}`, body)
      expect(response.status, path).toBe(404)
      expect(response.body.error.code, path).toBe('SOC_SHIFT_NOT_FOUND')
    }
    await post(owner, `${shiftBase}/decide`, { shiftId, decision: 'refuse' }).expect(200)
    const cohortId = await newCohort()
    const foreign = await post(owner, `${shiftBase}/start`, {
      context: { kind: 'cohort', cohortId },
    })
    expect([403, 404]).toContain(foreign.status)
  })

  it('hides a single-call session from other players', async () => {
    const owner = await createStudent()
    const other = await createStudent()
    const start = await post(owner, `${base}/session`, { context: personal }).expect(200)
    const missing = await post(other, `${base}/complete`, {
      sessionId: start.body.sessionId,
      decision: 'refuse',
    })
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('LLM_SESSION_NOT_FOUND')
  })

  it('returns the score with saved false when membership ends mid-shift', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    const membership = await addMember(student.user.id, cohortId)
    const start = await post(student, `${shiftBase}/start`, {
      context: { kind: 'cohort', cohortId },
    }).expect(200)
    const { shiftId } = start.body
    for (const [index, call] of shiftCalls().entries()) {
      if (index > 0) await post(student, `${shiftBase}/next`, { shiftId }).expect(200)
      await post(student, `${shiftBase}/decide`, {
        shiftId,
        decision: call.genuine ? 'callback' : 'refuse',
      }).expect(200)
    }
    await membershipModel(database).updateOne({ _id: membership._id }, { status: 'removed' })
    const done = await post(student, `${shiftBase}/complete`, { shiftId }).expect(200)
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
