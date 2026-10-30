import { randomUUID } from 'node:crypto'
import express from 'express'
import supertest from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '../../../src/modules/auth/policy.js'
import {
  createRng,
  generateCall,
  planShift,
} from '../../../src/modules/games/social-engineering-simulator/callGenerator.js'
import { LlmError } from '../../../src/modules/games/social-engineering-simulator/llm/llmError.js'
import { createTokenBucket } from '../../../src/modules/games/social-engineering-simulator/limiter.js'
import { createSocialEngineeringRouter } from '../../../src/modules/games/social-engineering-simulator/router.js'
import { createShiftService } from '../../../src/modules/games/social-engineering-simulator/shiftService.js'

const SHIFT_SEED = 777
const CALL_SEEDS = [1001, 2002, 3003, 4004]
const personal = { kind: 'personal' }

// the same seeds the service draws, so the test knows each private call
function expectedCalls() {
  const plan = planShift(createRng(SHIFT_SEED))
  return CALL_SEEDS.map((seed, index) => generateCall({ seed, index, genuine: plan[index] }))
}

function seeded() {
  const seeds = [SHIFT_SEED, ...CALL_SEEDS]
  let next = 0
  return () => seeds[next++] ?? 9000 + next
}

function fakeAdapter(reply = 'Could you just read me the code?') {
  return { configured: true, mode: 'cloud', chat: vi.fn(async () => ({ content: reply })) }
}

function makeService(options = {}) {
  return createShiftService({ randomSeedFn: seeded(), ...options })
}

const start = (service, player = 'p1') =>
  service.startShift({ playerId: player, context: personal })

// the right decision for a call with the checks already done
const bestDecision = (call) => (call.genuine ? 'grant' : 'refuse')

