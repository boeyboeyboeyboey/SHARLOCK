import { describe, expect, it } from 'vitest'
import { randomInt } from 'node:crypto'
import { MAX_SCORE, SHIFT_SECONDS } from '../../../src/modules/games/cli-cyber-defender/policy.js'
import {
  deriveProgress,
  generateWindows,
  pointsFor,
} from '../../../src/modules/games/cli-cyber-defender/schedule.js'

function run({
  mode = 'timed',
  windows = [5, 5, 5, 5, 10, 10, 10, 10],
  resolutions = [],
  events = [],
} = {}) {
  return {
    mode,
    startedAt: 0,
    endedAt: null,
    incidents: windows.map((windowSeconds, index) => ({
      id: `incident-0${index + 1}`,
      windowSeconds,
      resolution: resolutions[index] ?? null,
      events: events[index] ?? [],
    })),
  }
}

describe('incident windows', () => {
  it('always produces eight integer windows of 20-30 seconds totalling 200', () => {
    expect(SHIFT_SECONDS).toBe(200)
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const windows = generateWindows(randomInt)
      expect(windows).toHaveLength(8)
      expect(
        windows.every((seconds) => Number.isInteger(seconds) && seconds >= 20 && seconds <= 30),
      ).toBe(true)
      expect(windows.reduce((total, seconds) => total + seconds, 0)).toBe(200)
    }
  })

  it('reaches both extremes with a biased source', () => {
    expect(generateWindows(() => 0)).toEqual([30, 30, 30, 30, 20, 20, 20, 20])
  })
})

