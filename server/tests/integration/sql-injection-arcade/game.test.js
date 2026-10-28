import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
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
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

import { generateCase } from '../../../src/modules/games/sql-injection-arcade/generator/index.js'
import { solutionFor } from '../../unit/sql-injection-arcade/helpers.js'

let database, app, auth, origin
beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('A disposable test database is required')
  assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
  database = await connectDatabase(config.databaseUri)
  auth = await initializeTestAuth(database, config)
  origin = auth.clientOrigin
  await initializeCohortStorage(database)
  await initializeAttemptStorage(database, createProductionAttemptRegistry())
})
beforeEach(() => {
  app = createTestApp(database, auth)
})
afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})
const gamePath = '/api/games/sql-injection-arcade/attempts'
function post(student, path, body) {
  return student.agent
    .post(path)
    .set('Origin', origin)
    .set('X-CSRF-Token', student.csrfToken)
    .send(body)
}
function action(snapshot, type, payload) {
  return { actionId: randomUUID(), expectedRevision: snapshot.revision, type, payload }
}
// the stored seed is the determinism seam: tests rebuild each private case from it
async function seedOf(attemptId) {
  const document = await database.db
    .collection('game_attempts')
    .findOne({ _id: new Types.ObjectId(attemptId) })
  return document.state.seed
}
const caseId = (snapshot) => snapshot.publicState.current.caseId
async function solveCurrent(student, snapshot, seed) {
  const index = snapshot.publicState.casesClosed
  const c = generateCase({ seed, index })
  let latest = snapshot
  for (const step of solutionFor(c)) {
    latest = (
      await post(
        student,
        `/api/attempts/${snapshot.attemptId}/actions`,
        action(latest, step.type, step.payload),
      ).expect(200)
    ).body
  }
  return latest
}
async function classFor(student, status = 'active') {
  const institution = await institutionModel(database).create({
    name: 'SQL Test School',
    slug: `sql-${randomUUID()}`,
    status: 'active',
  })
  const cohort = await cohortModel(database).create({
    name: 'SQL Test Class',
    institutionId: institution._id,
    term: '2026',
    status: 'active',
  })
  const membership = await membershipModel(database).create({
    userId: student.user.id,
    cohortId: cohort._id,
    status,
  })
  return { cohort, membership }
}