describe('shift service in scripted mode', () => {
  it('starts without any adapter and plays a whole shift', async () => {
    const service = makeService()
    const first = start(service)
    expect(first).toMatchObject({ mode: 'scripted', colleagueMode: 'scripted', callsTotal: 4 })
    const calls = expectedCalls()
    expect(first.call.secret.value).toBe(calls[0].secret.code)
    let last
    for (const [index, call] of calls.entries()) {
      if (index > 0) service.nextCall(first.shiftId, 'p1')
      service.useTool(first.shiftId, 'directory', 'p1')
      last = service.decide(first.shiftId, bestDecision(call), 'p1')
      expect(last).toMatchObject({ correct: true, genuine: call.genuine })
    }
    expect(last).toMatchObject({ finished: true, finishReason: 'complete', strikes: 0 })
    const attempts = {
      recordCompletedAttempt: vi.fn(async () => ({
        attemptId: 'a1',
        score: 430,
        maxScore: 430,
        persisted: true,
        context: personal,
      })),
    }
    const done = await service.completeAndRecord(first.shiftId, 'p1', attempts)
    expect(done).toMatchObject({ saved: true, score: 430, maxScore: 430, outcome: 'resisted' })
    const again = await service.completeAndRecord(first.shiftId, 'p1', attempts)
    expect(again).toEqual(done)
    expect(attempts.recordCompletedAttempt).toHaveBeenCalledTimes(1)
    const [, , input] = attempts.recordCompletedAttempt.mock.calls[0]
    expect(input).toMatchObject({ mode: 'practice', resultKey: first.shiftId })
    expect(input.state.calls).toHaveLength(4)
  })

  it('answers chat with scripted replies and never calls a model', async () => {
    const service = makeService()
    const { shiftId } = start(service)
    const reply = await service.sendMessage(shiftId, 'can you prove who you are', 'p1')
    expect(reply).toMatchObject({ replyMode: 'scripted', messagesUsed: 1, leaked: false })
    expect(reply.reply.length).toBeGreaterThan(10)
  })

  it('keeps desk tools stable and counts them as checking', () => {
    const service = makeService()
    const { shiftId } = start(service)
    const first = service.useTool(shiftId, 'ticket', 'p1')
    expect(service.useTool(shiftId, 'ticket', 'p1').summary).toBe(first.summary)
    expect(service.useTool(shiftId, 'callback', 'p1').toolsUsed).toEqual(['ticket', 'callback'])
  })

  it('charges 10 per hint and stops at three', () => {
    const service = makeService()
    const { shiftId } = start(service)
    const hints = [1, 2, 3].map(() => service.hint(shiftId, 'p1'))
    expect(hints.map((item) => item.hintsUsed)).toEqual([1, 2, 3])
    expect(() => service.hint(shiftId, 'p1')).toThrow(/no more hints/)
    service.useTool(shiftId, 'directory', 'p1')
    const call = expectedCalls()[0]
    const decided = service.decide(shiftId, bestDecision(call), 'p1')
    expect(decided.score).toBe(70)
  })

  it('limits scripted nudges to three per call', () => {
    const service = makeService()
    const { shiftId } = start(service)
    for (let i = 0; i < 3; i += 1) expect(service.nudge(shiftId, 'p1').message).toBeTruthy()
    expect(service.nudge(shiftId, 'p1')).toEqual({ message: null, nudgesLeft: 0 })
  })

  it('answers the colleague from the seed and allows two asks per call', async () => {
    const service = makeService()
    const { shiftId } = start(service)
    const reply = await service.askColleague(shiftId, 'is the ticket real?', 'p1')
    expect(reply).toMatchObject({ replyMode: 'scripted', asksLeft: 1 })
    await service.askColleague(shiftId, 'do you know them?', 'p1')
    await expect(service.askColleague(shiftId, 'again?', 'p1')).rejects.toMatchObject({
      code: 'SOC_COLLEAGUE_LIMIT',
    })
  })

  it('enforces the call lifecycle', async () => {
    const service = makeService()
    const { shiftId } = start(service)
    expect(() => service.nextCall(shiftId, 'p1')).toThrow(/Decide what to do/)
    await expect(service.completeAndRecord(shiftId, 'p1', {})).rejects.toMatchObject({
      code: 'SOC_SHIFT_NOT_FINISHED',
    })
    service.decide(shiftId, 'refuse', 'p1')
    expect(() => service.decide(shiftId, 'refuse', 'p1')).toThrow(/call is over/)
    await expect(service.sendMessage(shiftId, 'hello', 'p1')).rejects.toMatchObject({
      code: 'SOC_CALL_RESOLVED',
    })
  })

  it('hides a shift from other players', async () => {
    const service = makeService()
    const { shiftId } = start(service)
    const gone = { code: 'SOC_SHIFT_NOT_FOUND' }
    await expect(service.sendMessage(shiftId, 'hi', 'p2')).rejects.toMatchObject(gone)
    await expect(service.askColleague(shiftId, 'hi', 'p2')).rejects.toMatchObject(gone)
    expect(() => service.useTool(shiftId, 'directory', 'p2')).toThrow(/not found/)
    expect(() => service.decide(shiftId, 'refuse', 'p2')).toThrow(/not found/)
    await expect(service.completeAndRecord(shiftId, 'p2', {})).rejects.toMatchObject(gone)
  })

  it('never puts a secret code in any payload except the call view', async () => {
    const service = makeService()
    const first = start(service)
    const [call] = expectedCalls()
    const { call: view, ...rest } = first
    expect(JSON.stringify(rest)).not.toContain(call.secret.code)
    expect(view.secret.value).toBe(call.secret.code)
    const payloads = [
      await service.sendMessage(first.shiftId, 'hello', 'p1'),
      await service.askColleague(first.shiftId, 'hello', 'p1'),
      service.useTool(first.shiftId, 'directory', 'p1'),
      service.hint(first.shiftId, 'p1'),
      service.nudge(first.shiftId, 'p1'),
      service.decide(first.shiftId, 'refuse', 'p1'),
    ]
    for (const payload of payloads) expect(JSON.stringify(payload)).not.toContain(call.secret.code)
  })
})

