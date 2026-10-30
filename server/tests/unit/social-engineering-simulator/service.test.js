import { describe, expect, it, vi } from 'vitest'
import {
  createSocialEngineeringService,
  tidyColleagueReply,
} from '../../../src/modules/games/social-engineering-simulator/service.js'
import {
  SCENARIOS,
  promptForTurn,
} from '../../../src/modules/games/social-engineering-simulator/scenarios.js'
import { LlmError } from '../../../src/modules/games/social-engineering-simulator/llm/llmError.js'
import { createChatSessionStore } from '../../../src/modules/games/social-engineering-simulator/llm/chatSessionStore.js'
import {
  COMPLETED_TTL_MS,
  MAX_COMPLETED,
} from '../../../src/modules/games/social-engineering-simulator/policy.js'

// a stubbed adapter so the suite never makes a live llm call
function fakeAdapter(reply = 'Thanks, but could you just read me that code?') {
  return {
    configured: true,
    mode: 'local',
    chat: vi.fn(async () => ({ content: reply })),
  }
}

// first draw above the legitimate share, so a colleague run gets an attack
const attackRandom = () => 0.9

function makeService(adapter = fakeAdapter()) {
  return { service: createSocialEngineeringService({ adapter }), adapter }
}

function codeFor(start) {
  return SCENARIOS.find((scenario) => scenario.id === start.persona.id).code
}

