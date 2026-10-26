import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeCohortStorage } from '../../../src/modules/cohorts/storage.js'
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { readAnswers, readCase } from '../../unit/phishing-post-mortem/fixtures.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

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
  app = createTestApp(database, auth, { news: newsStub })
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
  const cohort = await cohortModel(database).create({
    name: 'Phish Test Class',
    institutionId: institution._id,
    term: '2026',
    status: 'active',
  })
  await membershipModel(database).create({
    userId: student.user.id,
    cohortId: cohort._id,
    status: 'active',
  })
  return cohort
}

const verdictAction = (snapshot, payload) => ({
  actionId: randomUUID(),
  expectedRevision: snapshot.revision,
  type: 'submit-verdict',
  payload,
})
const perfect = (caseId) => {
  const answers = readAnswers(caseId)
  return { selectedEmailId: answers.patientZeroId, evidenceIds: answers.evidenceIds }
}

describe('saved phishing post-mortem journey', () => {
  it('starts a personal attempt without the answer key and saves a perfect verdict', async () => {
    const student = await registerTestStudent(app)
    const start = await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)
    expect(start.body).toMatchObject({
      gameId: 'phishing-post-mortem',
      rulesetVersion: 'phish-2',
      maxScore: 100,
      mode: 'practice',
    })
    const { caseId } = start.body.publicState.case
    const answers = readAnswers(caseId)
    const content = readCase(caseId)
    expect(start.body.publicState.verdict).toBeNull()
    expect(start.body.publicState.case.emails).toHaveLength(content.emails.length)
    const hidden = JSON.stringify(start.body)
    expect(hidden).not.toContain('patientZeroId')
    expect(hidden).not.toContain(answers.summary)
    for (const step of answers.chain) expect(hidden).not.toContain(step)

    const path = `/api/attempts/${start.body.attemptId}`
    await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: start.body.revision,
    }).expect(409)

    const sent = verdictAction(start.body, perfect(caseId))
    const played = await post(student, `${path}/actions`, sent).expect(200)
    expect(played.body.publicState.verdict).toMatchObject({ score: 100 })
    expect(played.body.publicState.verdict.debrief.chain.length).toBeGreaterThanOrEqual(5)
    // replaying the same action returns the recorded outcome
    expect((await post(student, `${path}/actions`, sent).expect(200)).body).toEqual(played.body)

    const again = verdictAction(played.body, perfect(caseId))
    const rejected = await post(student, `${path}/actions`, again).expect(409)
    expect(rejected.body.error.code).toBe('PHISH_VERDICT_SUBMITTED')

    const done = await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: played.body.revision,
    }).expect(200)
    expect(done.body).toMatchObject({ score: 100, status: 'completed', persisted: true })
    expect((await student.agent.get(path).expect(200)).body).toEqual(done.body)
  })

  it('rejects client supplied scoring fields and unknown selections', async () => {
    const student = await registerTestStudent(app)
    const start = await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)
    const path = `/api/attempts/${start.body.attemptId}/actions`
    const good = perfect(start.body.publicState.case.caseId)
    await post(student, path, verdictAction(start.body, { ...good, score: 100 })).expect(400)
    await post(student, path, verdictAction(start.body, { ...good, caseId: 'case-02' })).expect(400)
    await post(
      student,
      path,
      verdictAction(start.body, { ...good, selectedEmailId: 'zz99' }),
    ).expect(400)
    const wrongType = { ...verdictAction(start.body, good), type: 'reveal' }
    await post(student, path, wrongType).expect(400)
  })

  it('hides another player attempt', async () => {
    const student = await registerTestStudent(app)
    const start = await post(student, attemptsPath, { context: { kind: 'personal' } }).expect(201)
    const path = `/api/attempts/${start.body.attemptId}`
    const other = await registerTestStudent(app)
    await other.agent.get(path).expect(404)
    await post(
      other,
      `${path}/actions`,
      verdictAction(start.body, perfect(start.body.publicState.case.caseId)),
    ).expect(404)
  })

  it('saves a class attempt onto the cohort leaderboard', async () => {
    const student = await registerTestStudent(app)
    const cohort = await cohortFor(student)
    const cohortId = String(cohort._id)
    const start = await post(student, attemptsPath, {
      context: { kind: 'cohort', cohortId },
    }).expect(201)
    const path = `/api/attempts/${start.body.attemptId}`
    const played = await post(
      student,
      `${path}/actions`,
      verdictAction(start.body, perfect(start.body.publicState.case.caseId)),
    ).expect(200)
    await post(student, `${path}/complete`, {
      actionId: randomUUID(),
      expectedRevision: played.body.revision,
    }).expect(200)

    const board = await student.agent
      .get(`/api/cohorts/${cohortId}/leaderboard?gameId=phishing-post-mortem`)
      .set('Origin', origin)
      .expect(200)
    expect(board.body).toMatchObject({ gameId: 'phishing-post-mortem', competitive: false })
    expect(board.body.rows.map((row) => [row.username, row.score, row.maxScore])).toEqual([
      [student.user.username, 100, 100],
    ])
  })

  it('no longer serves the interim stateless routes', async () => {
    await post(
      await registerTestStudent(app),
      '/api/games/phishing-post-mortem/verdict',
      {},
    ).expect(404)
    const student = await registerTestStudent(app)
    await student.agent.get('/api/games/phishing-post-mortem/case').expect(404)
  })
})
