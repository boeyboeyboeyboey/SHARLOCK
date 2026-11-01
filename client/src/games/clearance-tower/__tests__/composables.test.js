import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { useClearanceTower } from '../composables/useClearanceTower.js'
import { STEP_MS, useDayPlayback } from '../composables/useDayPlayback.js'
import { readAttempt, writeAttempt } from '../../../features/attempts/api.js'
import {
  LEVELS,
  publicLevel,
} from '../../../../../server/src/modules/games/clearance-tower/levels.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: (error) => ({
    message: error?.message || 'Could not reach saved play.',
    status: error?.status || 0,
  }),
}))

// composables that register lifecycle hooks must run inside a component
function withSetup(composable) {
  let exposed
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = composable()
        return () => h('div')
      },
    }),
  )
  return { exposed, wrapper }
}

function climb(overrides = {}) {
  const levels = LEVELS.map((level) => ({ ...publicLevel(level), submitted: false }))
  return {
    gameId: 'clearance-tower',
    attemptId: 'climb-1',
    revision: 0,
    status: 'active',
    score: 0,
    maxScore: 600,
    publicState: { totalLevels: 6, submittedCount: 0, readyToComplete: false, levels },
    ...overrides,
  }
}

function withSubmitted(snapshot, levelId, result) {
  const levels = snapshot.publicState.levels.map((level) =>
    level.id === levelId ? { ...level, submitted: true, result } : level,
  )
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    publicState: { ...snapshot.publicState, submittedCount: 1, readyToComplete: true, levels },
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useClearanceTower', () => {
  beforeEach(() => {
    readAttempt.mockResolvedValue(climb())
  })

  it('opens a level from the attempt and submits it as a level action', async () => {
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    expect(game.levels.value).toHaveLength(6)
    game.openLevel('the-matrix')
    expect(game.phase.value).toBe('brief')
    expect(game.policy.value).toEqual({ grants: [] })
    expect(game.nextLevelId.value).toBe('the-gift')
    expect(game.allPredicted.value).toBe(false)

    game.predictions.value = { p1: 'deny', p2: 'deny', p3: 'allow' }
    expect(game.allPredicted.value).toBe(true)
    const result = { score: 85, stars: 2, events: [], policy: { grants: [] } }
    writeAttempt.mockResolvedValue(withSubmitted(climb(), 'the-matrix', result))
    expect(await game.runDay()).toBe(true)
    expect(writeAttempt).toHaveBeenCalledWith(
      '/attempts/climb-1/actions',
      expect.objectContaining({
        expectedRevision: 0,
        type: 'submit-level',
        payload: {
          levelId: 'the-matrix',
          policy: { grants: [] },
          predictions: [
            { id: 'p1', verdict: 'deny' },
            { id: 'p2', verdict: 'deny' },
            { id: 'p3', verdict: 'allow' },
          ],
        },
      }),
      expect.any(AbortSignal),
    )
    expect(game.phase.value).toBe('day')
    expect(game.result.value.score).toBe(85)
    expect(game.state.value.readyToComplete).toBe(true)
  })

  it('asks for a hint on the open level without touching the policy', async () => {
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    game.openLevel('the-matrix')
    writeAttempt.mockResolvedValue(climb({ revision: 1 }))
    expect(await game.takeHint()).toBe(true)
    expect(writeAttempt).toHaveBeenCalledWith(
      '/attempts/climb-1/actions',
      expect.objectContaining({
        type: 'request-hint',
        payload: { levelId: 'the-matrix' },
      }),
      expect.any(AbortSignal),
    )
    expect(game.phase.value).toBe('brief')
    expect(game.policy.value).toEqual({ grants: [] })
  })

  it('keeps the policy when a submit fails, then retries the identical request', async () => {
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    game.openLevel('the-matrix')
    game.showPhase('predict')
    game.policy.value = { grants: [{ subject: 'director', object: 'ops', rights: ['r'] }] }
    game.predictions.value = { p1: 'deny', p2: 'deny', p3: 'allow' }
    writeAttempt.mockRejectedValueOnce(new Error('Network lost'))
    await game.runDay()
    expect(game.error.value).toBe('Network lost')
    expect(game.retryable.value).toBe(true)
    expect(game.phase.value).toBe('predict')
    expect(game.policy.value.grants).toHaveLength(1)

    const result = { score: 60, stars: 1, events: [], policy: game.policy.value }
    writeAttempt.mockResolvedValueOnce(withSubmitted(climb(), 'the-matrix', result))
    await game.retry()
    const [first, second] = writeAttempt.mock.calls.map((call) => call[1].actionId)
    expect(second).toBe(first)
    expect(game.error.value).toBe('')
    expect(game.phase.value).toBe('day')
  })

  it('stays on the case when a retried hint succeeds, keeping its draft', async () => {
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    game.openLevel('the-matrix')
    game.showPhase('predict')
    writeAttempt.mockRejectedValueOnce(new Error('Network lost'))
    await game.takeHint()
    expect(game.retryable.value).toBe(true)
    writeAttempt.mockResolvedValueOnce(climb({ revision: 1 }))
    await game.retry()
    expect(game.phase.value).toBe('predict')
    expect(game.result.value).toBeNull()
  })

  it('reopens a submitted level as its stored day with the stored policy', async () => {
    const stored = { grants: [{ subject: 'director', object: 'ops', rights: ['r'] }] }
    readAttempt.mockResolvedValue(
      withSubmitted(climb(), 'the-matrix', { score: 70, stars: 1, events: [], policy: stored }),
    )
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    game.openLevel('the-matrix')
    expect(game.phase.value).toBe('day')
    expect(game.policy.value).toEqual(stored)
    game.reset()
    expect(game.snapshot.value).toBeNull()
    expect(game.phase.value).toBe('levels')
  })

  it('cancels a pending request when the game unmounts', async () => {
    let signal
    readAttempt.mockImplementation((_id, received) => {
      signal = received
      return new Promise(() => {})
    })
    const { exposed: game, wrapper } = withSetup(useClearanceTower)
    game.load('climb-1')
    await flushPromises()
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
  })
})