describe('social-engineering service', () => {
  it("starts a run with a persona, brief, opening and the player's reset code", async () => {
    const { service, adapter } = makeService()
    const start = service.startSession()
    expect(start.sessionId).toMatch(/[0-9a-f-]{36}/)
    expect(start.persona.id).toBeTruthy()
    expect(start.brief.title).toBeTruthy()
    expect(start.openingMessage).toBeTruthy()
    expect(start.resetCode).toBe(codeFor(start))
    // checks the field, not the word: the lobby-visitor opening says "visitor system"
    expect(JSON.stringify(start)).not.toContain('systemPrompt')

    const turn = await service.sendMessage(start.sessionId, 'Who is this exactly?')
    const { systemPrompt } = adapter.chat.mock.calls[0][0]
    expect(systemPrompt).not.toContain(start.resetCode)
    expect(JSON.stringify(turn)).not.toContain(start.resetCode)
    expect(JSON.stringify(service.complete(start.sessionId, 'refuse'))).not.toContain(
      start.resetCode,
    )
  })

  it('refuses to start when the adapter is not configured', () => {
    const { service } = makeService({ configured: false, chat: vi.fn() })
    expect(() => service.startSession()).toThrow(/configured/i)
  })

  it('relays the colleague reply and counts turns while the budget holds', async () => {
    const { service, adapter } = makeService()
    const start = service.startSession()
    const result = await service.sendMessage(start.sessionId, 'Who is this exactly?')
    expect(adapter.chat).toHaveBeenCalledTimes(1)
    expect(result.reply).toBeTruthy()
    expect(result.turnsUsed).toBe(1)
    expect(result.leaked).toBe(false)
    expect(result.ended).toBe(false)
  })

  it('does not spend a turn or keep the message when the model call fails', async () => {
    const adapter = fakeAdapter()
    adapter.chat
      .mockResolvedValueOnce({ content: 'first' })
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValueOnce({ content: 'third' })
    const { service } = makeService(adapter)
    const start = service.startSession()

    expect((await service.sendMessage(start.sessionId, 'one')).turnsUsed).toBe(1)
    await expect(service.sendMessage(start.sessionId, 'two')).rejects.toThrow('upstream down')
    const retry = await service.sendMessage(start.sessionId, 'two')

    expect(retry.turnsUsed).toBe(2)
    const sent = adapter.chat.mock.calls.at(-1)[0].messages
    expect(sent.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant', 'user'])
  })

  it('rejects an overlapping message while a reply is in flight', async () => {
    let release
    const adapter = {
      configured: true,
      mode: 'local',
      chat: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ content: 'later' })
          }),
      ),
    }
    const { service } = makeService(adapter)
    const start = service.startSession()

    const first = service.sendMessage(start.sessionId, 'one')
    await expect(service.sendMessage(start.sessionId, codeFor(start))).rejects.toMatchObject({
      code: 'LLM_SESSION_BUSY',
      status: 409,
    })
    release()
    expect(await first).toMatchObject({ turnsUsed: 1, leaked: false })
    expect(adapter.chat).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['spaces', (code) => code.toLowerCase().replaceAll('-', ' ')],
    ['underscores', (code) => code.replaceAll('-', '_')],
    ['dots', (code) => code.toLowerCase().replaceAll('-', '.')],
    ['en dashes', (code) => code.replaceAll('-', '–')],
  ])('flags the code typed with %s and never forwards it', async (_label, reformat) => {
    const { service, adapter } = makeService()
    const start = service.startSession()
    const result = await service.sendMessage(
      start.sessionId,
      `fine, it is ${reformat(codeFor(start))}!`,
    )
    expect(result.leaked).toBe(true)
    expect(adapter.chat).not.toHaveBeenCalled()
  })

  it.each([
    ['a different last digit', (code) => code.slice(0, -1) + (code.endsWith('1') ? '2' : '1')],
    ['only the number', () => 'reset 4821 times'],
    ['an unrelated refusal', () => 'I will not share it'],
  ])('does not flag %s', async (_label, buildText) => {
    const { service } = makeService()
    const start = service.startSession()
    const result = await service.sendMessage(start.sessionId, buildText(codeFor(start)))
    expect(result.leaked).toBe(false)
  })

  it('returns the first result when completion is repeated', () => {
    const { service } = makeService()
    const start = service.startSession()
    const first = service.complete(start.sessionId, 'verify-independently')
    const second = service.complete(start.sessionId, 'share-code')
    expect(second).toEqual(first)
    expect(second.outcome).toBe('resisted')
  })

  it('forgets a completed result after the replay window', () => {
    let clock = 0
    const service = createSocialEngineeringService({ adapter: fakeAdapter(), now: () => clock })
    const start = service.startSession()
    service.complete(start.sessionId, 'refuse')
    clock = COMPLETED_TTL_MS + 1
    expect(() => service.complete(start.sessionId, 'refuse')).toThrow(/not found/i)
  })

  it('keeps the completed-results map bounded', () => {
    const service = createSocialEngineeringService({ adapter: fakeAdapter() })
    const first = service.startSession()
    service.complete(first.sessionId, 'refuse')
    for (let index = 0; index < MAX_COMPLETED; index += 1) {
      service.complete(service.startSession().sessionId, 'refuse')
    }
    expect(() => service.complete(first.sessionId, 'refuse')).toThrow(/not found/i)
  })

  it('still scores a run that ended on a leak after another run starts', async () => {
    const { service } = makeService()
    const start = service.startSession()
    await service.sendMessage(start.sessionId, codeFor(start))

    service.startSession()

    expect(service.complete(start.sessionId, 'refuse').outcome).toBe('compromised')
  })

  it('drops metadata for sessions the transcript store has already expired', async () => {
    let clock = 0
    const store = createChatSessionStore({ idleTtlMs: 1000, now: () => clock })
    const service = createSocialEngineeringService({ adapter: fakeAdapter(), store })
    const stale = service.startSession()
    service.startSession()
    expect(service.sessionCount()).toBe(2)

    clock = 5000
    service.startSession()

    expect(service.sessionCount()).toBe(1)
    await expect(service.sendMessage(stale.sessionId, 'hello')).rejects.toMatchObject({
      code: 'LLM_SESSION_NOT_FOUND',
    })
  })

  it('detects a leaked code, ends the run, and never forwards it to the model', async () => {
    const { service, adapter } = makeService()
    const start = service.startSession()
    const code = codeFor(start)
    // vary spacing to prove normalisation
    const result = await service.sendMessage(
      start.sessionId,
      `ok the code is ${code.toLowerCase()}`,
    )
    expect(result.leaked).toBe(true)
    expect(result.ended).toBe(true)
    expect(result.reply).toBeNull()
    expect(adapter.chat).not.toHaveBeenCalled()
    const scored = service.complete(start.sessionId, 'refuse')
    expect(scored.outcome).toBe('compromised')
    expect(scored.breakdown.find((item) => item.key === 'noLeak').points).toBe(0)
  })

  it('ends the run once the turn budget is reached', async () => {
    const { service } = makeService()
    const start = service.startSession()
    let last
    for (let turn = 0; turn < start.brief.turnBudget; turn += 1) {
      last = await service.sendMessage(start.sessionId, `message ${turn}`)
    }
    expect(last.turnsUsed).toBe(start.brief.turnBudget)
    expect(last.ended).toBe(true)
    await expect(service.sendMessage(start.sessionId, 'one more')).rejects.toThrow(
      /not found|ended/i,
    )
  })

  it('awards full marks for protecting the code and verifying independently', async () => {
    const { service } = makeService()
    const start = service.startSession()
    await service.sendMessage(start.sessionId, 'I will not share that.')
    const scored = service.complete(start.sessionId, 'verify-independently')
    expect(scored.score).toBe(100)
    expect(scored.outcome).toBe('resisted')
    expect(scored.maxScore).toBe(100)
    expect(scored.saved).toBe(false)
  })

  it('scores a refuse-only run as partial', async () => {
    const { service } = makeService()
    const start = service.startSession()
    await service.sendMessage(start.sessionId, 'No.')
    const scored = service.complete(start.sessionId, 'refuse')
    expect(scored.outcome).toBe('partial')
    expect(scored.score).toBe(75)
  })

  it('treats choosing share-code as a compromise even without typing it', () => {
    const { service } = makeService()
    const start = service.startSession()
    const scored = service.complete(start.sessionId, 'share-code')
    expect(scored.outcome).toBe('compromised')
    expect(scored.breakdown.find((item) => item.key === 'noLeak').points).toBe(0)
  })

  it('scales efficiency to a floor of zero beyond the budget', () => {
    const { service } = makeService()
    expect(
      service
        .scoreOutcome({ leaked: false, decision: 'refuse', turnsUsed: 8, turnBudget: 8 })
        .breakdown.find((item) => item.key === 'efficiency').points,
    ).toBe(15)
    expect(
      service
        .scoreOutcome({ leaked: false, decision: 'refuse', turnsUsed: 12, turnBudget: 8 })
        .breakdown.find((item) => item.key === 'efficiency').points,
    ).toBeLessThan(15)
    expect(
      service
        .scoreOutcome({ leaked: false, decision: 'refuse', turnsUsed: 100, turnBudget: 8 })
        .breakdown.find((item) => item.key === 'efficiency').points,
    ).toBe(0)
  })

  describe('legitimate-request scoring', () => {
    const { service } = makeService()
    const base = {
      turnsUsed: 4,
      turnBudget: 8,
      verifierRequired: true,
      verifierName: 'Marcus Tan',
      legitimate: true,
    }
    const score = (over) => service.scoreOutcome({ ...base, ...over })

    it('gives full marks for contacting the colleague and then sharing', () => {
      const result = score({ leaked: false, decision: 'share-code', verifierContacted: true })
      expect(result.score).toBe(100)
      expect(result.outcome).toBe('resisted')
      expect(result.breakdown.map((item) => item.label)).toEqual([
        'Shared the code after checking',
        'Checked with Marcus Tan',
        'Stayed within the turn budget',
      ])
    })

    it('gives only efficiency for contacting and then refusing a genuine request', () => {
      const result = score({ leaked: false, decision: 'refuse', verifierContacted: true })
      expect(result.score).toBe(15)
      expect(result.outcome).toBe('partial')
      // contact alone earns nothing: the verify points need the right decision after it
      expect(result.breakdown.find((item) => item.key === 'verify').points).toBe(0)
    })

    it('gives only efficiency for refusing without contact', () => {
      const result = score({ leaked: false, decision: 'refuse', verifierContacted: false })
      expect(result.score).toBe(15)
      expect(result.outcome).toBe('partial')
    })

    it('marks sharing without contact as compromised', () => {
      const result = score({ leaked: false, decision: 'share-code', verifierContacted: false })
      expect(result.score).toBe(15)
      expect(result.outcome).toBe('compromised')
    })

    it('treats a leak to the colleague as compromised even after contact', () => {
      const result = score({ leaked: true, decision: 'share-code', verifierContacted: true })
      expect(result.outcome).toBe('compromised')
      expect(result.breakdown[0].points).toBe(0)
      expect(result.breakdown[1].points).toBe(0)
    })

    it('scores the legacy verify-independently decision as a refusal', () => {
      const result = score({
        leaked: false,
        decision: 'verify-independently',
        verifierContacted: true,
      })
      expect(result.score).toBe(15)
      expect(result.outcome).toBe('partial')
    })

    it('leaves attack scoring unchanged', () => {
      const attack = { ...base, legitimate: false }
      expect(
        service.scoreOutcome({
          ...attack,
          leaked: false,
          decision: 'refuse',
          verifierContacted: true,
        }).score,
      ).toBe(100)
      expect(
        service.scoreOutcome({
          ...attack,
          leaked: false,
          decision: 'refuse',
          verifierContacted: false,
        }).score,
      ).toBe(75)
      expect(
        service.scoreOutcome({
          ...attack,
          leaked: false,
          decision: 'share-code',
          verifierContacted: true,
        }).score,
      ).toBe(15)
    })

    it('reports legitimate false on attack results', () => {
      const { service: attackService } = makeService()
      const start = attackService.startSession()
      expect(attackService.complete(start.sessionId, 'refuse')).toHaveProperty('legitimate', false)
    })
  })

  describe('legitimate runs through the service', () => {
    function makeLegit(verifierAdapter = fakeAdapter('Yes, that is on record.')) {
      const draws = [0.1, 0]
      return createSocialEngineeringService({
        adapter: fakeAdapter(),
        verifierAdapter,
        random: () => draws.shift() ?? 0,
      })
    }

    it('serves a legitimate scenario with no hint in the start response', () => {
      const start = makeLegit().startSession()
      expect(start.persona.id).toBe('own-ticket')
      expect(JSON.stringify(start)).not.toMatch(/legitimate|tactic/i)
    })

    it('never serves a legitimate scenario without a colleague', () => {
      const service = createSocialEngineeringService({ adapter: fakeAdapter(), random: () => 0 })
      const start = service.startSession()
      expect(SCENARIOS.find((s) => s.id === start.persona.id).legitimate).toBe(false)
    })

    it('scores 100 for checking and then sharing, and replays the same result', async () => {
      const service = makeLegit()
      const start = service.startSession()
      await service.sendVerifierMessage(start.sessionId, 'Is the ticket real?')
      const result = service.complete(start.sessionId, 'share-code')
      expect(result).toMatchObject({ score: 100, outcome: 'resisted', legitimate: true })
      expect(service.complete(start.sessionId, 'refuse')).toBe(result)
    })

    it('scores sharing without checking as compromised', () => {
      const service = makeLegit()
      const start = service.startSession()
      expect(service.complete(start.sessionId, 'share-code')).toMatchObject({
        score: 15,
        outcome: 'compromised',
      })
    })

    it('treats the code typed to the requester as a share after checking', async () => {
      const service = makeLegit()
      const start = service.startSession()
      await service.sendVerifierMessage(start.sessionId, 'Is the ticket real?')
      const turn = await service.sendMessage(start.sessionId, `here: ${start.resetCode}`)
      expect(turn).toMatchObject({ leaked: true, ended: true })
      expect(service.complete(start.sessionId, 'refuse')).toMatchObject({
        score: 100,
        outcome: 'resisted',
        legitimate: true,
      })
    })

    it('treats the code typed to the requester before checking as compromised', async () => {
      const service = makeLegit()
      const start = service.startSession()
      await service.sendMessage(start.sessionId, start.resetCode)
      expect(service.complete(start.sessionId, 'refuse').outcome).toBe('compromised')
    })

    it('treats the code typed to the colleague as compromised', async () => {
      const service = makeLegit()
      const start = service.startSession()
      await service.sendVerifierMessage(start.sessionId, start.resetCode)
      expect(service.complete(start.sessionId, 'share-code').outcome).toBe('compromised')
    })

    it('does not spend a message when the colleague fails, and allows a retry', async () => {
      const verifierAdapter = fakeAdapter('Yes, that is on record.')
      verifierAdapter.chat.mockRejectedValueOnce(
        new LlmError('LLM_UPSTREAM_UNAVAILABLE', 'down', 503),
      )
      const service = makeLegit(verifierAdapter)
      const start = service.startSession()
      await expect(service.sendVerifierMessage(start.sessionId, 'Is it real?')).rejects.toThrow()
      const retry = await service.sendVerifierMessage(start.sessionId, 'Is it real?')
      expect(retry.verifierTurnsUsed).toBe(1)
      expect(service.complete(start.sessionId, 'share-code').score).toBe(100)
    })

    it('makes blind play lose across the mix', () => {
      const { service } = makeService()
      const attacks = SCENARIOS.filter((s) => !s.legitimate).length
      const legit = SCENARIOS.filter((s) => s.legitimate).length
      expect(legit).toBe(2)
      expect(attacks).toBe(10)
      // weights follow the 35% selection rule, not the scenario counts
      const mean = (pick) => 0.65 * pick(false) + 0.35 * pick(true)
      const run = (legitimate, decision, contacted) =>
        service.scoreOutcome({
          legitimate,
          leaked: false,
          decision,
          turnsUsed: 4,
          turnBudget: 8,
          verifierRequired: true,
          verifierContacted: contacted,
        }).score
      expect(mean((l) => run(l, 'refuse', false))).toBeCloseTo(54, 0)
      expect(mean((l) => run(l, 'share-code', false))).toBeCloseTo(15, 0)
      // contacting the colleague and then always refusing no longer scores near the informed player
      expect(mean((l) => run(l, 'refuse', true))).toBeCloseTo(70, 0)
      expect(mean((l) => run(l, l ? 'share-code' : 'refuse', true))).toBe(100)
    })
  })

  it('rejects messages and completion for an unknown session', async () => {
    const { service } = makeService()
    await expect(service.sendMessage('00000000-0000-0000-0000-000000000000', 'hi')).rejects.toThrow(
      /not found/i,
    )
    expect(() => service.complete('00000000-0000-0000-0000-000000000000', 'refuse')).toThrow(
      /not found/i,
    )
  })

  describe('colleague chat', () => {
    function makeBoth(verifierReply = 'I have no record of that.') {
      const adapter = fakeAdapter()
      const verifierAdapter = fakeAdapter(verifierReply)
      const service = createSocialEngineeringService({
        adapter,
        verifierAdapter,
        random: attackRandom,
      })
      return { service, adapter, verifierAdapter }
    }

    // an adapter whose reply stays pending until release() is called
    function pendingAdapter() {
      const control = {}
      const adapter = {
        configured: true,
        mode: 'local',
        chat: vi.fn(
          () =>
            new Promise((resolve) => {
              control.release = () => resolve({ content: 'later' })
            }),
        ),
      }
      return { adapter, control }
    }

    it('returns the scenario colleague on start, or null without a verifier adapter', () => {
      const { service } = makeBoth()
      const start = service.startSession()
      expect(start.verifier.turnBudget).toBe(5)
      expect(start.verifier.displayName).toBeTruthy()
      expect(start.verifier.role).toBeTruthy()
      expect(JSON.stringify(start.verifier)).not.toContain(codeFor(start))
      expect(makeService().service.startSession().verifier).toBeNull()
    })

    it('calls the colleague adapter only, without the reset code, and counts its own turns', async () => {
      const { service, adapter, verifierAdapter } = makeBoth()
      const start = service.startSession()
      const result = await service.sendVerifierMessage(start.sessionId, 'Do you know Jordan?')
      expect(verifierAdapter.chat).toHaveBeenCalledTimes(1)
      expect(adapter.chat).not.toHaveBeenCalled()
      const { systemPrompt, messages } = verifierAdapter.chat.mock.calls[0][0]
      expect(systemPrompt).not.toContain(start.resetCode)
      expect(JSON.stringify(messages)).not.toContain(start.resetCode)
      expect(result).toEqual({
        reply: 'I have no record of that.',
        verifierTurnsUsed: 1,
        verifierTurnBudget: 5,
        leaked: false,
        ended: false,
      })
      const attacker = await service.sendMessage(start.sessionId, 'Who is this?')
      expect(attacker.turnsUsed).toBe(1)
    })

    it('ends the run on a leak to the colleague without calling the model', async () => {
      const shapes = [
        (code) => code,
        (code) => code.toLowerCase(),
        (code) => code.replace(/-/g, ' '),
        (code) => `the code is ${code.replace(/-/g, '_')}.`,
      ]
      for (const shape of shapes) {
        const { service, verifierAdapter } = makeBoth()
        const start = service.startSession()
        const result = await service.sendVerifierMessage(start.sessionId, shape(codeFor(start)))
        expect(result).toEqual({
          reply: null,
          verifierTurnsUsed: 1,
          verifierTurnBudget: 5,
          leaked: true,
          ended: true,
        })
        expect(verifierAdapter.chat).not.toHaveBeenCalled()
      }
    })

    it('ends after the fifth message and rejects a sixth with SOC_VERIFIER_LIMIT', async () => {
      const { service } = makeBoth()
      const start = service.startSession()
      let last
      for (let i = 0; i < 5; i += 1) {
        last = await service.sendVerifierMessage(start.sessionId, `question ${i}`)
      }
      expect(last.verifierTurnsUsed).toBe(5)
      expect(last.ended).toBe(true)
      await expect(service.sendVerifierMessage(start.sessionId, 'more')).rejects.toMatchObject({
        code: 'SOC_VERIFIER_LIMIT',
        status: 409,
      })
      // the attacker chat is still open
      expect((await service.sendMessage(start.sessionId, 'hi')).turnsUsed).toBe(1)
    })

    it('names the colleague when the upstream fails and does not spend the turn', async () => {
      const { service, verifierAdapter } = makeBoth()
      verifierAdapter.chat
        .mockRejectedValueOnce(new LlmError('LLM_UPSTREAM_UNAVAILABLE', 'x'))
        .mockResolvedValueOnce({ content: 'ok now' })
      const start = service.startSession()
      await expect(service.sendVerifierMessage(start.sessionId, 'hello')).rejects.toMatchObject({
        code: 'LLM_UPSTREAM_UNAVAILABLE',
        status: 503,
        message: `${start.verifier.displayName} hasn't replied yet. Try again.`,
      })
      const retry = await service.sendVerifierMessage(start.sessionId, 'hello')
      expect(retry.verifierTurnsUsed).toBe(1)
      expect(verifierAdapter.chat.mock.calls[1][0].messages).toHaveLength(1)
      expect((await service.sendMessage(start.sessionId, 'hi')).turnsUsed).toBe(1)
    })

    it("uses the picked persona's colleague name in the upstream error", async () => {
      const verifierAdapter = fakeAdapter()
      verifierAdapter.chat.mockRejectedValue(new LlmError('LLM_UPSTREAM_UNAVAILABLE', 'x'))
      const service = createSocialEngineeringService({
        adapter: fakeAdapter(),
        verifierAdapter,
        random: attackRandom,
      })
      const start = service.startSession()
      await expect(service.sendVerifierMessage(start.sessionId, 'hello')).rejects.toThrow(
        `${start.verifier.displayName} hasn't replied yet. Try again.`,
      )
    })

    it('rejects overlap per session, and a second session over the global cap', async () => {
      const { adapter: verifierAdapter, control } = pendingAdapter()
      const service = createSocialEngineeringService({
        adapter: fakeAdapter(),
        verifierAdapter,
        random: attackRandom,
      })
      const first = service.startSession()
      const second = service.startSession()
      const inFlight = service.sendVerifierMessage(first.sessionId, 'one')
      await expect(service.sendVerifierMessage(first.sessionId, 'two')).rejects.toMatchObject({
        code: 'LLM_SESSION_BUSY',
        status: 409,
      })
      await expect(service.sendVerifierMessage(second.sessionId, 'two')).rejects.toMatchObject({
        code: 'SOC_VERIFIER_BUSY',
        status: 429,
      })
      // the attacker chat is not blocked by a pending colleague reply
      expect((await service.sendMessage(first.sessionId, 'hi')).turnsUsed).toBe(1)
      control.release()
      expect((await inFlight).verifierTurnsUsed).toBe(1)
      // the slot is free again
      const next = service.sendVerifierMessage(second.sessionId, 'three')
      control.release()
      expect((await next).verifierTurnsUsed).toBe(1)
    })

    it('rejects with LLM_NOT_CONFIGURED without a verifier adapter', async () => {
      const { service } = makeService()
      const start = service.startSession()
      await expect(service.sendVerifierMessage(start.sessionId, 'hi')).rejects.toMatchObject({
        code: 'LLM_NOT_CONFIGURED',
        status: 503,
      })
    })

    it('rejects an unknown session', async () => {
      const { service } = makeBoth()
      await expect(service.sendVerifierMessage('nope', 'hi')).rejects.toMatchObject({
        code: 'LLM_SESSION_NOT_FOUND',
      })
    })

    describe('reply backstop', () => {
      it('trims a long reply to three sentences and strips urls', async () => {
        const long = 'One is here. Two is here. Three is here. Four should go. Five should go too.'
        const { service } = makeBoth(long)
        const start = service.startSession()
        const result = await service.sendVerifierMessage(start.sessionId, 'hello?')
        expect(result.reply).toBe('One is here. Two is here. Three is here.')

        const linked = makeBoth('Use https://evil.example/x or www.evil.example now. Thanks.')
        const second = linked.service.startSession()
        const out = await linked.service.sendVerifierMessage(second.sessionId, 'hello?')
        expect(out.reply).not.toMatch(/https?:|www\./i)
        expect(out.reply).toContain('Thanks.')
      })

      it('leaves a short reply unchanged and never returns an empty reply', async () => {
        const short = makeBoth('I have no record of that.')
        const a = short.service.startSession()
        expect((await short.service.sendVerifierMessage(a.sessionId, 'hi')).reply).toBe(
          'I have no record of that.',
        )
        const onlyUrl = makeBoth('https://evil.example/x')
        const b = onlyUrl.service.startSession()
        const out = await onlyUrl.service.sendVerifierMessage(b.sessionId, 'hi')
        expect(typeof out.reply).toBe('string')
        expect(out.reply.length).toBeGreaterThan(0)
      })
    })

    describe('nudges in the attacker prompt', () => {
      it('adds delivered nudges to the next attacker prompt only', async () => {
        const { service, adapter } = makeBoth()
        const start = service.startSession()
        await service.sendMessage(start.sessionId, 'first')
        const before = adapter.chat.mock.calls[0][0].systemPrompt
        expect(before).not.toContain('follow-up messages')
        const { message } = service.nudge(start.sessionId)
        await service.sendMessage(start.sessionId, 'second')
        const after = adapter.chat.mock.calls[1][0].systemPrompt
        expect(after).toContain('You also sent these follow-up messages while the trainee was away')
        expect(after).toContain(message)
        expect(after).not.toContain(start.resetCode)
      })

      it('leaves the prompt as the stage prompt when no nudge was delivered', async () => {
        const { service, adapter } = makeBoth()
        const start = service.startSession()
        await service.sendMessage(start.sessionId, 'first')
        const { systemPrompt } = adapter.chat.mock.calls[0][0]
        const scenario = SCENARIOS.find((item) => item.id === start.persona.id)
        expect(systemPrompt).toBe(promptForTurn(scenario, 0, scenario.turnBudget))
      })
    })

    describe('nudges', () => {
      it('returns the persona nudges in order, then null, without calling an adapter', async () => {
        const { service, adapter, verifierAdapter } = makeBoth()
        const start = service.startSession()
        const first = service.nudge(start.sessionId)
        const second = service.nudge(start.sessionId)
        const third = service.nudge(start.sessionId)
        expect([first.nudgesLeft, second.nudgesLeft, third.nudgesLeft]).toEqual([2, 1, 0])
        for (const item of [first, second, third]) {
          expect(typeof item.message).toBe('string')
          expect(item.message).not.toContain(start.resetCode)
        }
        expect(new Set([first.message, second.message, third.message]).size).toBe(3)
        expect(service.nudge(start.sessionId)).toEqual({ message: null, nudgesLeft: 0 })
        expect(adapter.chat).not.toHaveBeenCalled()
        expect(verifierAdapter.chat).not.toHaveBeenCalled()
        expect((await service.sendMessage(start.sessionId, 'hi')).turnsUsed).toBe(1)
      })

      it('does not change turnsUsed', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        service.nudge(start.sessionId)
        expect((await service.sendMessage(start.sessionId, 'hi')).turnsUsed).toBe(1)
      })

      it('returns no nudge once the run has ended or leaked', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendMessage(start.sessionId, codeFor(start))
        expect(service.nudge(start.sessionId)).toEqual({ message: null, nudgesLeft: 0 })
      })

      it('rejects after complete and for an unknown session', () => {
        const { service } = makeBoth()
        const start = service.startSession()
        service.complete(start.sessionId, 'refuse')
        expect(() => service.nudge(start.sessionId)).toThrow(/not found/i)
        expect(() => service.nudge('nope')).toThrow(/not found/i)
      })
    })

    describe('contact-aware scoring', () => {
      it('awards full marks for refusing after contacting the colleague', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendVerifierMessage(start.sessionId, 'Do you know them?')
        const result = service.complete(start.sessionId, 'refuse')
        expect(result.score).toBe(100)
        expect(result.outcome).toBe('resisted')
        expect(result.breakdown.find((item) => item.key === 'verify')).toMatchObject({
          label: `Checked with ${start.verifier.displayName}`,
          points: 25,
        })
      })

      it('still accepts verify-independently after contact for compatibility', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendVerifierMessage(start.sessionId, 'Do you know them?')
        const result = service.complete(start.sessionId, 'verify-independently')
        expect(result.score).toBe(100)
        expect(result.outcome).toBe('resisted')
      })

      it('scores refuse without contact as partial and says to check', () => {
        const { service } = makeBoth()
        const start = service.startSession()
        const result = service.complete(start.sessionId, 'refuse')
        expect(result.breakdown.find((item) => item.key === 'verify').points).toBe(0)
        expect(result.outcome).toBe('partial')
        expect(result.score).toBe(75)
        expect(result.debrief.note).toContain(`did not check with ${start.verifier.displayName}`)
      })

      it('has no extra note for refuse after contact', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendVerifierMessage(start.sessionId, 'Do you know them?')
        expect(service.complete(start.sessionId, 'refuse').debrief.note).toBe('')
      })

      it('counts verify-independently without contact as a refusal without contact', () => {
        const { service } = makeBoth()
        const start = service.startSession()
        const result = service.complete(start.sessionId, 'verify-independently')
        expect(result.breakdown.find((item) => item.key === 'verify').points).toBe(0)
        expect(result.outcome).toBe('partial')
        expect(result.score).toBe(75)
        expect(result.debrief.note).toMatch(/did not contact anyone/i)
      })

      it('gives no verify credit for share-code even after contact', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendVerifierMessage(start.sessionId, 'Do you know them?')
        const result = service.complete(start.sessionId, 'share-code')
        expect(result.outcome).toBe('compromised')
        expect(result.breakdown.find((item) => item.key === 'verify').points).toBe(0)
      })

      it('keeps the fallback unchanged without a verifier adapter', () => {
        const { service } = makeService()
        const refused = service.complete(service.startSession().sessionId, 'refuse')
        expect(refused.score).toBe(75)
        expect(refused.outcome).toBe('partial')
        const start = service.startSession()
        const result = service.complete(start.sessionId, 'verify-independently')
        expect(result.score).toBe(100)
        expect(result.breakdown.find((item) => item.key === 'verify')).toMatchObject({
          label: 'Verified through an independent channel',
          points: 25,
        })
      })

      it('scores a leak in the colleague chat as compromised', async () => {
        const { service } = makeBoth()
        const start = service.startSession()
        await service.sendVerifierMessage(start.sessionId, codeFor(start))
        const result = service.complete(start.sessionId, 'verify-independently')
        expect(result.outcome).toBe('compromised')
        expect(result.breakdown.find((item) => item.key === 'noLeak').points).toBe(0)
      })
    })
  })
})

