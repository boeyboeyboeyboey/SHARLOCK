import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FPS_THRESHOLD,
  PERF_KEY,
  createSampler,
  decidePerf,
  median,
  perfRecord,
  readPerf,
  writePerf,
} from '../perfWatch.js'
import { applyPerf, evaluateDevice } from '../deviceCheck.js'

afterEach(() => localStorage.clear())

describe('decidePerf', () => {
  it('keeps a tier that runs above its threshold', () => {
    expect(decidePerf({ tier: 'desktop', fps: 58 }).action).toBe('ok')
    expect(decidePerf({ tier: 'desktop', fps: FPS_THRESHOLD.desktop }).action).toBe('ok')
    expect(decidePerf({ tier: 'low', fps: 28 }).action).toBe('ok')
    expect(decidePerf({ tier: 'low', fps: 20 }).action).toBe('ok')
  })

  it('steps down desktop, compact, low and then to 2d', () => {
    expect(decidePerf({ tier: 'desktop', fps: 15 })).toEqual({ action: 'lower', tier: 'compact' })
    expect(decidePerf({ tier: 'compact', fps: 39 })).toEqual({ action: 'lower', tier: 'low' })
    expect(decidePerf({ tier: 'low', fps: 15 })).toEqual({ action: 'switch-2d', tier: 'low' })
  })

  it('never switches to 2d when the user chose 3d explicitly', () => {
    expect(decidePerf({ tier: 'low', fps: 5, explicit3d: true })).toEqual({
      action: 'stay',
      tier: 'low',
    })
    expect(decidePerf({ tier: 'desktop', fps: 5, explicit3d: true }).action).toBe('lower')
  })
})

describe('remembered outcome', () => {
  const now = new Date('2026-10-21T00:00:00Z')

  it('builds a record only for a struggle', () => {
    expect(perfRecord({ action: 'ok', tier: 'desktop' }, now)).toBeNull()
    expect(perfRecord({ action: 'lower', tier: 'compact' }, now)).toEqual({
      tier: 'compact',
      struggled: true,
      at: now.toISOString(),
    })
    expect(perfRecord({ action: 'switch-2d', tier: 'low' }, now)).toMatchObject({
      tier: 'low',
      twoD: true,
    })
  })

  it('round trips, clears and ignores junk', () => {
    writePerf(perfRecord({ action: 'lower', tier: 'compact' }, now))
    expect(readPerf()).toEqual({ tier: 'compact', twoD: false })
    writePerf(null)
    expect(readPerf()).toBeNull()
    localStorage.setItem(PERF_KEY, '{"tier":"ultra","struggled":true}')
    expect(readPerf()).toBeNull()
    localStorage.setItem(PERF_KEY, 'nope')
    expect(readPerf()).toBeNull()
  })

  it('starts the next visit at the remembered tier, or in 2d', () => {
    const base = evaluateDevice({ webgl2: true, baseTier: 'desktop' })
    expect(applyPerf(base, { tier: 'compact', twoD: false }).tier).toBe('compact')
    expect(applyPerf({ ...base, tier: 'low' }, { tier: 'compact', twoD: false }).tier).toBe('low')
    expect(applyPerf(base, { tier: 'low', twoD: true })).toEqual({
      verdict: '2d',
      tier: 'low',
      reasons: ['slow-runtime'],
    })
    expect(applyPerf(base, null)).toBe(base)
    const software = evaluateDevice({ webgl2: true, softwareRenderer: true })
    expect(applyPerf(software, { tier: 'low', twoD: true })).toBe(software)
  })
})

describe('createSampler', () => {
  it('skips warm-up and inactive frames, then reports the median fps once', () => {
    const results = []
    const sampler = createSampler({ onResult: (fps) => results.push(fps) })
    for (let i = 0; i < 60; i += 1) sampler.frame(16.7, true)
    expect(results).toEqual([])
    // hidden or paused frames and long stalls do not count
    for (let i = 0; i < 400; i += 1) sampler.frame(16.7, false)
    sampler.frame(2000, true)
    // 100 ms frames for four seconds is 10 fps
    for (let i = 0; i < 45; i += 1) sampler.frame(100, true)
    expect(results).toHaveLength(1)
    expect(results[0]).toBeCloseTo(10, 0)
    sampler.frame(100, true)
    expect(results).toHaveLength(1)
  })

  it('feed reports directly', () => {
    const onResult = vi.fn()
    createSampler({ onResult }).feed(12)
    expect(onResult).toHaveBeenCalledWith(12)
    expect(median([3, 1, 2])).toBe(2)
  })
})
