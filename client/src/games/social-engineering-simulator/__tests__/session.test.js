import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useSocialEngineeringSession } from '../composables/useSocialEngineeringSession.js'
import { completeSession, sendMessage, startSession } from '../simulator.js'

vi.mock('../simulator.js', async (original) => ({
  ...(await original()),
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  completeSession: vi.fn(),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

const SESSION = '11111111-1111-1111-1111-111111111111'
const session = {
  sessionId: SESSION,
  gameId: 'social-engineering-simulator',
  rulesetVersion: '2026-10-11',
  persona: { id: 'it-helpdesk', displayName: 'Jordan Vale (IT Service Desk)' },
  brief: {
    title: 'IT Service Desk is paging you',
    objective: 'A help-desk agent asks for the reset code.',
    turnBudget: 8,
  },
  openingMessage: 'Hi, this is Jordan.',
}

const gone = {
  response: { status: 404, data: { error: { code: 'LLM_SESSION_NOT_FOUND', message: 'gone' } } },
}

function harness() {
  let game
  const wrapper = mount({
    setup() {
      game = useSocialEngineeringSession()
      return () => null
    },
  })
  return { game, wrapper }
}

describe('social-engineering session composable', () => {
  it('starts a session and seeds the opening message', async () => {
    startSession.mockResolvedValue(session)
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith({ kind: 'personal' }, expect.anything())
    expect(game.status.value).toBe('briefing')
    expect(game.persona.value.displayName).toBe('Jordan Vale (IT Service Desk)')
    expect(game.turnBudget.value).toBe(8)
    expect(game.messages.value).toEqual([{ role: 'colleague', content: 'Hi, this is Jordan.' }])
  })

  it('keeps the reset code from the start response and replaces it on restart', async () => {
    startSession
      .mockResolvedValueOnce({ ...session, resetCode: 'SYNTH-RESET-4821' })
      .mockResolvedValueOnce({ ...session, resetCode: 'SYNTH-RESET-7731' })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    expect(game.resetCode.value).toBe('SYNTH-RESET-4821')
    game.reset()
    await game.start()
    await flushPromises()
    expect(game.resetCode.value).toBe('SYNTH-RESET-7731')
  })

  it('moves to the error state when completing a session the server no longer has', async () => {
    startSession.mockResolvedValue(session)
    completeSession.mockRejectedValue(gone)
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.complete('refuse')
    expect(game.status.value).toBe('error')
    expect(game.error.value).toMatch(/ended or expired/i)
    expect(game.pending.value).toBe(false)
  })

  it('moves to the error state when a message hits a session the server no longer has', async () => {
    startSession.mockResolvedValue(session)
    sendMessage.mockRejectedValue(gone)
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.send('hello')
    expect(game.status.value).toBe('error')
    expect(game.error.value).toMatch(/ended or expired/i)
  })

  it('keeps the retry path when completing fails for any other reason', async () => {
    startSession.mockResolvedValue(session)
    completeSession.mockRejectedValue(new Error('network'))
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.complete('refuse')
    expect(game.status.value).toBe('chatting')
  })

  it('sends a message to the active session and appends the reply', async () => {
    startSession.mockResolvedValue(session)
    sendMessage.mockResolvedValue({
      reply: 'Could you read me the code?',
      turnsUsed: 1,
      turnBudget: 8,
      leaked: false,
      ended: false,
    })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.send('Who is this exactly?')
    await flushPromises()
    expect(sendMessage).toHaveBeenCalledWith(SESSION, 'Who is this exactly?', expect.anything())
    expect(game.messages.value.map((m) => m.role)).toEqual(['colleague', 'you', 'colleague'])
    expect(game.turnsUsed.value).toBe(1)
    expect(game.status.value).toBe('chatting')
  })

  it('marks the run leaked and closed when the server detects the code', async () => {
    startSession.mockResolvedValue(session)
    sendMessage.mockResolvedValue({
      reply: null,
      turnsUsed: 1,
      turnBudget: 8,
      leaked: true,
      ended: true,
    })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.send('the code is SYNTH-RESET-4821')
    await flushPromises()
    expect(game.leaked.value).toBe(true)
    expect(game.closed.value).toBe(true)
    expect(game.canSend.value).toBe(false)
  })

  it('completes with the chosen decision and stores the debrief', async () => {
    startSession.mockResolvedValue(session)
    completeSession.mockResolvedValue({
      score: 100,
      maxScore: 100,
      outcome: 'resisted',
      breakdown: [],
      debrief: { summary: 's', tactic: 't', saferesponse: 'r' },
      saved: false,
    })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.complete('verify-independently')
    await flushPromises()
    expect(completeSession).toHaveBeenCalledWith(SESSION, 'verify-independently', expect.anything())
    expect(game.result.value.outcome).toBe('resisted')
    expect(game.status.value).toBe('ended')
  })

  it('surfaces a server message when the session cannot start', async () => {
    startSession.mockRejectedValue({
      response: { data: { error: { message: 'The simulation needs a provider.' } } },
    })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    expect(game.status.value).toBe('error')
    expect(game.error.value).toBe('The simulation needs a provider.')
  })

  it('aborts the in-flight request when the component unmounts', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    startSession.mockResolvedValue(session)
    const { game, wrapper } = harness()
    const pending = game.start({ kind: 'personal' })
    wrapper.unmount()
    await pending
    await flushPromises()
    expect(abort).toHaveBeenCalled()
  })
})

describe('social-engineering saving', () => {
  const unsaved = {
    score: 85,
    maxScore: 100,
    outcome: 'resisted',
    breakdown: [],
    debrief: { summary: 's', tactic: 't', saferesponse: 'r' },
    saved: false,
    saveError: { code: 'ATTEMPT_SAVE_FAILED', message: 'Could not save.' },
  }

  it('starts in the chooser and sends the class context to the server', async () => {
    startSession.mockResolvedValue(session)
    const { game } = harness()
    expect(game.status.value).toBe('choosing')
    await game.start({ kind: 'cohort', cohortId: 'c1' })
    expect(startSession).toHaveBeenCalledWith({ kind: 'cohort', cohortId: 'c1' }, expect.anything())
  })

  it('retries the save with the same decision and keeps the score', async () => {
    startSession.mockResolvedValue(session)
    completeSession
      .mockResolvedValueOnce(unsaved)
      .mockResolvedValueOnce({ ...unsaved, saved: true, saveError: undefined })
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.complete('refuse')
    await flushPromises()
    expect(game.result.value.saved).toBe(false)
    await game.retrySave()
    expect(completeSession).toHaveBeenNthCalledWith(2, SESSION, 'refuse', expect.anything())
    expect(game.result.value.saved).toBe(true)
    expect(game.result.value.score).toBe(85)
  })

  it('keeps the unsaved result and shows an error when the retry fails', async () => {
    startSession.mockResolvedValue(session)
    completeSession.mockResolvedValueOnce(unsaved).mockRejectedValueOnce(new Error('network'))
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    await game.complete('refuse')
    await flushPromises()
    await game.retrySave()
    expect(game.result.value.saved).toBe(false)
    expect(game.saveRetryError.value).not.toBe('')
    expect(game.status.value).toBe('ended')
  })
})

describe('social-engineering session without a colleague', () => {
  it('has no verifier and no nudge timer', async () => {
    vi.useFakeTimers()
    startSession.mockResolvedValue(session)
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    expect(game.verifier.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