describe('useClearanceTower drafts and reload', () => {
  const edited = { grants: [{ subject: 'director', object: 'ops', rights: ['r'] }] }

  beforeEach(() => {
    sessionStorage.clear()
    readAttempt.mockResolvedValue(climb())
  })

  async function freshGame() {
    const { exposed: game } = withSetup(useClearanceTower)
    await game.load('climb-1')
    return game
  }

  it('restores an unsubmitted policy and calls after a reload', async () => {
    const before = await freshGame()
    before.openLevel('the-matrix')
    expect(before.draftRestored.value).toBe(false)
    before.policy.value = edited
    before.predictions.value = { p1: 'deny' }
    await flushPromises()

    const after = await freshGame()
    after.openLevel('the-matrix')
    expect(after.policy.value).toEqual(edited)
    expect(after.predictions.value).toEqual({ p1: 'deny' })
    expect(after.draftRestored.value).toBe(true)
    after.openLevel('the-gift')
    expect(after.draftRestored.value).toBe(false)
    expect(after.policy.value).toEqual(after.level.value.startPolicy)
  })

  it('stores nothing for a case left untouched', async () => {
    const before = await freshGame()
    before.openLevel('the-matrix')
    await flushPromises()
    expect(sessionStorage.length).toBe(0)
  })

  it('forgets the draft once the case has run, and every draft once the climb is saved', async () => {
    const game = await freshGame()
    game.openLevel('the-matrix')
    game.policy.value = edited
    game.predictions.value = { p1: 'deny', p2: 'deny', p3: 'allow' }
    await flushPromises()
    const result = { score: 85, stars: 2, events: [], policy: edited }
    const ran = withSubmitted(climb(), 'the-matrix', result)
    writeAttempt.mockResolvedValueOnce(ran)
    await game.runDay()
    expect(sessionStorage.length).toBe(0)

    game.openLevel('the-gift')
    game.predictions.value = { p1: 'allow' }
    await flushPromises()
    expect(sessionStorage.length).toBe(1)
    writeAttempt.mockResolvedValueOnce({ ...ran, status: 'completed' })
    await game.complete()
    await flushPromises()
    expect(sessionStorage.length).toBe(0)
  })

  it('ignores a draft that does not fit the case', async () => {
    sessionStorage.setItem(
      'sharlock.clearance.draft.climb-1',
      JSON.stringify({
        'the-matrix': { policy: { roles: [] }, predictions: {} },
        compartments: { policy: { objectLabels: {} }, predictions: {} },
        'the-gift': 'nonsense',
      }),
    )
    const game = await freshGame()
    for (const id of ['the-matrix', 'compartments', 'the-gift']) {
      game.openLevel(id)
      expect(game.policy.value).toEqual(game.level.value.startPolicy)
      expect(game.draftRestored.value).toBe(false)
    }
    sessionStorage.setItem('sharlock.clearance.draft.climb-1', '{not json')
    game.openLevel('the-matrix')
    expect(game.draftRestored.value).toBe(false)
  })

  it('reloads after a stale revision and leaves a case that already ran elsewhere', async () => {
    const game = await freshGame()
    game.openLevel('the-matrix')
    game.showPhase('predict')
    const stale = Object.assign(new Error('This case changed in another tab.'), { status: 409 })
    writeAttempt.mockRejectedValueOnce(stale)
    await game.takeHint()
    expect(game.error.value).toBe('This case changed in another tab.')
    expect(game.retryable.value).toBe(false)

    const ran = { score: 70, stars: 1, events: [], policy: edited }
    readAttempt.mockResolvedValue(withSubmitted(climb(), 'the-matrix', ran))
    expect(await game.reload()).toBe(true)
    expect(readAttempt).toHaveBeenLastCalledWith('climb-1', expect.any(AbortSignal))
    expect(game.error.value).toBe('')
    expect(game.phase.value).toBe('levels')
  })

  it('stays on the open case when a reload finds it still unsubmitted', async () => {
    const game = await freshGame()
    game.openLevel('the-matrix')
    game.showPhase('design')
    game.policy.value = edited
    expect(await game.reload()).toBe(true)
    expect(game.phase.value).toBe('design')
    expect(game.policy.value).toEqual(edited)
  })
})

describe('useDayPlayback', () => {
  const events = ref([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }])

  it('steps through the day on a timer and stops at the end', async () => {
    vi.useFakeTimers()
    const { exposed: day } = withSetup(() => useDayPlayback(events))
    day.play()
    expect(day.shown.value.map((event) => event.id)).toEqual(['e1'])
    vi.advanceTimersByTime(STEP_MS)
    expect(day.current.value.id).toBe('e2')
    day.setSpeed(2)
    vi.advanceTimersByTime(STEP_MS / 2)
    expect(day.finished.value).toBe(true)
    expect(day.playing.value).toBe(false)
  })

  it('steps by hand, skips to the end and clears its timer on unmount', () => {
    vi.useFakeTimers()
    const { exposed: day, wrapper } = withSetup(() => useDayPlayback(events))
    day.step()
    expect(day.index.value).toBe(0)
    day.skip()
    expect(day.shown.value).toHaveLength(3)
    day.reset()
    day.play()
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
