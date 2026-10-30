import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { AuthError } from '../../../src/modules/auth/policy.js'
import { AttemptError } from '../../../src/modules/attempts/policy.js'
import { createSocialEngineeringRouter } from '../../../src/modules/games/social-engineering-simulator/router.js'
import { LlmError } from '../../../src/modules/games/social-engineering-simulator/llm/llmError.js'
import { createSocialEngineeringService } from '../../../src/modules/games/social-engineering-simulator/service.js'

const SESSION = '11111111-1111-1111-1111-111111111111'

// a stub service so the router tests never build an llm adapter
function stubService(overrides = {}) {
  return {
    startSession: () => ({
      sessionId: SESSION,
      persona: { id: 'it-helpdesk', displayName: 'Jordan Vale (IT Service Desk)' },
      brief: { title: 'IT Service Desk is paging you', objective: 'protect it', turnBudget: 8 },
      openingMessage: 'Hi, this is Jordan.',
    }),
    sendMessage: async () => ({
      reply: 'Could you read me the code?',
      turnsUsed: 1,
      turnBudget: 8,
      leaked: false,
      ended: false,
    }),
    sendVerifierMessage: async () => ({
      reply: 'Yes, that was me.',
      verifierTurnsUsed: 1,
      verifierTurnBudget: 5,
      leaked: false,
      ended: false,
    }),
    nudge: () => ({ message: 'Hurry up please.', nudgesLeft: 2 }),
    complete: () => ({
      score: 100,
      maxScore: 100,
      outcome: 'resisted',
      breakdown: [],
      saved: false,
    }),
    ...overrides,
  }
}

const START = { context: { kind: 'personal' } }

// signs every request in as the player named by the x-player header
function fakeSession(request, response, next) {
  const id = request.get('x-player')
  if (!id) return next(new AuthError('AUTHENTICATION_REQUIRED'))
  response.locals.authUser = { id }
  next()
}

function fakeAttempts(overrides = {}) {
  return {
    resolveRunContext: vi.fn(async (_actor, context) => ({ ...context })),
    recordCompletedAttempt: vi.fn(async () => ({
      attemptId: 'attempt-1',
      score: 100,
      maxScore: 100,
      persisted: true,
      context: { kind: 'personal' },
    })),
    ...overrides,
  }
}

function makeApp(service, now = Date.now, attempts = fakeAttempts()) {
  const app = express()
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID()
    next()
  })
  app.use(express.json())
  app.use(
    '/api',
    createSocialEngineeringRouter({
      service,
      attempts,
      requireSession: [fakeSession],
      now,
    }),
  )
  return app
}

const base = '/api/games/social-engineering-simulator'

// signed-in request helper: the header names the player
const request = (app, player = 'player-1') => ({
  post: (path) => supertest(app).post(path).set('x-player', player),
})

