import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { membershipModel } from '../../../src/models/Membership.js'
import {
  caseDatasetVersion,
  caseEmailIds,
} from '../../../src/modules/games/phishing-post-mortem/service.js'
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
const attemptsPath = '/api/games/phishing-post-mortem/attempts'
// the news feature is stubbed so this suite exercises only the phishing attempts
const newsStub = { store: {}, provider: { configured: false } }

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('Phishing integration tests require an isolated test database')
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

async function cohortFor(student) {
  const institution = await institutionModel(database).create({
    name: 'Phish Test School',
    slug: `phish-${randomUUID()}`,
    status: 'active',
  })
  remember('institutions', institution._id)
  const cohort = await cohortModel(database).create({
    name: 'Phish Test Class',
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

const PART_IDS = /^p[0-9a-z]{4}$/
const ACTION_FIELDS_FORBIDDEN = ['verdict', 'type', 'tellPartIds', 'explanation', 'seed']

const triageAction = (snapshot, payload) => ({
  actionId: randomUUID(),
  expectedRevision: snapshot.revision,
  type: 'triage-call',
  payload,
})
const trustCurrent = (snapshot) => ({
  roundId: snapshot.publicState.current.roundId,
  call: 'trust',
})
const completeBody = (snapshot) => ({
  actionId: randomUUID(),
  expectedRevision: snapshot.revision,
})

async function play(student, snapshot, payload) {
  const path = `/api/attempts/${snapshot.attemptId}/actions`
  return (await post(student, path, triageAction(snapshot, payload)).expect(200)).body
}

async function startPersonal(student) {
  return (await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)).body
}

async function startClass(student) {
  const cohort = await cohortFor(student)
  const cohortId = String(cohort._id)
  const start = await post(student, attemptsPath, {
    context: { kind: 'cohort', cohortId },
  }).expect(201)
  return { cohortId, start: start.body }
}

describe('saved phishing triage journey', () => {
  it('starts personal practice without the answer key or seed', async () => {
    const student = await registerStudent(app)
    const start = await startPersonal(student)
    expect(start).toMatchObject({
      gameId: 'phishing-post-mortem',
      rulesetVersion: 'phish-3',
      mode: 'practice',
      deadlineAt: null,
    })
    const { current } = start.publicState
    expect(current.roundId).toBeTruthy()
    expect(current.parts.length).toBeGreaterThan(0)
    expect(start.publicState.last).toBeNull()
    expect(start.publicState).toMatchObject({ totalRounds: 12, maxMistakes: null })
    const serialized = JSON.stringify(start)
    for (const field of ACTION_FIELDS_FORBIDDEN) expect(serialized).not.toContain(`"${field}"`)
    expect(serialized).not.toMatch(/"[0-9a-f]{32}"/)
    for (const key of Object.keys(current)) expect(ACTION_FIELDS_FORBIDDEN).not.toContain(key)
  })

  it('validates the call payload', async () => {
    const student = await registerStudent(app)
    const start = await startPersonal(student)
    const path = `/api/attempts/${start.attemptId}/actions`
    const { roundId, parts } = start.publicState.current
    const bad = [
      { roundId, call: 'trust', extra: 1 },
      { roundId, call: 'report' },
      { roundId, call: 'trust', partId: parts[0].id },
      { roundId, call: 'report', partId: 'zzzzz' },
      { roundId, call: 'report', partId: parts[0].id, score: 100 },
      { roundId, call: 'maybe' },
      { call: 'trust' },
    ]
    for (const payload of bad) await post(student, path, triageAction(start, payload)).expect(400)
    const wrongType = { ...triageAction(start, { roundId, call: 'trust' }), type: 'submit-verdict' }
    await post(student, path, wrongType).expect(400)
    // an unknown but well formed part is rejected by the server, not scored
    expect(PART_IDS.test('pzz99')).toBe(true)
    await post(
      student,
      path,
      triageAction(start, { roundId, call: 'report', partId: 'pzz99' }),
    ).expect(400)
  })

  it('refuses a stale round id', async () => {
    const student = await registerStudent(app)
    const start = await startPersonal(student)
    const first = trustCurrent(start)
    const played = await play(student, start, first)
    const path = `/api/attempts/${start.attemptId}/actions`
    const stale = await post(student, path, triageAction(played, first)).expect(409)
    expect(stale.body.error.code).toBe('PHISH_STALE_ROUND')
  })

  it('completes a 12 round practice run, saves it and keeps it off the leaderboard', async () => {
    const student = await registerStudent(app)
    const cohort = await cohortFor(student)
    const start = await startPersonal(student)
    const path = `/api/attempts/${start.attemptId}`
    let snapshot = start
    await post(student, `${path}/complete`, completeBody(snapshot)).expect(409)
    for (let round = 0; round < 12; round += 1) {
      snapshot = await play(student, snapshot, trustCurrent(snapshot))
      expect(snapshot.publicState.last).toMatchObject({ roundId: expect.any(String) })
      expect(typeof snapshot.publicState.last.explanation).toBe('string')
    }
    expect(snapshot.publicState.current).toBeNull()
    const sent = triageAction(snapshot, trustCurrent(start))
    await post(student, `${path}/actions`, sent).expect(409)

    const done = await post(student, `${path}/complete`, completeBody(snapshot)).expect(200)
    expect(done.body).toMatchObject({ status: 'completed', persisted: true, mode: 'practice' })
    expect(done.body.publicState.review).toHaveLength(12)
    expect((await student.agent.get(path).expect(200)).body).toEqual(done.body)

    const board = await student.agent
      .get(`/api/cohorts/${cohort._id}/leaderboard?gameId=phishing-post-mortem&view=best`)
      .set('Origin', origin)
      .expect(200)
    expect(board.body.rows).toEqual([])
  })

  it('starts a class run as a timed ranked attempt', async () => {
    const student = await registerStudent(app)
    const { start } = await startClass(student)
    expect(start).toMatchObject({
      mode: 'standard',
      rulesetVersion: 'phish-3',
    })
    const stored = await database.db
      .collection('game_attempts')
      .findOne({ _id: new Types.ObjectId(start.attemptId) })
    expect(stored.competitiveEligible).toBe(true)
    const seconds = (new Date(start.deadlineAt) - new Date(start.startedAt)) / 1000
    expect(seconds).toBeGreaterThan(178)
    expect(seconds).toBeLessThan(182)
    expect(start.publicState).toMatchObject({ totalRounds: null, maxMistakes: 3 })
  })

  it('ends a class run on the third mistake and ranks it on the timed board', async () => {
    const student = await registerStudent(app)
    const { cohortId, start } = await startClass(student)
    const path = `/api/attempts/${start.attemptId}`
    let snapshot = start
    for (let guard = 0; guard < 60 && snapshot.publicState.mistakes < 3; guard += 1) {
      snapshot = await play(student, snapshot, trustCurrent(snapshot))
    }
    expect(snapshot.publicState.mistakes).toBe(3)
    expect(snapshot.publicState.current).toBeNull()
    expect(snapshot.publicState.last.correct).toBe(false)
    await post(
      student,
      `${path}/actions`,
      triageAction(snapshot, { roundId: 'abcdef', call: 'trust' }),
    ).expect(409)

    const done = await post(student, `${path}/complete`, completeBody(snapshot)).expect(200)
    expect(done.body).toMatchObject({ status: 'completed', persisted: true })

    const board = await student.agent
      .get(`/api/cohorts/${cohortId}/leaderboard?gameId=phishing-post-mortem&view=best`)
      .set('Origin', origin)
      .expect(200)
    expect(board.body).toMatchObject({ gameId: 'phishing-post-mortem', competitive: true })
    expect(board.body.rows).toHaveLength(1)
    expect(board.body.rows[0]).toMatchObject({
      username: student.user.username,
      rank: 1,
      score: done.body.score,
    })
  })

  it('refuses actions after the deadline, then still completes', async () => {
    const student = await registerStudent(app)
    const { start } = await startClass(student)
    const path = `/api/attempts/${start.attemptId}`
    const past = Date.now() - 1000
    await database.db
      .collection('game_attempts')
      .updateOne(
        { _id: new Types.ObjectId(start.attemptId) },
        { $set: { startedAt: new Date(past - 180000), deadlineAt: new Date(past) } },
      )
    const late = await post(
      student,
      `${path}/actions`,
      triageAction(start, trustCurrent(start)),
    ).expect(409)
    expect(late.body.error.code).toBe('ATTEMPT_DEADLINE_PASSED')
    const done = await post(student, `${path}/complete`, completeBody(start)).expect(200)
    expect(done.body).toMatchObject({ status: 'completed', persisted: true })
  })

  it('hides another player attempt', async () => {
    const student = await registerStudent(app)
    const start = await startPersonal(student)
    const path = `/api/attempts/${start.attemptId}`
    const other = await registerStudent(app)
    await other.agent.get(path).expect(404)
    await post(other, `${path}/actions`, triageAction(start, trustCurrent(start))).expect(404)
  })

  it('still reads an unfinished phish-2 attempt', async () => {
    const student = await registerStudent(app)
    const start = await startPersonal(student)
    const caseId = 'case-01'
    const collection = database.db.collection('game_attempts')
    const raw = await collection.findOne({ _id: new Types.ObjectId(start.attemptId) })
    const legacyId = new Types.ObjectId()
    await collection.insertOne({
      ...raw,
      _id: legacyId,
      rulesetVersion: 'phish-2',
      rulesetKey: 'phishing-post-mortem@phish-2',
      maxScore: 100,
      state: {
        caseId,
        datasetVersion: caseDatasetVersion(caseId),
        emailOrder: caseEmailIds(caseId),
        verdict: null,
      },
    })
    const read = await student.agent.get(`/api/attempts/${legacyId}`).expect(200)
    expect(read.body).toMatchObject({ rulesetVersion: 'phish-2', status: 'active' })
    expect(read.body.publicState.case.caseId).toBe(caseId)
    expect(read.body.publicState.verdict).toBeNull()
  })

  it('no longer serves the interim stateless routes', async () => {
    await post(await registerStudent(app), '/api/games/phishing-post-mortem/verdict', {}).expect(
      404,
    )
    const student = await registerStudent(app)
    await student.agent.get('/api/games/phishing-post-mortem/case').expect(404)
  })
})
