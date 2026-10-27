import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useCliDefender } from '../composables/useCliDefender.js'
import {
  completeRun,
  fetchRun,
  pauseRun,
  requestHint,
  resumeRun,
  startRun,
  submitCommand,
} from '../cliDefender.js'

vi.mock('../cliDefender.js', async (original) => ({
  ...(await original()),
  startRun: vi.fn(),
  fetchRun: vi.fn(),
  submitCommand: vi.fn(),
  completeRun: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  requestHint: vi.fn(),
}))

const RUN = '11111111-1111-4111-8111-111111111111'
const alert = (title) => ({ title, severity: 'high', source: 'Firewall log', lines: ['detail'] })

function snapshot(overrides = {}) {
  return {
    gameId: 'cli-cyber-defender',
    runId: RUN,
    mode: 'timed',
    status: 'active',
    serverNow: 50_000,
    incidentCount: 8,
    resolvedCount: 0,
    current: {
      incidentId: 'incident-01',
      index: 0,
      opensAt: 50_000,
      closesAt: 57_000,
      windowSeconds: 7,
      alert: alert('First alert'),
    },
    history: [],
    score: 0,
    streak: 0,
    multiplier: 1,
    maxScore: 2100,
    saved: false,
    ...overrides,
  }
}

function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

const mounted = []

