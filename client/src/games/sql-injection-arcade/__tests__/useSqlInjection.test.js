import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readAttempt, writeAttempt } from '../../../features/attempts/api.js'
import { useSqlInjection } from '../useSqlInjection.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: (failure) => ({
    message: 'refused',
    status: failure?.response?.status ?? 0,
  }),
}))

const START = Date.parse('2026-10-29T10:00:00Z')

function snapshot({ serverNow = START, deadline = START + 180_000, status = 'active' } = {}) {
  return {
    gameId: 'sql-injection-arcade',
    attemptId: 'att1',
    revision: 1,
    status,
    deadlineAt: new Date(deadline).toISOString(),
    publicState: { mode: 'standard', serverNow, current: { caseId: 'aaa111' }, last: null },
  }
}

const mounted = []

async function loaded(first) {
  let game
  const wrapper = mount({
    setup() {
      game = useSqlInjection()
      return () => null
    },
  })
  mounted.push(wrapper)
  readAttempt.mockResolvedValueOnce(first)
  await game.load('att1')
  await flushPromises()
  return { game, wrapper }
}

const completes = () => writeAttempt.mock.calls.filter(([path]) => path.endsWith('/complete'))
const refused = { response: { status: 409, data: { error: { code: 'ATTEMPT_NOT_FINISHED' } } } }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('useSqlInjection clock', () => {
  it('counts down from the server deadline', async () => {
    const { game } = await loaded(snapshot())
    expect(game.secondsLeft.value).toBe(180)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(game.secondsLeft.value).toBe(120)
  })

  it('corrects for a device clock that runs ahead and does not finish early', async () => {
    vi.setSystemTime(START + 600_000)
    const { game } = await loaded(snapshot())
    expect(game.secondsLeft.value).toBe(180)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(game.secondsLeft.value).toBe(170)
    expect(completes()).toHaveLength(0)
  })

  it('corrects for a device clock that runs behind and still finishes on time', async () => {
    vi.setSystemTime(START - 600_000)
    writeAttempt.mockResolvedValue(snapshot({ status: 'completed' }))
    const { game } = await loaded(snapshot())
    expect(game.secondsLeft.value).toBe(180)
    await vi.advanceTimersByTimeAsync(181_000)
    expect(completes()).toHaveLength(1)
  })

  it('retries a refused automatic finish with backoff and stops once it saves', async () => {
    writeAttempt
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(refused)
      .mockResolvedValue(snapshot({ status: 'completed' }))
    const { game } = await loaded(snapshot())
    await vi.advanceTimersByTimeAsync(181_000)
    expect(completes()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(completes()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(completes()).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(completes()).toHaveLength(3)
    expect(game.finishStalled.value).toBe(false)
  })

  it('gives up after five tries and flags the stall until new state arrives', async () => {
    writeAttempt.mockRejectedValue(refused)
    const { game } = await loaded(snapshot())
    await vi.advanceTimersByTimeAsync(181_000 + 15_000)
    expect(completes()).toHaveLength(5)
    expect(game.finishStalled.value).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(completes()).toHaveLength(5)
    // reloading gives it new state, and so a fresh round of tries
    readAttempt.mockResolvedValueOnce(snapshot({ serverNow: START + 240_000 }))
    await game.load('att1')
    expect(game.finishStalled.value).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(completes()).toHaveLength(6)
  })

  it('keeps its clock correction when a replayed retry answers with an old time', async () => {
    const { game } = await loaded(snapshot())
    const left = game.secondsLeft.value
    await vi.advanceTimersByTimeAsync(60_000)
    // the stored receipt still says the run has only just started
    writeAttempt.mockResolvedValueOnce(snapshot({ serverNow: START }))
    await game.submitInputs(['x'])
    await flushPromises()
    expect(game.secondsLeft.value).toBe(left - 60)
  })

  it('locks the case form at 0:00 so a late action is never sent', async () => {
    writeAttempt.mockResolvedValue(snapshot({ status: 'completed' }))
    const { game } = await loaded(snapshot())
    expect(game.expired.value).toBe(false)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(game.secondsLeft.value).toBe(0)
    expect(game.expired.value).toBe(true)
    const writes = writeAttempt.mock.calls.length
    expect(await game.submitInputs(['x'])).toBe(false)
    expect(writeAttempt.mock.calls).toHaveLength(writes)
  })

  it('stops the clock when the run completes and clears its timer on unmount', async () => {
    const { game, wrapper } = await loaded(snapshot({ status: 'completed' }))
    await vi.advanceTimersByTimeAsync(300)
    expect(game.secondsLeft.value).toBeNull()
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
