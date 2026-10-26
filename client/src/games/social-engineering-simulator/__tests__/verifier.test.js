import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref, watch } from 'vue'
import { useVerifierChat } from '../composables/useVerifierChat.js'
import { useSocialEngineeringSession } from '../composables/useSocialEngineeringSession.js'
import {
  completeSession,
  NUDGE_IDLE_MS,
  requestNudge,
  sendMessage,
  sendVerifierMessage,
  startSession,
  VERIFIER_TIMEOUT_MS,
} from '../simulator.js'

vi.mock('../simulator.js', async (original) => ({
  ...(await original()),
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  completeSession: vi.fn(),
  sendVerifierMessage: vi.fn(),
  requestNudge: vi.fn(),
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.resetAllMocks()
})

const SESSION = '11111111-1111-1111-1111-111111111111'
const VERIFIER = { displayName: 'Priya Nair', role: 'IT Service Desk', turnBudget: 4 }
const session = {
  sessionId: SESSION,
  persona: { id: 'it-helpdesk', displayName: 'Jordan Vale' },
  brief: { title: 't', objective: 'o', turnBudget: 8 },
  openingMessage: 'Hi, this is Jordan.',
  verifier: VERIFIER,
}
const reply = (over = {}) => ({
  reply: 'Yes, that is Jordan.',
  verifierTurnsUsed: 1,
  verifierTurnBudget: 4,
  leaked: false,
  ended: false,
  ...over,
})
const apiError = (status, code, message) => ({
  response: { status, data: { error: { code, message } } },
})

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

async function started(extra = {}) {
  startSession.mockResolvedValue({ ...session, ...extra })
  const h = harness()
  await h.game.start({ kind: 'personal' })
  await flushPromises()
  h.game.begin()
  return h
}

describe('exported constants', () => {
  it('exposes the timing constants', () => {
    expect(NUDGE_IDLE_MS).toBe(12000)
    expect(VERIFIER_TIMEOUT_MS).toBe(65000)
  })
})

describe('useVerifierChat', () => {
  function chat(overrides = {}) {
    const hooks = { onLeaked: vi.fn(), onSessionGone: vi.fn() }
    let api
    mount({
      setup() {
        api = useVerifierChat({
          sessionId: ref(SESSION),
          getSignal: () => undefined,
          ...hooks,
          ...overrides,
        })
        return () => null
      },
    })
    api.init(VERIFIER)
    return { api, hooks }
  }

  it('starts empty with the info from init', () => {
    const { api } = chat()
    expect(api.info.value).toEqual(VERIFIER)
    expect(api.turnBudget.value).toBe(4)
    expect(api.contacted.value).toBe(false)
    expect(api.messages.value).toEqual([])
  })

  it('treats a null verifier as absent', () => {
    const { api } = chat()
    api.init(null)
    expect(api.info.value).toBeNull()
    expect(api.turnBudget.value).toBe(0)
  })

  it('appends both sides and counts turns after a reply', async () => {
    sendVerifierMessage.mockResolvedValue(reply())
    const { api } = chat()
    await api.send('Is Jordan real?')
    expect(sendVerifierMessage).toHaveBeenCalledWith(SESSION, 'Is Jordan real?', undefined)
    expect(api.messages.value).toEqual([
      { role: 'you', content: 'Is Jordan real?' },
      { role: 'colleague', content: 'Yes, that is Jordan.' },
    ])
    expect(api.contacted.value).toBe(true)
    expect(api.turnsUsed.value).toBe(1)
    expect(api.pending.value).toBe(false)
  })

  it('does not mark contacted on a failure and surfaces the server message', async () => {
    sendVerifierMessage.mockRejectedValue(
      apiError(503, 'LLM_UPSTREAM_UNAVAILABLE', "Priya hasn't replied yet. Try again."),
    )
    const { api } = chat()
    await api.send('hello')
    expect(api.error.value).toBe("Priya hasn't replied yet. Try again.")
    expect(api.contacted.value).toBe(false)
    expect(api.messages.value).toEqual([])
    sendVerifierMessage.mockResolvedValue(reply())
    await api.send('hello')
    expect(api.error.value).toBe('')
    expect(api.contacted.value).toBe(true)
  })

  it('fills the chat on SOC_VERIFIER_LIMIT without a fatal error', async () => {
    sendVerifierMessage.mockRejectedValue(apiError(409, 'SOC_VERIFIER_LIMIT', 'Chat is full.'))
    const { api, hooks } = chat()
    await api.send('one more')
    expect(api.error.value).toBe('Chat is full.')
    expect(api.turnsUsed.value).toBe(4)
    expect(hooks.onSessionGone).not.toHaveBeenCalled()
  })

  it('reports a gone session', async () => {
    sendVerifierMessage.mockRejectedValue(apiError(404, 'LLM_SESSION_NOT_FOUND', 'gone'))
    const { api, hooks } = chat()
    await api.send('hello')
    expect(hooks.onSessionGone).toHaveBeenCalledTimes(1)
  })

  it('reports a leak', async () => {
    sendVerifierMessage.mockResolvedValue(reply({ leaked: true, ended: true }))
    const { api, hooks } = chat()
    await api.send('the code is X')
    expect(hooks.onLeaked).toHaveBeenCalledTimes(1)
  })

  it('ignores empty text and a second send while pending', async () => {
    let resolve
    sendVerifierMessage.mockReturnValue(new Promise((r) => (resolve = r)))
    const { api } = chat()
    await api.send('   ')
    expect(sendVerifierMessage).not.toHaveBeenCalled()
    const first = api.send('hi')
    await api.send('again')
    expect(sendVerifierMessage).toHaveBeenCalledTimes(1)
    resolve(reply())
    await first
  })

  it('keeps the failed text for restoring and clears it on success or clear', async () => {
    sendVerifierMessage.mockRejectedValue(apiError(503, 'LLM_UPSTREAM_UNAVAILABLE', 'try again'))
    const { api } = chat()
    await api.send('  my long question ')
    expect(api.failedText.value).toBe('my long question')
    sendVerifierMessage.mockResolvedValue(reply())
    await api.send('my long question')
    expect(api.failedText.value).toBe('')
    sendVerifierMessage.mockRejectedValue(apiError(503, 'LLM_UPSTREAM_UNAVAILABLE', 'try again'))
    await api.send('another')
    expect(api.failedText.value).toBe('another')
    api.clear()
    expect(api.failedText.value).toBe('')
  })

  it('re-sets failedText when the same text fails twice in a row', async () => {
    sendVerifierMessage.mockRejectedValue(apiError(503, 'LLM_UPSTREAM_UNAVAILABLE', 'try again'))
    const { api } = chat()
    const seen = []
    watch(api.failedText, (value) => seen.push(value), { flush: 'sync' })
    await api.send('hello')
    expect(api.failedText.value).toBe('hello')
    await api.send('hello')
    expect(api.failedText.value).toBe('hello')
    expect(seen).toEqual(['hello', '', 'hello'])
  })

  it('clear resets everything', async () => {
    sendVerifierMessage.mockResolvedValue(reply())
    const { api } = chat()
    await api.send('hi')
    api.clear()
    expect(api.info.value).toBeNull()
    expect(api.messages.value).toEqual([])
    expect(api.contacted.value).toBe(false)
    expect(api.turnsUsed.value).toBe(0)
  })
})

describe('session composable with a colleague', () => {
  it('exposes the verifier', async () => {
    const { game } = await started()
    expect(game.verifier.value).toEqual(VERIFIER)
    expect(game.verifierTurnBudget.value).toBe(4)
    expect(game.activeChat.value).toBe('attacker')
    expect(game.unread).toEqual({ attacker: 0, verifier: 0 })
  })

  it('behaves as before without a verifier', async () => {
    const { game } = await started({ verifier: null })
    expect(game.verifier.value).toBeNull()
    expect(game.canSendVerifier.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('also treats a missing verifier field as none', async () => {
    const { verifier, ...legacy } = session
    void verifier
    startSession.mockResolvedValue(legacy)
    const { game } = harness()
    await game.start({ kind: 'personal' })
    await flushPromises()
    game.begin()
    expect(game.verifier.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends to the colleague and leaves the attacker chat free', async () => {
    let resolve
    sendVerifierMessage.mockReturnValue(new Promise((r) => (resolve = r)))
    const { game } = await started()
    const sending = game.sendVerifier('Is Jordan real?')
    expect(game.verifierPending.value).toBe(true)
    expect(game.pending.value).toBe(false)
    expect(game.canSend.value).toBe(true)
    resolve(reply())
    await sending
    await flushPromises()
    expect(game.verifierMessages.value.map((m) => m.role)).toEqual(['you', 'colleague'])
    expect(game.verifierContacted.value).toBe(true)
    expect(game.verifierTurnsUsed.value).toBe(1)
    expect(game.verifierPending.value).toBe(false)
  })

  it('counts unread colleague replies while the attacker tab is active', async () => {
    sendVerifierMessage.mockResolvedValue(reply())
    const { game } = await started()
    await game.sendVerifier('hi')
    expect(game.unread.verifier).toBe(1)
    game.selectChat('verifier')
    expect(game.activeChat.value).toBe('verifier')
    expect(game.unread.verifier).toBe(0)
    await game.sendVerifier('again')
    expect(game.unread.verifier).toBe(0)
  })

  it('exposes verifierEnded and the failed text', async () => {
    sendVerifierMessage.mockRejectedValueOnce(apiError(503, 'X', 'nope'))
    const { game } = await started()
    expect(game.verifierEnded.value).toBe(false)
    await game.sendVerifier('hello')
    expect(game.verifierFailedText.value).toBe('hello')
    sendVerifierMessage.mockResolvedValue(reply({ ended: true }))
    await game.sendVerifier('hello')
    expect(game.verifierFailedText.value).toBe('')
    expect(game.verifierEnded.value).toBe(true)
  })

  it('counts an unread attacker reply while the colleague tab is active', async () => {
    sendMessage.mockResolvedValue({
      reply: 'Still there?',
      turnsUsed: 1,
      turnBudget: 8,
      leaked: false,
      ended: false,
    })
    const { game } = await started()
    game.selectChat('verifier')
    await game.send('hello')
    expect(game.unread.attacker).toBe(1)
    game.selectChat('attacker')
    expect(game.unread.attacker).toBe(0)
    await game.send('again')
    expect(game.unread.attacker).toBe(0)
  })

  it('still allows checking the colleague after the attacker budget is spent', async () => {
    sendMessage.mockResolvedValue({
      reply: 'last',
      turnsUsed: 8,
      turnBudget: 8,
      leaked: false,
      ended: true,
    })
    const { game } = await started()
    await game.send('hello')
    expect(game.closed.value).toBe(true)
    expect(game.canSendVerifier.value).toBe(true)
  })

  it('surfaces a failed send and allows a retry', async () => {
    sendVerifierMessage.mockRejectedValue(
      apiError(503, 'LLM_UPSTREAM_UNAVAILABLE', "Priya hasn't replied yet. Try again."),
    )
    const { game } = await started()
    await game.sendVerifier('hi')
    expect(game.verifierError.value).toBe("Priya hasn't replied yet. Try again.")
    expect(game.verifierContacted.value).toBe(false)
    expect(game.canSendVerifier.value).toBe(true)
    expect(game.status.value).toBe('chatting')
  })

  it('moves to the fatal error state when the session is gone', async () => {
    sendVerifierMessage.mockRejectedValue(apiError(404, 'LLM_SESSION_NOT_FOUND', 'gone'))
    const { game } = await started()
    await game.sendVerifier('hi')
    expect(game.status.value).toBe('error')
    expect(game.error.value).toMatch(/ended or expired/i)
  })

  it('marks the run leaked and closed when the colleague leaks', async () => {
    sendVerifierMessage.mockResolvedValue(reply({ leaked: true, ended: true }))
    const { game } = await started()
    await game.sendVerifier('the code is X')
    expect(game.leaked.value).toBe(true)
    expect(game.closed.value).toBe(true)
    expect(game.canSend.value).toBe(false)
    expect(game.canSendVerifier.value).toBe(false)
  })

  it('clears the colleague state on restart', async () => {
    sendVerifierMessage.mockResolvedValue(reply())
    const { game } = await started()
    await game.sendVerifier('hi')
    startSession.mockResolvedValue({ ...session, verifier: null })
    game.reset()
    await game.start()
    await flushPromises()
    expect(game.verifier.value).toBeNull()
    expect(game.verifierMessages.value).toEqual([])
    expect(game.verifierContacted.value).toBe(false)
    expect(game.unread).toEqual({ attacker: 0, verifier: 0 })
    expect(game.activeChat.value).toBe('attacker')
  })
})

describe('nudge timer', () => {
  it('requests one nudge after the idle period and appends it', async () => {
    requestNudge.mockResolvedValue({ message: 'Did you reach Priya?', nudgesLeft: 2 })
    const { game } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS - 1)
    expect(requestNudge).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(requestNudge).toHaveBeenCalledTimes(1)
    expect(requestNudge).toHaveBeenCalledWith(SESSION, expect.anything())
    expect(game.messages.value.at(-1)).toEqual({
      role: 'colleague',
      content: 'Did you reach Priya?',
    })
    expect(game.unread.attacker).toBe(0)
  })

  it('counts an unread nudge when the colleague tab is active', async () => {
    requestNudge.mockResolvedValue({ message: 'ping', nudgesLeft: 2 })
    const { game } = await started()
    game.selectChat('verifier')
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS)
    expect(game.unread.attacker).toBe(1)
  })

  it('stops requesting once no nudges are left', async () => {
    requestNudge.mockResolvedValue({ message: 'last one', nudgesLeft: 0 })
    await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS * 5)
    expect(requestNudge).toHaveBeenCalledTimes(1)
  })

  it('restarts the timer when the player sends', async () => {
    sendMessage.mockResolvedValue({
      reply: 'ok',
      turnsUsed: 1,
      turnBudget: 8,
      leaked: false,
      ended: false,
    })
    requestNudge.mockResolvedValue({ message: null, nudgesLeft: 3 })
    const { game } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS - 1000)
    await game.send('hello')
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS - 1)
    expect(requestNudge).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(requestNudge).toHaveBeenCalledTimes(1)
  })

  it('never fires while an attacker reply is pending', async () => {
    sendMessage.mockReturnValue(new Promise(() => {}))
    const { game } = await started()
    game.send('hello')
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS * 3)
    expect(requestNudge).not.toHaveBeenCalled()
  })

  it('does not fire after the run is closed', async () => {
    sendMessage.mockResolvedValue({
      reply: null,
      turnsUsed: 1,
      turnBudget: 8,
      leaked: true,
      ended: true,
    })
    const { game } = await started()
    await game.send('code')
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS * 3)
    expect(requestNudge).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('swallows nudge errors silently', async () => {
    requestNudge.mockRejectedValue(new Error('network'))
    const { game } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS)
    expect(game.error.value).toBe('')
    expect(game.verifierError.value).toBe('')
    expect(game.status.value).toBe('chatting')
  })

  it('clears the timer on unmount', async () => {
    const { wrapper } = await started()
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

const RESULT = { score: 100, maxScore: 100, outcome: 'resisted', breakdown: [], saved: false }
const deferred = () => {
  const d = {}
  d.promise = new Promise((resolve, reject) => {
    d.resolve = resolve
    d.reject = reject
  })
  return d
}

describe('late colleague replies and the debrief', () => {
  it('ignores a leak that resolves after the debrief is shown', async () => {
    const late = deferred()
    sendVerifierMessage.mockReturnValue(late.promise)
    completeSession.mockResolvedValue(RESULT)
    const { game } = await started()
    const sending = game.sendVerifier('hi')
    await game.complete('refuse')
    expect(game.result.value).toEqual(RESULT)
    late.resolve(reply({ leaked: true, ended: true }))
    await sending
    await flushPromises()
    expect(game.result.value).toEqual(RESULT)
    expect(game.leaked.value).toBe(false)
    expect(game.closed.value).toBe(false)
    expect(game.status.value).toBe('ended')
  })

  it('keeps the debrief when the colleague session is reported gone afterwards', async () => {
    const late = deferred()
    sendVerifierMessage.mockReturnValue(late.promise)
    completeSession.mockResolvedValue(RESULT)
    const { game } = await started()
    const sending = game.sendVerifier('hi')
    await game.complete('refuse')
    late.reject(apiError(404, 'LLM_SESSION_NOT_FOUND', 'gone'))
    await sending
    await flushPromises()
    expect(game.status.value).toBe('ended')
    expect(game.result.value).toEqual(RESULT)
    expect(game.error.value).toBe('')
  })

  it('refuses a colleague send while complete() is in flight', async () => {
    const completing = deferred()
    completeSession.mockReturnValue(completing.promise)
    const { game } = await started()
    const finishing = game.complete('refuse')
    expect(game.canSendVerifier.value).toBe(false)
    await game.sendVerifier('hi')
    expect(sendVerifierMessage).not.toHaveBeenCalled()
    completing.resolve(RESULT)
    await finishing
  })

  it('does not let a pending colleague reply block finishing the run', async () => {
    sendVerifierMessage.mockReturnValue(new Promise(() => {}))
    completeSession.mockResolvedValue(RESULT)
    const { game } = await started()
    game.sendVerifier('hi')
    expect(game.canDecide.value).toBe(true)
    await game.complete('refuse')
    expect(game.status.value).toBe('ended')
  })

  it('leaves no timer behind after complete()', async () => {
    completeSession.mockResolvedValue(RESULT)
    const { game } = await started()
    expect(vi.getTimerCount()).toBe(1)
    await game.complete('refuse')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops a nudge that arrives after the run closed', async () => {
    const late = deferred()
    requestNudge.mockReturnValue(late.promise)
    sendVerifierMessage.mockResolvedValue(reply({ leaked: true, ended: true }))
    const { game } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS)
    await game.sendVerifier('code')
    late.resolve({ message: 'too late', nudgesLeft: 2 })
    await flushPromises()
    expect(game.messages.value.map((m) => m.content)).toEqual(['Hi, this is Jordan.'])
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('stale responses after reset and unmount', () => {
  it('ignores colleague and nudge responses that resolve after reset()', async () => {
    const lateReply = deferred()
    const lateNudge = deferred()
    sendVerifierMessage.mockReturnValue(lateReply.promise)
    requestNudge.mockReturnValue(lateNudge.promise)
    const { game } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS)
    const sending = game.sendVerifier('hi')
    startSession.mockResolvedValue({ ...session, verifier: VERIFIER })
    game.reset()
    await game.start()
    await flushPromises()
    const timers = vi.getTimerCount()
    lateReply.resolve(reply({ leaked: true, ended: true }))
    lateNudge.resolve({ message: 'old nudge', nudgesLeft: 1 })
    await sending
    await flushPromises()
    expect(game.verifierMessages.value).toEqual([])
    expect(game.verifierContacted.value).toBe(false)
    expect(game.leaked.value).toBe(false)
    expect(game.closed.value).toBe(false)
    expect(game.unread).toEqual({ attacker: 0, verifier: 0 })
    expect(game.messages.value).toEqual([{ role: 'colleague', content: 'Hi, this is Jordan.' }])
    expect(vi.getTimerCount()).toBe(timers)
  })

  it('ignores colleague and nudge responses that resolve after unmount', async () => {
    const lateReply = deferred()
    const lateNudge = deferred()
    sendVerifierMessage.mockReturnValue(lateReply.promise)
    requestNudge.mockReturnValue(lateNudge.promise)
    const { game, wrapper } = await started()
    await vi.advanceTimersByTimeAsync(NUDGE_IDLE_MS)
    const sending = game.sendVerifier('hi')
    wrapper.unmount()
    lateReply.resolve(reply({ leaked: true, ended: true }))
    lateNudge.resolve({ message: 'old nudge', nudgesLeft: 1 })
    await sending
    await flushPromises()
    expect(game.leaked.value).toBe(false)
    expect(game.closed.value).toBe(false)
    expect(game.verifierMessages.value).toEqual([])
    expect(game.unread).toEqual({ attacker: 0, verifier: 0 })
    expect(game.messages.value).toEqual([{ role: 'colleague', content: 'Hi, this is Jordan.' }])
    expect(vi.getTimerCount()).toBe(0)
  })
})
