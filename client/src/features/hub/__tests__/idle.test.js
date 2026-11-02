import { describe, expect, it } from 'vitest'
import {
  createIdle,
  lookYawTo,
  MAX_STEP,
  SIT_AFTER,
  wiggleSignal,
  yawnEnv,
} from '../scenes/shared/idle.js'

const run = (idle, seconds, input = {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) idle.step(dt, input)
  return idle.pose
}

describe('sharlock idle machine', () => {
  it('stays standing until the idle delay passes, then sits', () => {
    const idle = createIdle({ seed: 3 })
    expect(run(idle, SIT_AFTER - 0.5).sit).toBe(0)
    expect(run(idle, 1.5).sit).toBe(1)
  })

  it('stands up within a quarter second of input', () => {
    const idle = createIdle({ seed: 3 })
    run(idle, SIT_AFTER + 2)
    expect(idle.pose.sit).toBe(1)
    expect(run(idle, 0.25, { active: true }).sit).toBe(0)
    expect(idle.pose.idleTime).toBe(0)
  })

  it('is repeatable for a seed and ignores huge frame times', () => {
    const a = createIdle({ seed: 9 })
    const b = createIdle({ seed: 9 })
    for (let i = 0; i < 40; i += 1) expect({ ...a.step(0.5) }).toEqual({ ...b.step(0.5) })
    const c = createIdle({ seed: 9 })
    c.step(120)
    expect(c.pose.idleTime).toBe(MAX_STEP)
  })

  it('looks toward a door with a clamped yaw and a tilt, only once settled', () => {
    const idle = createIdle()
    expect(idle.step(0.1, { look: 2 }).look).toBeNull()
    const p = run(idle, 1, { look: 1.9 })
    expect(p.look).toBeCloseTo(0.6)
    expect(p.tilt).toBeCloseTo(-0.18)
    expect(run(idle, 0.1, { look: 3 }).look).toBeNull()
  })

  it('halves sit and tilt amplitudes under reduced motion', () => {
    const idle = createIdle()
    const p = run(idle, SIT_AFTER + 2, { calm: true, look: 0.5 })
    expect(p.sit).toBeCloseTo(0.5)
    expect(p.tilt).toBeCloseTo(-0.09)
  })

  it('shapes its envelopes', () => {
    expect(yawnEnv(-1)).toBe(0)
    expect(yawnEnv(0.7)).toBe(1)
    expect(yawnEnv(5)).toBe(0)
    expect(wiggleSignal(0.3)).not.toBe(0)
    expect(wiggleSignal(1)).toBe(0)
  })

  it('wraps the yaw to a door', () => {
    expect(lookYawTo(0, 0, 0, 5, 0)).toBeCloseTo(Math.PI / 2)
    expect(lookYawTo(0, 0, Math.PI * 1.5, 0, 5)).toBeCloseTo(Math.PI / 2)
  })
})