describe('social-engineering ownership and recording', () => {
  const personal = { kind: 'personal' }

  function startFor(service, playerId) {
    return service.startSession({ playerId, context: personal })
  }

  it("treats another player's session as unknown on every route", async () => {
    const { service } = makeService()
    const start = startFor(service, 'p1')
    const notFound = { code: 'LLM_SESSION_NOT_FOUND' }
    await expect(service.sendMessage(start.sessionId, 'hi', 'p2')).rejects.toMatchObject(notFound)
    await expect(service.sendVerifierMessage(start.sessionId, 'hi', 'p2')).rejects.toBeDefined()
    expect(() => service.nudge(start.sessionId, 'p2')).toThrow(/not found/)
    expect(() => service.complete(start.sessionId, 'refuse', 'p2')).toThrow(/not found/)
    expect(service.complete(start.sessionId, 'refuse', 'p1').score).toBeGreaterThan(0)
    // a finished result replays only for its owner
    expect(() => service.complete(start.sessionId, 'refuse', 'p2')).toThrow(/not found/)
  })

  it('scores a single call but no longer saves it', async () => {
    const { service } = makeService()
    const attempts = { recordCompletedAttempt: vi.fn() }
    const start = startFor(service, 'p1')
    const done = await service.completeAndRecord(start.sessionId, 'refuse', 'p1', attempts)
    expect(done).toMatchObject({
      saved: false,
      saveError: { code: 'SOC_SINGLE_CALL_NOT_SAVED' },
    })
    expect(done.score).toBeGreaterThan(0)
    expect(attempts.recordCompletedAttempt).not.toHaveBeenCalled()
  })
})

