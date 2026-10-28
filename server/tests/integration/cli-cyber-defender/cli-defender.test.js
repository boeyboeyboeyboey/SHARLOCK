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
import { formatCommand } from '../../../src/modules/games/cli-cyber-defender/parser.js'
import { SCENARIOS } from '../../../src/modules/games/cli-cyber-defender/scenarios.js'
import { createCliDefenderService } from '../../../src/modules/games/cli-cyber-defender/service.js'
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
const clock = { now: Date.parse('2026-10-12T08:00:00Z') }
const base = '/api/games/cli-cyber-defender/runs'
const gameId = 'cli-cyber-defender'
const personal = { kind: 'personal' }
const owned = { users: [], cohorts: [], institutions: [], memberships: [] }
// the news feature is stubbed so this suite exercises only the cli routes
const newsStub = { store: {}, provider: { configured: false } }

function scenarioFor(current) {
  return SCENARIOS.find((item) => item.alert.title === current.alert.title)
}

// the ordered containment commands for an incident, or dismiss for a decoy
function answersFor(current) {
  const scenario = scenarioFor(current)
  return scenario.steps.length
    ? scenario.steps.map(({ verb, target }) => formatCommand(verb, target))
    : ['dismiss']
}

let counter = 0
const actionId = () => `it-action-${String((counter += 1)).padStart(4, '0')}`

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
    name: `Cli School ${suffix}`,
    slug: `cli-${suffix}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    institutionId: institution._id,
    name: `Cli Class ${suffix}`,
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

// plays every incident correctly and completes; returns the completion body
async function playPerfect(student, mode, context) {
  const start = await post(student, base, { mode, context }).expect(200)
  let snapshot = start.body
  while (snapshot.current) {
    const incidentId = snapshot.current.incidentId
    for (const command of answersFor(snapshot.current)) {
      clock.now += 1500
      const response = await post(student, `${base}/${snapshot.runId}/commands`, {
        actionId: actionId(),
        incidentId,
        command,
      }).expect(200)
      snapshot = response.body
    }
  }
  const done = await post(student, `${base}/${snapshot.runId}/complete`, {
    actionId: actionId(),
  }).expect(200)
  return done.body
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('CLI integration tests require an isolated test database')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
  await initializeCohortStorage(database)
  await initializeAttemptStorage(database, createProductionAttemptRegistry())
  origin = authOptions.clientOrigin
  app = createTestApp(database, authOptions, {
    news: newsStub,
    cliDefender: {
      service: createCliDefenderService({ now: () => clock.now, randomInt: () => 0 }),
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

describe('cli cyber defender http api', () => {
  it('rejects unauthenticated requests', async () => {
    await request(app).post(base).send({ mode: 'practice', context: personal }).expect(401)
    const read = await request(app).get(`${base}/00000000-0000-4000-8000-000000000000`).expect(401)
    expect(read.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('saves a personal practice run as a readable attempt', async () => {
    const student = await createStudent()
    const done = await playPerfect(student, 'practice', personal)
    expect(done).toMatchObject({ score: 2700, maxScore: 2700, saved: true })
    expect(done.debrief).toHaveLength(8)
    expect(done.attempt).toMatchObject({ score: 2700, maxScore: 2700, persisted: true })
    const read = await get(student, `/api/attempts/${done.attempt.attemptId}`).expect(200)
    expect(read.body).toMatchObject({
      gameId,
      mode: 'practice',
      status: 'completed',
      score: 2700,
      context: { kind: 'personal' },
    })
    // completing again returns the same saved attempt
    const again = await post(student, `${base}/${done.runId}/complete`, {
      actionId: actionId(),
    }).expect(200)
    expect(again.body.attempt.attemptId).toBe(done.attempt.attemptId)
  })

  it('ranks a timed class run on Best and keeps practice to the all-time board', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    const context = { kind: 'cohort', cohortId }
    const timed = await playPerfect(student, 'timed', context)
    expect(timed).toMatchObject({ saved: true, score: 2700 })
    const practice = await playPerfect(student, 'practice', context)
    expect(practice.saved).toBe(true)
    const best = await get(student, `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}`).expect(
      200,
    )
    expect(best.body.rows.map((row) => [row.username, row.score])).toEqual([
      [student.user.username, 2700],
    ])
    const all = await get(
      student,
      `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}&view=all-time`,
    ).expect(200)
    expect(all.body.rows[0]).toMatchObject({ username: student.user.username, plays: 2 })
  })

  it('keeps a practice-only class player off the Best board', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    await addMember(student.user.id, cohortId)
    await playPerfect(student, 'practice', { kind: 'cohort', cohortId })
    const best = await get(student, `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}`).expect(
      200,
    )
    expect(best.body.rows).toHaveLength(0)
    const all = await get(
      student,
      `/api/cohorts/${cohortId}/leaderboard?gameId=${gameId}&view=all-time`,
    ).expect(200)
    expect(all.body.rows).toHaveLength(1)
  })

  it('hides a run from other players and refuses foreign classes at start', async () => {
    const owner = await createStudent()
    const other = await createStudent()
    const start = await post(owner, base, { mode: 'practice', context: personal }).expect(200)
    const missing = await get(other, `${base}/${start.body.runId}`).expect(404)
    expect(missing.body.error.code).toBe('CLI_RUN_NOT_FOUND')
    await post(other, `${base}/${start.body.runId}/complete`, { actionId: actionId() }).expect(404)
    await get(owner, `${base}/${start.body.runId}`).expect(200)
    const cohortId = await newCohort()
    const foreign = await post(owner, base, {
      mode: 'practice',
      context: { kind: 'cohort', cohortId },
    })
    expect([403, 404]).toContain(foreign.status)
  })

  it('returns the score with saved false when membership ends mid-run', async () => {
    const student = await createStudent()
    const cohortId = await newCohort()
    const membership = await addMember(student.user.id, cohortId)
    const start = await post(student, base, {
      mode: 'practice',
      context: { kind: 'cohort', cohortId },
    }).expect(200)
    await membershipModel(database).updateOne({ _id: membership._id }, { status: 'removed' })
    const done = await post(student, `${base}/${start.body.runId}/complete`, {
      actionId: actionId(),
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

  it('plays a timed shift without caching or leaking answers', async () => {
    const student = await createStudent()
    const start = await post(student, base, { mode: 'timed', context: personal }).expect(200)
    expect(start.headers['cache-control']).toBe('no-store')
    expect(start.body).toMatchObject({ mode: 'timed', status: 'active', saved: false })
    const payload = JSON.stringify(start.body)
    for (const scenario of SCENARIOS) expect(payload).not.toContain(scenario.explanation)
    const early = await post(student, `${base}/${start.body.runId}/complete`, {
      actionId: actionId(),
    }).expect(409)
    expect(early.body.error.code).toBe('CLI_RUN_NOT_FINISHED')
  })

  it('reports a closed incident once its window has passed', async () => {
    const student = await createStudent()
    const start = await post(student, base, { mode: 'timed', context: personal }).expect(200)
    clock.now = start.body.current.closesAt
    const late = await post(student, `${base}/${start.body.runId}/commands`, {
      actionId: actionId(),
      incidentId: start.body.current.incidentId,
      command: answersFor(start.body.current)[0],
    }).expect(409)
    expect(late.body.error.code).toBe('CLI_INCIDENT_CLOSED')
    expect(late.body.requestId).toBeTruthy()
  })

  it('pauses and resumes a timed shift and serves practice hints', async () => {
    const student = await createStudent()
    const start = await post(student, base, { mode: 'timed', context: personal }).expect(200)
    const { runId } = start.body
    const paused = await post(student, `${base}/${runId}/pause`, {}).expect(200)
    expect(paused.body.paused).toBe(true)
    expect(paused.body.current.alert).toBeNull()
    const resumed = await post(student, `${base}/${runId}/resume`, {}).expect(200)
    expect(resumed.body.paused).toBe(false)
    await post(student, `${base}/${runId}/pause`, { force: true }).expect(400)
    const refused = await post(student, `${base}/${runId}/hint`, {
      incidentId: 'incident-01',
    }).expect(409)
    expect(refused.body.error.code).toBe('CLI_HINT_UNAVAILABLE')
    const practice = await post(student, base, { mode: 'practice', context: personal }).expect(200)
    const hint = await post(student, `${base}/${practice.body.runId}/hint`, {
      incidentId: 'incident-01',
    }).expect(200)
    expect(Number.isInteger(hint.body.hint.lineIndex)).toBe(true)
    expect(JSON.stringify(hint.body)).not.toContain('expectedCommand')
    expect(hint.body.hint.lookup).toBe(scenarioFor(practice.body.current).hintLookup)
  })

  it('serves scripted lookups and dismiss without leaking the answer', async () => {
    const student = await createStudent()
    const start = await post(student, base, { mode: 'practice', context: personal }).expect(200)
    const { runId } = start.body
    const incidentId = start.body.current.incidentId
    const scenario = scenarioFor(start.body.current)
    const [key, lines] = Object.entries(scenario.lookups)[0]
    const lookup = await post(student, `${base}/${runId}/commands`, {
      actionId: actionId(),
      incidentId,
      command: key,
    }).expect(200)
    expect(lookup.body).toMatchObject({ outcome: 'lookup', pointsAwarded: 0, score: 0 })
    expect(lookup.body.current.lookups).toEqual({
      used: 1,
      limit: 6,
      results: [{ command: key, lines }],
    })
    const reread = await get(student, `${base}/${runId}`).expect(200)
    expect(reread.body.current.lookups.used).toBe(1)
    const payload = JSON.stringify(reread.body)
    for (const word of ['decoy', '"steps"', 'expectedCommand']) expect(payload).not.toContain(word)
    // a containment command the shift never needs reveals the review only when the incident closes
    const wrong = await post(student, `${base}/${runId}/commands`, {
      actionId: actionId(),
      incidentId,
      command: scenario.decoy ? 'isolate host not-the-host' : 'dismiss',
    }).expect(200)
    expect(wrong.body).toMatchObject({
      outcome: 'wrong',
      incidentClosed: true,
      timePenaltySeconds: 0,
    })
    expect(wrong.body.review.decoy).toBe(Boolean(scenario.decoy))
  })

  it('cuts 5 seconds from the clock for a wrong action in a timed shift only', async () => {
    const student = await createStudent()
    const start = await post(student, base, { mode: 'timed', context: personal }).expect(200)
    const scenario = scenarioFor(start.body.current)
    const wrong = await post(student, `${base}/${start.body.runId}/commands`, {
      actionId: actionId(),
      incidentId: start.body.current.incidentId,
      command: scenario.decoy ? 'isolate host not-the-host' : 'dismiss',
    }).expect(200)
    expect(wrong.body.timePenaltySeconds).toBe(5)
    expect(wrong.body.current.penaltySeconds).toBe(5)
  })

  it('rejects malformed bodies and unknown run ids', async () => {
    const student = await createStudent()
    const response = await post(student, base, {
      mode: 'timed',
      context: personal,
      score: 9999,
    }).expect(400)
    expect(response.body.error).toMatchObject({
      code: 'CLI_INVALID_BODY',
      fieldErrors: { score: 'unsupported field' },
    })
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at .*\.js/)
    await post(student, base, { mode: 'timed' }).expect(400)
    const bad = await get(student, `${base}/not-a-run`).expect(404)
    expect(bad.body.error.code).toBe('CLI_RUN_NOT_FOUND')
  })

  it('paces a client that floods the endpoint', async () => {
    const paced = createTestApp(database, authOptions, {
      news: newsStub,
      cliDefender: { limit: 2 },
    })
    const student = await registerTestStudent(paced)
    owned.users.push(new Types.ObjectId(student.user.id))
    const agent = request.agent(paced)
    const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ email: student.email, password: 'Synthetic-Test-Password-2026' })
      .expect(200)
    const start = () =>
      agent
        .post(base)
        .set('Origin', origin)
        .set('X-CSRF-Token', login.body.csrfToken)
        .send({ mode: 'practice', context: personal })
    await start().expect(200)
    await start().expect(200)
    const third = await start().expect(429)
    expect(third.body.error.code).toBe('CLI_RATE_LIMITED')
  })
})