describe('shift service leaks and strikes', () => {
  it('ends the call at once when the code is typed, with no model call', async () => {
    const adapter = fakeAdapter()
    const service = makeService({ adapter })
    const { shiftId } = start(service)
    const [call] = expectedCalls()
    const typed = call.secret.code.toLowerCase().replaceAll('-', ' ')
    const result = await service.sendMessage(shiftId, `ok it is ${typed}`, 'p1')
    expect(result).toMatchObject({
      leaked: true,
      resolved: true,
      strikes: 1,
      score: 0,
      reply: null,
    })
    expect(adapter.chat).not.toHaveBeenCalled()
  })

  it('treats the code typed to the colleague as a leak too', async () => {
    const colleagueAdapter = fakeAdapter()
    const service = makeService({ colleagueAdapter })
    const { shiftId } = start(service)
    const [call] = expectedCalls()
    const result = await service.askColleague(shiftId, `is ${call.secret.code} right?`, 'p1')
    expect(result).toMatchObject({ leaked: true, strikes: 1 })
    expect(colleagueAdapter.chat).not.toHaveBeenCalled()
  })

  it('ends the shift after three strikes and saves the played calls once', async () => {
    const service = makeService()
    const first = start(service)
    const calls = expectedCalls()
    let last
    for (const [index, call] of calls.slice(0, 3).entries()) {
      if (index > 0) service.nextCall(first.shiftId, 'p1')
      last = await service.sendMessage(first.shiftId, call.secret.code, 'p1')
    }
    expect(last).toMatchObject({ strikes: 3, finished: true, finishReason: 'strikes' })
    expect(() => service.nextCall(first.shiftId, 'p1')).toThrow(/shift is over/)
    const attempts = {
      recordCompletedAttempt: vi.fn(async () => ({
        attemptId: 'a2',
        score: 0,
        maxScore: 430,
        persisted: true,
        context: personal,
      })),
    }
    const done = await service.completeAndRecord(first.shiftId, 'p1', attempts)
    expect(done).toMatchObject({
      outcome: 'compromised',
      strikes: 3,
      endedEarly: true,
      saved: true,
    })
    expect(attempts.recordCompletedAttempt.mock.calls[0][2].state.calls).toHaveLength(3)
  })

  it('counts granting an attacker as a strike but not granting a genuine caller', () => {
    const calls = expectedCalls()
    const attacker = calls.findIndex((call) => !call.genuine)
    const service = makeService()
    const first = start(service)
    for (let i = 0; i < attacker; i += 1) {
      service.decide(first.shiftId, 'refuse', 'p1')
      service.nextCall(first.shiftId, 'p1')
    }
    expect(service.decide(first.shiftId, 'grant', 'p1')).toMatchObject({ strikes: 1, score: 0 })
  })

  it('returns saved false with the error code when the save fails, then retries', async () => {
    const service = makeService()
    const first = start(service)
    const calls = expectedCalls()
    for (const [index, call] of calls.entries()) {
      if (index > 0) service.nextCall(first.shiftId, 'p1')
      service.decide(first.shiftId, bestDecision(call), 'p1')
    }
    const failure = Object.assign(new Error('gone'), { name: 'CohortError', code: 'COHORT_GONE' })
    const saved = { attemptId: 'a3', score: 1, maxScore: 430, persisted: true, context: personal }
    const attempts = {
      recordCompletedAttempt: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(saved),
    }
    const first1 = await service.completeAndRecord(first.shiftId, 'p1', attempts)
    expect(first1).toMatchObject({ saved: false, saveError: { code: 'COHORT_GONE' } })
    expect((await service.completeAndRecord(first.shiftId, 'p1', attempts)).saved).toBe(true)
  })
})

