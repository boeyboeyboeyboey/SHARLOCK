import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useTriageRun } from '../useTriageRun.js'
import { readAttempt, writeAttempt } from '../../../features/attempts/api.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: (failure) => ({
    message: failure?.response?.data?.error?.message ?? 'Could not reach saved play.',
    status: failure?.response?.status ?? 0,
  }),
}))

const START = new Date('2026-10-28T10:00:00.000Z')
const email = (id) => ({ roundId: id, tier: 1, senderName: 'A', parts: [{ id: 'sender' }] })
const lastCall = { roundId: 'r1', call: 'trust', correct: true, tellPartIds: ['sender'] }

function snap(overrides = {}, state = {}) {
  return {
    gameId: 'phishing-post-mortem',
    attemptId: 'att-1',
    revision: 0,
    status: 'active',
    mode: 'standard',
    deadlineAt: new Date(START.getTime() + 180000).toISOString(),
    score: 0,
    publicState: {
      mode: 'standard',
      totalRounds: null,
      maxMistakes: 3,
      roundsPlayed: 0,
      score: 0,
      streak: 0,
      mistakes: 0,
      current: email('r1'),
      last: null,
      ...state,
    },
    ...overrides,
  }
}

const practice = () =>
  snap(
    { mode: 'practice', deadlineAt: null },
    { mode: 'practice', totalRounds: 12, maxMistakes: null },
  )

function harness() {
  let game
  const wrapper = mount({
    setup() {
      game = useTriageRun()
      return () => null
    },
  })
  return { game, wrapper }
}

async function started(first) {
  writeAttempt.mockResolvedValueOnce(first)
  const { game, wrapper } = harness()
  await game.start({ kind: 'cohort', cohortId: 'c1' })
  await flushPromises()
  return { game, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('triage run', () => {
  it('starts a class run as timed and counts down', async () => {
    const { game } = await started(snap())
    expect(writeAttempt.mock.calls[0][0]).toBe('/games/phishing-post-mortem/attempts')
    expect(game.timed.value).toBe(true)
    expect(game.secondsLeft.value).toBe(180)
    await vi.advanceTimersByTimeAsync(5000)
    expect(game.secondsLeft.value).toBe(175)
    expect(game.current.value.roundId).toBe('r1')
  })

  it('has no timer in practice', async () => {
    const { game } = await started(practice())
    expect(game.timed.value).toBe(false)
    expect(game.secondsLeft.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends report and trust with the action id and revision', async () => {
    const { game } = await started(snap())
    writeAttempt.mockResolvedValueOnce(snap({ revision: 1 }, { current: email('r2') }))
    await game.report('sender')
    const [path, body] = writeAttempt.mock.calls[1]
    expect(path).toBe('/attempts/att-1/actions')
    expect(body).toMatchObject({
      type: 'triage-call',
      expectedRevision: 0,
      payload: { roundId: 'r1', call: 'report', partId: 'sender' },
    })
    expect(body.actionId).toEqual(expect.any(String))
    expect(game.previousEmail.value.roundId).toBe('r1')
    writeAttempt.mockResolvedValueOnce(snap({ revision: 2 }, { current: email('r3') }))
    await game.trust()
    expect(writeAttempt.mock.calls[2][1]).toMatchObject({
      expectedRevision: 1,
      payload: { roundId: 'r2', call: 'trust' },
    })
  })

  it('ignores a second call while one is in flight', async () => {
    const { game } = await started(snap())
    let release
    writeAttempt.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const first = game.trust()
    expect(await game.trust()).toBe(false)
    release(snap({ revision: 1 }, { current: email('r2') }))
    await first
    expect(writeAttempt).toHaveBeenCalledTimes(2)
  })

  it('completes once when the run ends on the server', async () => {
    const { game } = await started(snap())
    writeAttempt
      .mockResolvedValueOnce(snap({ revision: 1 }, { current: null, last: lastCall }))
      .mockResolvedValueOnce(snap({ revision: 2, status: 'completed' }, { current: null }))
    await game.trust()
    await flushPromises()
    const completes = writeAttempt.mock.calls.filter(([path]) => path.endsWith('/complete'))
    expect(completes).toHaveLength(1)
    expect(game.completed.value).toBe(true)
    expect(game.previousEmail.value.roundId).toBe('r1')
  })

  it('completes when the clock reaches zero and stops the timer', async () => {
    const { game } = await started(snap())
    writeAttempt.mockResolvedValueOnce(snap({ revision: 1, status: 'completed' }))
    await vi.advanceTimersByTimeAsync(180000)
    expect(game.secondsLeft.value).toBe(0)
    const completes = writeAttempt.mock.calls.filter(([path]) => path.endsWith('/complete'))
    expect(completes).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries a refused save after a second', async () => {
    const { game } = await started(snap())
    const refused = Object.assign(new Error('no'), { response: { status: 409, data: {} } })
    writeAttempt
      .mockRejectedValueOnce(refused)
      .mockResolvedValueOnce(snap({ revision: 1, status: 'completed' }))
    await vi.advanceTimersByTimeAsync(180000)
    expect(game.completed.value).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(writeAttempt.mock.calls.filter(([path]) => path.endsWith('/complete'))).toHaveLength(2)
    expect(game.completed.value).toBe(true)
  })

  it('reads the attempt again after a stale round conflict', async () => {
    const { game } = await started(snap())
    const stale = Object.assign(new Error('stale'), { response: { status: 409, data: {} } })
    writeAttempt.mockRejectedValueOnce(stale)
    readAttempt.mockResolvedValueOnce(snap({ revision: 3 }, { current: email('r4') }))
    await game.trust()
    expect(readAttempt).toHaveBeenCalledWith('att-1', expect.any(AbortSignal))
    expect(game.current.value.roundId).toBe('r4')
    expect(game.error.value).toBe('')
  })

  it('completes an expired run when it is resumed', async () => {
    const expired = snap({ deadlineAt: new Date(START.getTime() - 1000).toISOString() })
    readAttempt.mockResolvedValueOnce(expired)
    writeAttempt.mockResolvedValueOnce({ ...expired, revision: 1, status: 'completed' })
    const { game } = harness()
    await game.resume('att-1')
    await flushPromises()
    expect(game.secondsLeft.value).toBe(0)
    expect(writeAttempt.mock.calls[0][0]).toBe('/attempts/att-1/complete')
    expect(game.completed.value).toBe(true)
  })

  it('clears the timer on unmount', async () => {
    const { wrapper } = await started(snap())
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