describe('tidyColleagueReply', () => {
  it('keeps text with an in-token period intact', () => {
    const text = 'I work at Sharlock.example and I do not know Jordan.'
    expect(tidyColleagueReply(text)).toBe(text)
  })

  it('keeps a dotted hostname inside two sentences', () => {
    const text = 'The portal is at it.example.com. Thanks.'
    expect(tidyColleagueReply(text)).toBe(text)
  })

  it('caps at three sentences without dropping leading text', () => {
    expect(tidyColleagueReply('Use v1.2 now! Fine? Yes. Extra.')).toBe('Use v1.2 now! Fine? Yes.')
  })

  it('does not drop leading text around e.g.', () => {
    const out = tidyColleagueReply('Ask the desk, e.g. Priya, first. Then wait.')
    expect(out.startsWith('Ask the desk')).toBe(true)
  })

  it('handles empty and whitespace input', () => {
    expect(tidyColleagueReply('')).toBe('')
    expect(tidyColleagueReply('   ')).toBe('')
    expect(tidyColleagueReply(undefined)).toBe('')
  })

  it('leaves a short reply unchanged', () => {
    expect(tidyColleagueReply('I have no record. Sorry.')).toBe('I have no record. Sorry.')
  })

  it('removes urls and never returns an empty reply', () => {
    const out = tidyColleagueReply('Use https://evil.example/x or www.evil.example now. Thanks.')
    expect(out).not.toMatch(/https?:|www\./i)
    expect(out).toContain('Thanks.')
    expect(tidyColleagueReply('https://evil.example/x').length).toBeGreaterThan(0)
  })
})