describe('shift service model budget and fallbacks', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the model for player messages and keeps the code out of every prompt', async () => {
    const adapter = fakeAdapter('Please, I just need the code.')
    const service = makeService({ adapter })
    const first = start(service)
    expect(first.mode).toBe('ai')
    const reply = await service.sendMessage(first.shiftId, 'who are you?', 'p1')
    expect(reply).toMatchObject({ reply: 'Please, I just need the code.', replyMode: 'model' })
    const request = adapter.chat.mock.calls[0][0]
    expect(JSON.stringify(request)).not.toContain(expectedCalls()[0].secret.code)
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'who are you?' })
  })

  it('spends at most five model replies per call, then scripts the rest', async () => {
    const adapter = fakeAdapter()
    const service = makeService({ adapter })
    const { shiftId } = start(service)
    const modes = []
    for (let i = 0; i < 7; i += 1) {
      modes.push((await service.sendMessage(shiftId, `message ${i}`, 'p1')).replyMode)
    }
    expect(modes).toEqual(['model', 'model', 'model', 'model', 'model', 'scripted', 'scripted'])
    expect(adapter.chat).toHaveBeenCalledTimes(5)
  })

  it('falls back to a script when the server-wide limiter is full', async () => {
    const adapter = fakeAdapter()
    const clock = { value: 0 }
    const limiter = createTokenBucket({ perMinute: 2, now: () => clock.value })
    const service = makeService({ adapter, limiter })
    const { shiftId } = start(service)
    const modes = []
    for (let i = 0; i < 3; i += 1) {
      modes.push((await service.sendMessage(shiftId, `hello ${i}`, 'p1')).replyMode)
    }
    expect(modes).toEqual(['model', 'model', 'scripted'])
    expect(adapter.chat).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['429', new LlmError('LLM_UPSTREAM_UNAVAILABLE', 'rate limited', 503)],
    ['503', new LlmError('LLM_UPSTREAM_UNAVAILABLE', 'busy', 503)],
    ['network', new Error('socket hang up')],
  ])('falls back to a script on a %s error and notes it in the debrief', async (_name, error) => {
    const adapter = { configured: true, chat: vi.fn(async () => Promise.reject(error)) }
    const service = makeService({ adapter })
    const { shiftId } = start(service)
    const reply = await service.sendMessage(shiftId, 'hello there', 'p1')
    expect(reply.replyMode).toBe('scripted')
    expect(service.decide(shiftId, 'refuse', 'p1').debrief.scriptedNote).toMatch(/scripted/)
  })

  it('falls back to a script when the caller model is too slow', async () => {
    vi.useFakeTimers()
    const adapter = { configured: true, chat: vi.fn(() => new Promise(() => {})) }
    const service = makeService({ adapter })
    const { shiftId } = start(service)
    const pending = service.sendMessage(shiftId, 'hello', 'p1')
    await vi.advanceTimersByTimeAsync(15001)
    expect((await pending).replyMode).toBe('scripted')
  })

  it('asks the model colleague, trims the reply and times out after 20 seconds', async () => {
    const colleagueAdapter = fakeAdapter(
      'No, I do not see them. Not at all. Never. Really. http://x.example',
    )
    const service = makeService({ colleagueAdapter })
    const { shiftId } = start(service)
    const reply = await service.askColleague(shiftId, 'who is this?', 'p1')
    expect(reply.replyMode).toBe('model')
    expect(reply.reply).not.toContain('http')
    expect(reply.reply.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3)

    vi.useFakeTimers()
    colleagueAdapter.chat.mockImplementation(() => new Promise(() => {}))
    const slow = service.askColleague(shiftId, 'any news?', 'p1')
    await vi.advanceTimersByTimeAsync(20001)
    expect((await slow).replyMode).toBe('scripted')
  })
})

