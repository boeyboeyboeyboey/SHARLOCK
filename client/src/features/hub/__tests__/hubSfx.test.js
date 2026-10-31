import { describe, expect, it, vi } from 'vitest'
import {
  HISS_GAP,
  HISS_RANGE,
  STRIDE,
  createHubSfx,
  createSfxClock,
  hissLevel,
  nearestLamp,
  stepInterval,
} from '../audio/hubSfx.js'

describe('step interval', () => {
  it('follows speed and is never due when idle', () => {
    expect(stepInterval(7.2)).toBeCloseTo(STRIDE / 7.2)
    expect(stepInterval(11.5)).toBeLessThan(stepInterval(7.2))
    expect(stepInterval(0)).toBe(Infinity)
  })
})

describe('sfx clock', () => {
  const walk = { speed: 7.2, grounded: true, silent: false }
  it('fires footfalls at the stride pace', () => {
    const clock = createSfxClock()
    let count = 0
    for (let i = 0; i < 60; i += 1) count += clock.step(1 / 60, walk)
    expect(count).toBe(Math.floor(1 / stepInterval(7.2)))
  })
  it('sprints faster than walks', () => {
    const run = (speed) => {
      const clock = createSfxClock()
      let n = 0
      for (let i = 0; i < 120; i += 1) n += clock.step(1 / 60, { ...walk, speed })
      return n
    }
    expect(run(11.5)).toBeGreaterThan(run(7.2))
  })
  it('is silent while idle, airborne or silenced', () => {
    for (const state of [
      { ...walk, speed: 0 },
      { ...walk, grounded: false },
      { ...walk, silent: true },
    ]) {
      const clock = createSfxClock()
      let n = 0
      for (let i = 0; i < 120; i += 1) n += clock.step(1 / 60, state)
      expect(n).toBe(0)
    }
  })
  it('hisses only near a lamp and then waits', () => {
    const clock = createSfxClock({ random: () => 0 })
    expect(clock.hiss(HISS_GAP[0] + 0.1, { distance: 2, silent: false })).toBeGreaterThan(0)
    expect(clock.hiss(1, { distance: 2, silent: false })).toBe(0)
    const far = createSfxClock({ random: () => 0 })
    expect(far.hiss(HISS_GAP[0] + 0.1, { distance: HISS_RANGE + 1, silent: false })).toBe(0)
    const quiet = createSfxClock({ random: () => 0 })
    expect(quiet.hiss(HISS_GAP[0] + 0.1, { distance: 1, silent: true })).toBe(0)
  })
  it('lamp helpers', () => {
    expect(
      nearestLamp(
        [
          [0, 0],
          [10, 0],
        ],
        9,
        0,
      ),
    ).toBe(1)
    expect(hissLevel(0)).toBe(1)
    expect(hissLevel(HISS_RANGE)).toBe(0)
  })
})

function fakeContext() {
  const node = () => ({
    connect: (n) => n,
    gain: {
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
    frequency: {},
    Q: {},
    start: vi.fn(),
    stop() {},
  })
  return {
    state: 'running',
    sampleRate: 8000,
    currentTime: 0,
    destination: {},
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    createGain: node,
    createBiquadFilter: node,
    createBufferSource: vi.fn(node),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  }
}

describe('hub sfx', () => {
  const frame = { x: 0, z: 0, speed: 7.2, grounded: true, paused: false }
  it('makes one context after a gesture, plays steps and closes on dispose', () => {
    const ctx = fakeContext()
    const create = vi.fn(() => ctx)
    const target = document.createElement('div')
    const sfx = createHubSfx({ spots: [], createContext: create, isMuted: () => false, target })
    sfx.update(0.5, frame)
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('pointerdown'))
    target.dispatchEvent(new Event('keydown'))
    expect(create).toHaveBeenCalledTimes(1)
    sfx.update(0.5, frame)
    expect(ctx.createBufferSource).toHaveBeenCalled()
    sfx.dispose()
    expect(ctx.close).toHaveBeenCalled()
    target.dispatchEvent(new Event('pointerdown'))
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('stays silent while muted or paused', () => {
    const ctx = fakeContext()
    let muted = true
    const target = document.createElement('div')
    const sfx = createHubSfx({ spots: [], createContext: () => ctx, isMuted: () => muted, target })
    target.dispatchEvent(new Event('pointerdown'))
    sfx.update(0.5, frame)
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
    muted = false
    sfx.update(0.5, { ...frame, paused: true })
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
    sfx.dispose()
  })
})