describe('saved SQL run', () => {
  it('starts practice without answers, plays a full run, completes once and keeps raw input out', async () => {
    const student = await registerTestStudent(app)
    const start = await post(student, gamePath, { context: { kind: 'personal' } }).expect(201)
    expect(start.body).toMatchObject({
      rulesetVersion: 'sql-2',
      mode: 'practice',
      deadlineAt: null,
      persisted: true,
    })
    expect(start.body.publicState).toMatchObject({
      totalCases: 12,
      lives: null,
      current: { number: 1 },
    })
    const id = start.body.attemptId
    const seed = await seedOf(id)
    const text = JSON.stringify(start.body)
    expect(text).not.toContain(seed)
    for (const forbidden of ['"model"', '"correctId"', '"answer"', '"seed"', '"private"'])
      expect(text).not.toContain(forbidden)
    let snapshot = start.body
    let expected = 0
    for (let slot = 0; slot < 15; slot += 1) {
      const c = generateCase({ seed, index: slot })
      expected += c.private.kind === 'repair' ? 10 : c.private.tier * 10 + 10
      snapshot = await solveCurrent(student, snapshot, seed)
    }
    expect(snapshot.score).toBe(expected)
    expect(snapshot.publicState.current).toBeNull()
    const path = `/api/attempts/${id}`
    const finish = { actionId: randomUUID(), expectedRevision: snapshot.revision }
    const results = await Promise.all([
      post(student, `${path}/complete`, finish),
      post(student, `${path}/complete`, finish),
    ])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    expect(results[0].body).toEqual(results[1].body)
    expect(results[0].body).toMatchObject({
      status: 'completed',
      mode: 'practice',
      score: expected,
    })
    expect(results[0].body.publicState.review).toHaveLength(15)
    expect((await student.agent.get(path).expect(200)).body).toEqual(results[0].body)
    const document = await database.db
      .collection('game_attempts')
      .findOne({ _id: new Types.ObjectId(id) })
    expect(document.competitiveEligible).toBe(false)
    expect(JSON.stringify(document)).not.toContain("' OR 1=1--")
    await post(
      student,
      `${path}/actions`,
      action(results[0].body, 'hint', { caseId: 'abcdef' }),
    ).expect(409)
  })

  it('marks a hinted case assisted and rejects stale, malformed and out-of-phase actions', async () => {
    const student = await registerTestStudent(app)
    const start = (await post(student, gamePath, { context: { kind: 'personal' } }).expect(201))
      .body
    const path = `/api/attempts/${start.attemptId}/actions`
    const hinted = await post(
      student,
      path,
      action(start, 'hint', { caseId: caseId(start) }),
    ).expect(200)
    expect(hinted.body.publicState.current).toMatchObject({ assisted: true })
    expect(hinted.body.publicState.current.hint).toBeTruthy()
    await post(student, path, action(hinted.body, 'hint', { caseId: caseId(start) })).expect(409)
    await post(
      student,
      path,
      action(hinted.body, 'attempt', { caseId: 'zzzzzz', inputs: ['x'] }),
    ).expect(409)
    await post(
      student,
      path,
      action(hinted.body, 'attempt', { caseId: caseId(start), inputs: ['x'], score: 5 }),
    ).expect(400)
    await post(
      student,
      path,
      action(hinted.body, 'answer', { caseId: caseId(start), value: 'yes' }),
    ).expect(409)
    const seed = await seedOf(start.attemptId)
    const solved = await solveCurrent(student, hinted.body, seed)
    const c = generateCase({ seed, index: 0 })
    expect(solved.score).toBe(c.private.tier * 10)
    expect(solved.publicState.last).toMatchObject({ solved: true, closed: true })
    expect(solved.publicState.last.explanation).toBeTruthy()
  })

  it('runs a timed ranked class attempt and enforces the deadline', async () => {
    const student = await registerTestStudent(app)
    const { cohort } = await classFor(student)
    const start = (
      await post(student, gamePath, {
        context: { kind: 'cohort', cohortId: String(cohort._id) },
      }).expect(201)
    ).body
    expect(start).toMatchObject({ mode: 'standard' })
    expect(start.publicState).toMatchObject({ maxLives: 3, lives: 3, totalCases: null })
    expect(new Date(start.deadlineAt).getTime() - new Date(start.startedAt).getTime()).toBe(180000)
    const id = start.attemptId
    const path = `/api/attempts/${id}`
    await post(student, `${path}/actions`, action(start, 'hint', { caseId: caseId(start) })).expect(
      409,
    )
    const seed = await seedOf(id)
    const solved = await solveCurrent(student, start, seed)
    expect(solved.score).toBeGreaterThan(0)
    await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: solved.revision,
    }).expect(409)
    await database.db.collection('game_attempts').updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          startedAt: new Date(Date.now() - 200000),
          deadlineAt: new Date(Date.now() - 1000),
        },
      },
    )
    const late = generateCase({ seed, index: 1 })
    const step = solutionFor(late)[0]
    const refused = await post(student, `${path}/actions`, action(solved, step.type, step.payload))
    expect(refused.status).toBeGreaterThanOrEqual(400)
    const done = await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: solved.revision,
    }).expect(200)
    expect(done.body).toMatchObject({ status: 'completed', mode: 'standard', score: solved.score })
    const document = await database.db
      .collection('game_attempts')
      .findOne({ _id: new Types.ObjectId(id) })
    expect(document.competitiveEligible).toBe(true)
  })

  it('hides attempts from other accounts', async () => {
    const student = await registerTestStudent(app)
    const start = (await post(student, gamePath, { context: { kind: 'personal' } }).expect(201))
      .body
    const path = `/api/attempts/${start.attemptId}`
    const other = await registerTestStudent(app)
    await other.agent.get(path).expect(404)
    await post(other, `${path}/actions`, action(start, 'hint', { caseId: caseId(start) })).expect(
      404,
    )
    await post(other, `${path}/complete`, { actionId: randomUUID(), expectedRevision: 0 }).expect(
      404,
    )
  })

  it('offers only eligible contexts and rechecks pending/removed class access', async () => {
    const student = await registerTestStudent(app)
    const active = await classFor(student)
    const pending = await classFor(student, 'pending')
    const contexts = await student.agent.get('/api/attempt-contexts?page=1&limit=50').expect(200)
    expect(contexts.body.cohorts.map((item) => item.cohortId)).toEqual([String(active.cohort._id)])
    await student.agent.get('/api/attempt-contexts?limit=51').expect(400)
    await student.agent.get('/api/attempt-contexts?page=1&page=2').expect(400)
    await student.agent.get('/api/attempt-contexts?userId=other').expect(400)
    await post(student, gamePath, {
      context: { kind: 'cohort', cohortId: String(pending.cohort._id) },
    }).expect(404)
    const start = await post(student, gamePath, {
      context: { kind: 'cohort', cohortId: String(active.cohort._id) },
    }).expect(201)
    await membershipModel(database).updateOne(
      { _id: active.membership._id },
      { $set: { status: 'removed' } },
    )
    await student.agent.get(`/api/attempts/${start.body.attemptId}`).expect(404)
    await post(
      student,
      `/api/attempts/${start.body.attemptId}/actions`,
      action(start.body, 'hint', { caseId: 'abcdef' }),
    ).expect(404)
    const other = await registerTestStudent(app)
    await post(other, gamePath, {
      context: { kind: 'cohort', cohortId: String(active.cohort._id) },
    }).expect(404)
  })

  it('requires sessions, origin and CSRF and refuses client scores', async () => {
    await request(app).get('/api/attempt-contexts').expect(401)
    await request(app)
      .post(gamePath)
      .send({ context: { kind: 'personal' } })
      .expect(401)
    const student = await registerTestStudent(app)
    await student.agent
      .post(gamePath)
      .set('Origin', origin)
      .send({ context: { kind: 'personal' } })
      .expect(403)
    await post(student, gamePath, { context: { kind: 'personal' } })
      .set('Origin', 'http://untrusted.example')
      .expect(403)
    await post(student, gamePath, { context: { kind: 'personal' }, score: 100 }).expect(400)
  })
})