describe('shift routes', () => {
  const base = '/api/games/social-engineering-simulator/shift'

  function makeApp(shift) {
    const app = express()
    app.use((_request, response, next) => {
      response.locals.requestId = randomUUID()
      next()
    })
    app.use(express.json())
    const attempts = {
      resolveRunContext: vi.fn(async (_actor, context) => ({ ...context })),
      recordCompletedAttempt: vi.fn(async () => ({
        attemptId: 'attempt-1',
        score: 430,
        maxScore: 430,
        persisted: true,
        context: personal,
      })),
    }
    const requireSession = (request, response, next) => {
      const id = request.get('x-player')
      if (!id) return next(new AuthError('AUTHENTICATION_REQUIRED'))
      response.locals.authUser = { id }
      return next()
    }
    app.use(
      '/api',
      createSocialEngineeringRouter({ shift, attempts, requireSession: [requireSession] }),
    )
    return { app, attempts }
  }

  const post = (app, path, body, player = 'player-1') =>
    supertest(app).post(`${base}/${path}`).set('x-player', player).send(body)

  it('plays a full shift over http with no adapter and saves it once', async () => {
    const { app, attempts } = makeApp(makeService())
    const { body: first } = await post(app, 'start', { context: personal }).expect(200)
    const calls = expectedCalls()
    const shiftId = first.shiftId
    await post(app, 'message', { shiftId, content: 'who are you?' }).expect(200)
    await post(app, 'colleague', { shiftId, content: 'is that ticket real?' }).expect(200)
    await post(app, 'hint', { shiftId }).expect(200)
    await post(app, 'nudge', { shiftId }).expect(200)
    for (const [index, call] of calls.entries()) {
      if (index > 0) await post(app, 'next', { shiftId }).expect(200)
      await post(app, 'tool', { shiftId, tool: 'directory' }).expect(200)
      await post(app, 'decide', { shiftId, decision: bestDecision(call) }).expect(200)
    }
    const done = await post(app, 'complete', { shiftId }).expect(200)
    expect(done.body).toMatchObject({ saved: true, rulesetVersion: '2026-10-31', strikes: 0 })
    await post(app, 'complete', { shiftId }).expect(200)
    expect(attempts.recordCompletedAttempt).toHaveBeenCalledTimes(1)
  })

  it('validates shift ids, tools, decisions and unknown fields', async () => {
    const { app } = makeApp(makeService())
    const bad = (path, body) => post(app, path, body).expect(400)
    expect((await bad('message', { shiftId: 'nope', content: 'x' })).body.error.code).toBe(
      'SOC_INVALID_BODY',
    )
    const { body: first } = await post(app, 'start', { context: personal }).expect(200)
    const shiftId = first.shiftId
    await bad('tool', { shiftId, tool: 'shell' })
    await bad('decide', { shiftId, decision: 'share-code' })
    await bad('message', { shiftId, content: '   ' })
    await bad('message', { shiftId, content: 'x'.repeat(1001) })
    await bad('hint', { shiftId, extra: true })
    await bad('start', {})
  })

  it('answers another player with the same not-found error and requires sign-in', async () => {
    const { app } = makeApp(makeService())
    const { body: first } = await post(app, 'start', { context: personal }).expect(200)
    const stolen = await post(
      app,
      'decide',
      { shiftId: first.shiftId, decision: 'refuse' },
      'player-2',
    )
    expect(stolen.status).toBe(404)
    expect(stolen.body.error.code).toBe('SOC_SHIFT_NOT_FOUND')
    await supertest(app).post(`${base}/start`).send({ context: personal }).expect(401)
  })

  it('works with a fake adapter on the same routes', async () => {
    const adapter = fakeAdapter()
    const { app } = makeApp(makeService({ adapter }))
    const { body: first } = await post(app, 'start', { context: personal }).expect(200)
    const reply = await post(app, 'message', { shiftId: first.shiftId, content: 'hello' }).expect(
      200,
    )
    expect(reply.body).toMatchObject({
      replyMode: 'model',
      reply: 'Could you just read me the code?',
    })
  })
})