function harness(clock, onEvent) {
  let game
  const wrapper = mount({
    setup() {
      game = useCliDefender({ now: () => clock.now, onEvent })
      return () => null
    },
  })
  mounted.push(wrapper)
  return { game, wrapper }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('cli defender composable', () => {
  it('starts a run, prints the first alert and corrects for clock skew', async () => {
    // the browser clock is 20 seconds behind the server
    const clock = { now: 30_000 }
    startRun.mockResolvedValue(snapshot())
    const { game } = harness(clock)
    await game.start('timed', { kind: 'cohort', cohortId: 'c1' })
    expect(startRun).toHaveBeenCalledWith(
      'timed',
      { kind: 'cohort', cohortId: 'c1' },
      expect.any(AbortSignal),
    )
    expect(game.phase.value).toBe('running')
    expect(game.lines.value.some((line) => line.text === 'First alert')).toBe(true)
    expect(game.remainingMs.value).toBe(7000)
    clock.now += 2000
    vi.advanceTimersByTime(100)
    expect(game.remainingMs.value).toBe(5000)
  })

  it('reuses the chosen context when a game is replayed and retries a failed save', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot({ mode: 'practice' }))
    completeRun.mockResolvedValueOnce({
      score: 0,
      maxScore: 2100,
      mode: 'practice',
      debrief: [],
      saved: false,
      saveError: { code: 'COHORT_NOT_FOUND', message: 'Class unavailable.' },
    })
    const { game } = harness(clock)
    await game.start('practice', { kind: 'personal' })
    game.endPractice()
    await flushPromises()
    expect(game.result.value.saved).toBe(false)
    completeRun.mockResolvedValueOnce({ score: 0, maxScore: 2100, debrief: [], saved: true })
    await game.retrySave()
    expect(completeRun).toHaveBeenCalledTimes(2)
    expect(game.result.value.saved).toBe(true)
    await game.start('practice')
    expect(startRun).toHaveBeenLastCalledWith(
      'practice',
      { kind: 'personal' },
      expect.any(AbortSignal),
    )
    const cohort = { kind: 'cohort', cohortId: 'c1' }
    game.finish()
    await game.start('timed', cohort)
    expect(startRun).toHaveBeenLastCalledWith('timed', cohort, expect.any(AbortSignal))
    expect(game.runContext.value).toEqual(cohort)
    await game.start('practice')
    expect(startRun).toHaveBeenLastCalledWith('practice', cohort, expect.any(AbortSignal))
  })

  it('keeps help, history and clear local', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    const { game } = harness(clock)
    await game.start('timed')
    await game.submit('help')
    await game.submit('history')
    expect(submitCommand).not.toHaveBeenCalled()
    expect(game.lines.value.some((line) => line.text.includes('block ip <target>'))).toBe(true)
    await game.submit('clear')
    expect(game.lines.value).toEqual([])
  })

  it('submits the command for the open incident and reports the outcome', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    submitCommand.mockResolvedValue(
      snapshot({
        outcome: 'correct',
        command: 'block ip 203.0.113.45',
        message: 'Containment confirmed.',
        pointsAwarded: 100,
        score: 100,
        streak: 1,
        multiplier: 2,
        resolvedCount: 1,
        history: [{ incidentId: 'incident-01', index: 0, outcome: 'correct', pointsAwarded: 100 }],
        current: {
          ...snapshot().current,
          incidentId: 'incident-02',
          index: 1,
          alert: alert('Next'),
        },
      }),
    )
    const { game } = harness(clock)
    await game.start('timed')
    game.draft.value = '  BLOCK ip 203.0.113.45 '
    await game.submit()
    expect(submitCommand).toHaveBeenCalledWith(
      RUN,
      expect.objectContaining({ incidentId: 'incident-01', command: 'BLOCK ip 203.0.113.45' }),
      expect.any(AbortSignal),
    )
    expect(game.draft.value).toBe('')
    expect(game.snapshot.value.score).toBe(100)
    const texts = game.lines.value.map((line) => line.text)
    expect(texts.some((text) => text.startsWith('[ OK ] block ip 203.0.113.45'))).toBe(true)
    expect(texts).toContain('Next')
    expect(game.commandHistory.value).toEqual(['BLOCK ip 203.0.113.45'])
  })

  it('resyncs at the deadline and announces the missed incident', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    fetchRun.mockResolvedValue(
      snapshot({
        serverNow: 57_000,
        history: [{ incidentId: 'incident-01', index: 0, outcome: 'missed', pointsAwarded: 0 }],
        current: { ...snapshot().current, incidentId: 'incident-02', index: 1, alert: alert('B') },
      }),
    )
    const { game } = harness(clock)
    await game.start('timed')
    clock.now = 57_000
    vi.advanceTimersByTime(100)
    await flushPromises()
    expect(fetchRun).toHaveBeenCalledTimes(1)
    expect(game.lines.value.some((line) => line.text.startsWith('[MISS] Challenge 1'))).toBe(true)
    expect(game.current.value.incidentId).toBe('incident-02')
  })

  it('finishes automatically when no incident remains', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    fetchRun.mockResolvedValue(snapshot({ current: null, status: 'finished' }))
    completeRun.mockResolvedValue({ score: 0, maxScore: 2100, mode: 'timed', debrief: [] })
    const { game } = harness(clock)
    await game.start('timed')
    await game.sync()
    await flushPromises()
    expect(completeRun).toHaveBeenCalledTimes(1)
    expect(game.phase.value).toBe('debrief')
    game.replay()
    expect(game.phase.value).toBe('briefing')
    expect(game.lines.value).toEqual([])
  })

  it('reports a late command and resyncs', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    submitCommand.mockRejectedValue({
      response: { data: { error: { code: 'CLI_INCIDENT_CLOSED', message: 'closed' } } },
    })
    fetchRun.mockResolvedValue(snapshot())
    const { game } = harness(clock)
    await game.start('timed')
    await game.submit('block ip 192.0.2.1')
    expect(game.lines.value.some((line) => line.text.startsWith('[LATE]'))).toBe(true)
    expect(fetchRun).toHaveBeenCalled()
    expect(game.pending.value).toBe(false)
  })

  it('shows a start failure on the briefing', async () => {
    startRun.mockRejectedValue({
      response: { data: { error: { message: 'Too many requests. Wait a moment.' } } },
    })
    const { game } = harness({ now: 0 })
    await game.start('practice')
    expect(game.phase.value).toBe('briefing')
    expect(game.error.value).toBe('Too many requests. Wait a moment.')
  })

  it('auto-pauses a timed shift when the tab is hidden and resumes on request', async () => {
    const clock = { now: 50_000 }
    startRun.mockResolvedValue(snapshot())
    pauseRun.mockResolvedValue(
      snapshot({
        serverNow: 52_000,
        paused: true,
        current: { ...snapshot().current, alert: null },
      }),
    )
    resumeRun.mockResolvedValue(snapshot({ serverNow: 52_000, paused: false }))
    const { game } = harness(clock)
    await game.start('timed')
    clock.now = 52_000
    vi.advanceTimersByTime(100)
    setHidden(true)
    await flushPromises()
    expect(pauseRun).toHaveBeenCalledWith(RUN, expect.any(AbortSignal))
    expect(game.paused.value).toBe(true)
    expect(game.remainingMs.value).toBe(5000)
    // no resync or countdown while paused, however long the player is away
    clock.now = 500_000
    vi.advanceTimersByTime(1000)
    expect(fetchRun).not.toHaveBeenCalled()
    expect(game.remainingMs.value).toBe(5000)
    await game.submit('block ip 192.0.2.1')
    expect(submitCommand).not.toHaveBeenCalled()
    setHidden(false)
    await flushPromises()
    expect(game.paused.value).toBe(true)
    await game.resume()
    expect(resumeRun).toHaveBeenCalledTimes(1)
    expect(game.paused.value).toBe(false)
    expect(game.remainingMs.value).toBe(5000)
    expect(game.lines.value.filter((line) => line.text === 'First alert')).toHaveLength(1)
  })

  it('never pauses practice', async () => {
    startRun.mockResolvedValue(snapshot({ mode: 'practice' }))
    const { game } = harness({ now: 50_000 })
    await game.start('practice')
    setHidden(true)
    await flushPromises()
    expect(pauseRun).not.toHaveBeenCalled()
    expect(game.paused.value).toBe(false)
  })

  it('explains a closed incident and reports events for sound and effects', async () => {
    const events = []
    startRun.mockResolvedValue(snapshot())
    submitCommand.mockResolvedValue(
      snapshot({
        outcome: 'wrong',
        command: 'isolate host lab-gw',
        message: 'That action did not contain the incident. Incident closed.',
        pointsAwarded: 0,
        resolvedCount: 1,
        history: [{ incidentId: 'incident-01', index: 0, outcome: 'wrong', pointsAwarded: 0 }],
        review: {
          expectedCommand: 'block ip 203.0.113.45',
          explanation: 'Block the single outside source.',
          concepts: { attack: 'Brute force', cia: ['Confidentiality'], stage: 'Containment' },
        },
        current: { ...snapshot().current, incidentId: 'incident-02', index: 1, alert: alert('B') },
      }),
    )
    const { game } = harness({ now: 50_000 }, (kind) => events.push(kind))
    await game.start('timed')
    await game.submit('isolate host lab-gw')
    const texts = game.lines.value.map((line) => line.text)
    expect(texts).toContain('  correct: block ip 203.0.113.45')
    expect(texts).toContain('  why: Block the single outside source.')
    expect(texts).toContain('  [Brute force | Confidentiality | Containment]')
    expect(game.lastReview.value).toMatchObject({
      outcome: 'wrong',
      expectedCommand: 'block ip 203.0.113.45',
    })
    expect(events).toEqual(['alert', 'fail', 'alert'])
  })

  it('requests a hint only in practice and only once per incident', async () => {
    startRun.mockResolvedValue(snapshot({ mode: 'practice' }))
    requestHint.mockResolvedValue(
      snapshot({ mode: 'practice', current: { ...snapshot().current, hintLine: 0 } }),
    )
    const { game } = harness({ now: 50_000 })
    await game.start('practice')
    await game.hint()
    expect(requestHint).toHaveBeenCalledWith(RUN, 'incident-01', expect.any(AbortSignal))
    expect(game.current.value.hintLine).toBe(0)
    await game.hint()
    expect(requestHint).toHaveBeenCalledTimes(1)
    startRun.mockResolvedValue(snapshot())
    const timed = harness({ now: 50_000 })
    await timed.game.start('timed')
    await timed.game.hint()
    expect(requestHint).toHaveBeenCalledTimes(1)
  })

  it('stops its timer and listener on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    startRun.mockResolvedValue(snapshot())
    const { game, wrapper } = harness({ now: 50_000 })
    await game.start('timed')
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
})