describe('social-engineering router', () => {
  it('answers a repeated complete with the same result', async () => {
    const adapter = { configured: true, mode: 'local', chat: vi.fn() }
    const app = makeApp(createSocialEngineeringService({ adapter }))
    const { body: start } = await request(app).post(`${base}/session`).send(START).expect(200)
    const payload = { sessionId: start.sessionId, decision: 'refuse' }

    const first = await request(app).post(`${base}/complete`).send(payload).expect(200)
    const second = await request(app).post(`${base}/complete`).send(payload).expect(200)

    expect(second.body).toEqual(first.body)
  })

  it('starts a session with no-store caching', async () => {
    const response = await request(makeApp(stubService()))
      .post(`${base}/session`)
      .send(START)
      .expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.persona.id).toBe('it-helpdesk')
  })

  it('rejects an invalid message body with a safe envelope', async () => {
    const response = await request(makeApp(stubService()))
      .post(`${base}/message`)
      .send({ sessionId: 'not-a-uuid', content: 'hi' })
      .expect(400)
    expect(response.body.error.code).toBe('SOC_INVALID_BODY')
    expect(response.body.error.fieldErrors.sessionId).toBeTruthy()
    expect(response.body.requestId).toBeTruthy()
    expect(JSON.stringify(response.body)).not.toMatch(/\/src\/|node_modules/)
  })

  it('rejects a completion with an unknown decision', async () => {
    const response = await request(makeApp(stubService()))
      .post(`${base}/complete`)
      .send({ sessionId: SESSION, decision: 'ignore' })
      .expect(400)
    expect(response.body.error.code).toBe('SOC_INVALID_BODY')
  })

  it('passes a typed llm error through with its status and code', async () => {
    const service = stubService({
      sendMessage: async () => {
        throw new LlmError('LLM_SESSION_NOT_FOUND', 'gone', 404)
      },
    })
    const response = await request(makeApp(service))
      .post(`${base}/message`)
      .send({ sessionId: SESSION, content: 'hi' })
      .expect(404)
    expect(response.body.error.code).toBe('LLM_SESSION_NOT_FOUND')
  })

  it('hides an unexpected failure behind SOC_UNAVAILABLE', async () => {
    const service = stubService({
      startSession: () => {
        throw new Error('boom with /src/ detail')
      },
    })
    const response = await request(makeApp(service)).post(`${base}/session`).send(START).expect(503)
    expect(response.body.error.code).toBe('SOC_UNAVAILABLE')
    expect(JSON.stringify(response.body)).not.toContain('/src/')
  })

  it('paces repeated requests from one caller', async () => {
    const app = makeApp(stubService(), () => 1000)
    let limited = null
    for (let attempt = 0; attempt < 40 && !limited; attempt += 1) {
      const response = await request(app).post(`${base}/session`).send(START)
      if (response.status === 429) limited = response
    }
    expect(limited).not.toBeNull()
    expect(limited.body.error.code).toBe('SOC_RATE_LIMITED')
  })

  it('relays a verifier message with no-store caching', async () => {
    const response = await request(makeApp(stubService()))
      .post(`${base}/verifier-message`)
      .send({ sessionId: SESSION, content: 'did you message me?' })
      .expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.reply).toBe('Yes, that was me.')
    expect(response.body.verifierTurnBudget).toBe(5)
  })

  it('rejects empty and oversized verifier messages', async () => {
    const app = makeApp(stubService())
    for (const content of ['', 'x'.repeat(1001)]) {
      const response = await request(app)
        .post(`${base}/verifier-message`)
        .send({ sessionId: SESSION, content })
        .expect(400)
      expect(response.body.error.code).toBe('SOC_INVALID_BODY')
    }
  })

  it.each([
    ['SOC_VERIFIER_BUSY', 429],
    ['SOC_VERIFIER_LIMIT', 409],
    ['LLM_SESSION_BUSY', 409],
    ['LLM_UPSTREAM_UNAVAILABLE', 503],
    ['LLM_NOT_CONFIGURED', 503],
    ['LLM_SESSION_NOT_FOUND', 404],
  ])('maps verifier error %s to %i', async (code, status) => {
    const service = stubService({
      sendVerifierMessage: async () => {
        throw new LlmError(code, 'nope', status)
      },
    })
    const response = await request(makeApp(service))
      .post(`${base}/verifier-message`)
      .send({ sessionId: SESSION, content: 'hi' })
      .expect(status)
    expect(response.body.error.code).toBe(code)
    expect(response.body.requestId).toBeTruthy()
  })

  it('serves a nudge with no-store caching', async () => {
    const response = await request(makeApp(stubService()))
      .post(`${base}/nudge`)
      .send({ sessionId: SESSION })
      .expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toEqual({ message: 'Hurry up please.', nudgesLeft: 2 })
  })

  it('rejects an invalid nudge body and maps nudge errors', async () => {
    const bad = await request(makeApp(stubService()))
      .post(`${base}/nudge`)
      .send({ sessionId: SESSION, extra: 1 })
      .expect(400)
    expect(bad.body.error.code).toBe('SOC_INVALID_BODY')
    const service = stubService({
      nudge: () => {
        throw new LlmError('LLM_SESSION_NOT_FOUND', 'gone', 404)
      },
    })
    await request(makeApp(service)).post(`${base}/nudge`).send({ sessionId: SESSION }).expect(404)
  })

  it('counts the verifier and nudge routes in the shared pacing window', async () => {
    const app = makeApp(stubService(), () => 1000)
    for (let n = 0; n < 10; n += 1) {
      await request(app).post(`${base}/session`).send(START).expect(200)
      await request(app)
        .post(`${base}/verifier-message`)
        .send({ sessionId: SESSION, content: 'hi' })
        .expect(200)
      await request(app).post(`${base}/nudge`).send({ sessionId: SESSION }).expect(200)
    }
    const limited = await request(app).post(`${base}/nudge`).send({ sessionId: SESSION })
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('SOC_RATE_LIMITED')
  })

  it('rejects every route without a session', async () => {
    const app = makeApp(stubService())
    for (const path of ['session', 'message', 'verifier-message', 'nudge', 'complete']) {
      const response = await supertest(app).post(`${base}/${path}`).send({}).expect(401)
      expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
    }
  })

  it('requires a context object to start and resolves it before the session', async () => {
    const attempts = fakeAttempts()
    const startSession = vi.fn(() => ({ sessionId: SESSION }))
    const app = makeApp(stubService({ startSession }), Date.now, attempts)
    const missing = await request(app).post(`${base}/session`).send({}).expect(400)
    expect(missing.body.error.fieldErrors.context).toBeTruthy()
    await request(app).post(`${base}/session`).send(START).expect(200)
    expect(attempts.resolveRunContext).toHaveBeenCalledWith({ id: 'player-1' }, START.context)
    expect(startSession).toHaveBeenCalledWith({
      playerId: 'player-1',
      context: { kind: 'personal' },
    })
  })

  it('stops a start the attempts service rejects', async () => {
    const attempts = fakeAttempts({
      resolveRunContext: vi.fn(async () => {
        throw new AttemptError('ATTEMPT_NOT_FOUND', 'That attempt was not found.', 404)
      }),
    })
    const startSession = vi.fn()
    const app = makeApp(stubService({ startSession }), Date.now, attempts)
    const response = await request(app).post(`${base}/session`).send(START).expect(404)
    expect(response.body.error.code).toBe('ATTEMPT_NOT_FOUND')
    expect(startSession).not.toHaveBeenCalled()
  })

  it("answers another player's session like an unknown one", async () => {
    const adapter = { configured: true, mode: 'local', chat: vi.fn() }
    const app = makeApp(createSocialEngineeringService({ adapter }))
    const { body: start } = await request(app).post(`${base}/session`).send(START).expect(200)
    const payload = { sessionId: start.sessionId, content: 'hello' }
    for (const [path, body] of [
      ['message', payload],
      ['verifier-message', payload],
      ['nudge', { sessionId: start.sessionId }],
      ['complete', { sessionId: start.sessionId, decision: 'refuse' }],
    ]) {
      const response = await request(app, 'player-2').post(`${base}/${path}`).send(body)
      expect([404, 503]).toContain(response.status)
      expect(response.body.error.code).not.toBe('SOC_INVALID_BODY')
    }
    // the owner can still finish
    await request(app)
      .post(`${base}/complete`)
      .send({ sessionId: start.sessionId, decision: 'refuse' })
      .expect(200)
  })

  it('scores a single call without saving it', async () => {
    const adapter = { configured: true, mode: 'local', chat: vi.fn() }
    const attempts = fakeAttempts()
    const app = makeApp(createSocialEngineeringService({ adapter }), Date.now, attempts)
    const { body: start } = await request(app).post(`${base}/session`).send(START).expect(200)
    const payload = { sessionId: start.sessionId, decision: 'refuse' }
    const done = await request(app).post(`${base}/complete`).send(payload).expect(200)
    expect(done.body).toMatchObject({
      saved: false,
      saveError: { code: 'SOC_SINGLE_CALL_NOT_SAVED' },
    })
    expect(done.body).toHaveProperty('score')
    expect(attempts.recordCompletedAttempt).not.toHaveBeenCalled()
  })
})