describe('progress derivation', () => {
  it('scores 100, 200, then 300 per correct command for a maximum of 2,700', () => {
    expect([1, 2, 3, 4].map(pointsFor)).toEqual([100, 200, 300, 300])
    // two of the eight incidents take two steps, so ten scoring steps in all
    const steps = [1, 1, 1, 1, 1, 1, 2, 2]
    const resolutions = steps.map((_, index) => ({ at: (index + 1) * 1000, outcome: 'correct' }))
    const events = steps.map((count, index) =>
      Array.from({ length: count }, () => ({ at: (index + 1) * 1000, kind: 'ok' })),
    )
    const progress = deriveProgress(run({ resolutions, events }), 9000)
    expect(progress.score).toBe(2700)
    expect(progress.score).toBe(MAX_SCORE)
    expect(progress.finished).toBe(true)
    expect(progress.bestStreak).toBe(10)
  })

  it('resets the streak after a wrong command', () => {
    const progress = deriveProgress(
      run({
        resolutions: [
          { at: 1000, outcome: 'correct' },
          { at: 2000, outcome: 'correct' },
          { at: 3000, outcome: 'wrong', closedByMistake: true },
          { at: 4000, outcome: 'correct' },
        ],
        events: [
          [{ at: 1000, kind: 'ok' }],
          [{ at: 2000, kind: 'ok' }],
          [{ at: 3000, kind: 'bad' }],
          [{ at: 4000, kind: 'ok' }],
        ],
      }),
      4500,
    )
    expect(progress.incidents.slice(0, 4).map((item) => item.pointsAwarded)).toEqual([
      100, 200, 0, 100,
    ])
    expect(progress.streak).toBe(1)
    expect(progress.multiplier).toBe(2)
    expect(progress.current.index).toBe(4)
    expect(progress.current.opensAt).toBe(4000)
    // incident 3 closed by a mistake, so incident 4 gave up 5 seconds; incident 5 opens clean
    expect(progress.current.closesAt).toBe(14000)
  })

  it('opens the next incident as soon as the previous one resolves', () => {
    const progress = deriveProgress(run({ resolutions: [{ at: 1200, outcome: 'correct' }] }), 1300)
    expect(progress.current).toMatchObject({ index: 1, opensAt: 1200, closesAt: 6200 })
  })

  it('treats the exact deadline as missed and advances by the window', () => {
    const atDeadline = deriveProgress(run(), 5000)
    expect(atDeadline.incidents[0].outcome).toBe('missed')
    expect(atDeadline.current).toMatchObject({ index: 1, opensAt: 5000, closesAt: 10000 })
    const justBefore = deriveProgress(run(), 4999)
    expect(justBefore.current.index).toBe(0)
  })

  it('misses every remaining incident once the whole shift has elapsed', () => {
    const progress = deriveProgress(run(), 100000)
    expect(progress.finished).toBe(true)
    expect(progress.incidents.every((item) => item.outcome === 'missed')).toBe(true)
    expect(progress.score).toBe(0)
  })

  it('never expires practice incidents', () => {
    const progress = deriveProgress(run({ mode: 'practice' }), 10 * 60 * 1000)
    expect(progress.current).toMatchObject({ index: 0, closesAt: null })
  })

  it('marks unresolved practice incidents as skipped after an early end', () => {
    const practice = run({
      mode: 'practice',
      resolutions: [{ at: 1000, outcome: 'correct' }],
      events: [[{ at: 1000, kind: 'ok' }]],
    })
    practice.endedAt = 2000
    const progress = deriveProgress(practice, 2000)
    expect(progress.finished).toBe(true)
    expect(progress.incidents.slice(1).every((item) => item.outcome === 'skipped')).toBe(true)
    expect(progress.score).toBe(100)
  })

  it('takes 5 seconds from the next window when a mistake closes an incident (timed only)', () => {
    const closed = run({
      windows: [20, 20, 20, 20, 20, 20, 20, 20],
      resolutions: [{ at: 3000, outcome: 'wrong', closedByMistake: true }],
      events: [[{ at: 3000, kind: 'bad' }]],
    })
    const next = deriveProgress(closed, 3500).current
    expect(next).toMatchObject({
      index: 1,
      opensAt: 3000,
      closesAt: 3000 + 15000,
      penaltySeconds: 5,
    })
    // the penalty is a single carry, not cumulative: incident 3 opens with its full window
    closed.incidents[1].resolution = { at: 9000, outcome: 'correct' }
    closed.incidents[1].events = [{ at: 9000, kind: 'ok' }]
    expect(deriveProgress(closed, 9500).current).toMatchObject({
      opensAt: 9000,
      closesAt: 29000,
      penaltySeconds: 0,
    })
    const practice = run({ ...closed, mode: 'practice', windows: closed.incidents.map(() => 20) })
    practice.incidents[0] = closed.incidents[0]
    expect(deriveProgress({ ...practice, mode: 'practice' }, 3500).current.closesAt).toBeNull()
  })

  it('cuts the open window for a mistake that leaves the incident open', () => {
    const open = run({
      windows: [20, 20, 20, 20, 20, 20, 20, 20],
      events: [
        [
          { at: 4000, kind: 'bad' },
          { at: 6000, kind: 'ok' },
        ],
      ],
    })
    const progress = deriveProgress(open, 7000)
    expect(progress.current).toMatchObject({
      index: 0,
      stepsDone: 1,
      mistakes: 1,
      penaltySeconds: 5,
      closesAt: 15000,
    })
    expect(progress.score).toBe(100)
    expect(progress.streak).toBe(1)
    // the window closes at the reduced deadline with the partial step kept
    const late = deriveProgress(open, 15000)
    expect(late.incidents[0]).toMatchObject({ outcome: 'missed', pointsAwarded: 100 })
    expect(late.streak).toBe(0)
    // a window never drops below 5 seconds, and never ends before the mistake itself
    const floor = run({
      windows: [20, 20, 20, 20, 20, 20, 20, 20],
      events: [Array.from({ length: 5 }, (_, index) => ({ at: 1000 + index, kind: 'bad' }))],
    })
    expect(deriveProgress(floor, 2000).current.closesAt).toBe(5000)
  })

  it('does not change the run it reads', () => {
    const timed = run()
    const before = JSON.stringify(timed)
    deriveProgress(timed, 100000)
    expect(JSON.stringify(timed)).toBe(before)
  })
})
