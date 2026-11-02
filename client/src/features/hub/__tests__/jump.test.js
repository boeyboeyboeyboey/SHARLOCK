import { describe, expect, it } from 'vitest'
import {
  BUFFER,
  COYOTE,
  CROUCH,
  createJump,
  GRAVITY,
  HOP_LENGTH,
  JUMP_SPEED,
  LIFT_OFF,
  SQUASH,
} from '../scenes/shared/jump.js'

const DT = 1 / 60

// feeds supported flags for a number of frames and returns the last pose
const run = (jump, frames, supported, opts = {}) => {
  for (let i = 0; i < frames; i += 1) jump.step(DT, { supported, ...opts })
  return jump.pose
}

describe('sharlock jump', () => {
  it('reaches an apex of about 0.65 m', () => {
    expect(JUMP_SPEED ** 2 / (2 * GRAVITY)).toBeCloseTo(0.65, 2)
  })

  it('launches from the ground on a press and keeps the ground state otherwise', () => {
    const jump = createJump()
    expect(run(jump, 5, true).grounded).toBe(true)
    jump.request()
    const pose = jump.step(DT, { supported: true })
    expect(pose.launch).toBe(true)
    expect(pose.airborne).toBe(true)
    expect(pose.grounded).toBe(false)
  })

  it('does not treat the support still read just after take-off as a landing', () => {
    const jump = createJump()
    jump.request()
    jump.step(DT, { supported: true })
    const pose = run(jump, Math.floor((LIFT_OFF * 0.8) / DT), true)
    expect(pose.airborne).toBe(true)
    expect(pose.squash).toBe(0)
  })

  it('has no double jump, even with a press buffered mid-air', () => {
    const jump = createJump()
    jump.request()
    jump.step(DT, { supported: true })
    run(jump, 10, false)
    jump.request()
    expect(jump.step(DT, { supported: false }).launch).toBe(false)
    expect(jump.step(DT, { supported: false }).launch).toBe(false)
  })

  it('allows a jump just after walking off an edge, but not later', () => {
    const edge = createJump()
    run(edge, 3, true)
    run(edge, 2, false)
    edge.request()
    expect(edge.step(DT, { supported: false }).launch).toBe(true)

    const late = createJump()
    run(late, 3, true)
    run(late, Math.ceil(COYOTE / DT) + 3, false)
    late.request()
    expect(late.step(DT, { supported: false }).launch).toBe(false)
  })

  it('buffers a press made just before landing, then forgets it', () => {
    const jump = createJump()
    jump.request()
    jump.step(DT, { supported: true })
    run(jump, 20, false)
    jump.request()
    run(jump, 2, false)
    // lands inside the buffer window, so the jump goes off on touchdown
    expect(jump.step(DT, { supported: true }).launch).toBe(true)

    const stale = createJump()
    stale.request()
    run(stale, Math.ceil(BUFFER / DT) + 2, false, { enabled: false })
    expect(stale.step(DT, { supported: true }).launch).toBe(false)
  })

  it('ignores presses while disabled', () => {
    const jump = createJump()
    jump.request()
    expect(jump.step(DT, { supported: true, enabled: false }).launch).toBe(false)
    expect(jump.step(DT, { supported: true }).launch).toBe(false)
  })

  it('crouches at take-off, stretches rising, tucks in the air and squashes on landing', () => {
    const jump = createJump()
    jump.request()
    expect(jump.step(DT, { supported: true }).crouch).toBeGreaterThan(0.8)
    run(jump, Math.ceil(CROUCH / DT) + 1, false)
    expect(jump.pose.crouch).toBe(0)
    expect(jump.pose.stretch).toBeGreaterThan(0.5)
    run(jump, 20, false)
    expect(jump.pose.tuck).toBe(1)
    const landed = run(jump, 1, true)
    expect(landed.airborne).toBe(false)
    expect(landed.squash).toBeGreaterThanOrEqual(0)
    const mid = run(jump, Math.round(SQUASH / 2 / DT), true)
    expect(mid.squash).toBeGreaterThan(0.8)
    expect(run(jump, Math.ceil(SQUASH / DT), true).squash).toBe(0)
  })

  it('keeps the jump but drops squash, stretch and tuck under reduced motion', () => {
    const jump = createJump()
    jump.request()
    expect(jump.step(DT, { supported: true, calm: true }).launch).toBe(true)
    run(jump, 20, false, { calm: true })
    expect(jump.pose.airborne).toBe(true)
    expect(jump.pose.stretch + jump.pose.tuck + jump.pose.crouch).toBe(0)
    run(jump, 2, true, { calm: true })
    expect(jump.pose.squash).toBe(0)
  })

  it('marks the idle machine active while jumping and landing', () => {
    const jump = createJump()
    expect(jump.pose.active).toBe(false)
    jump.request()
    expect(jump.step(DT, { supported: true }).active).toBe(true)
    run(jump, 20, false)
    expect(jump.pose.active).toBe(true)
    run(jump, 40, true)
    expect(jump.pose.active).toBe(false)
  })
})

describe('sharlock enter hop', () => {
  it('lifts and settles within its length, and is skipped when calm', () => {
    const jump = createJump()
    jump.hop()
    const peak = run(jump, Math.round(HOP_LENGTH / 2 / DT), true).hop
    expect(peak).toBeGreaterThan(0.95)
    expect(run(jump, Math.ceil(HOP_LENGTH / DT), true).hop).toBe(0)

    const calm = createJump()
    calm.hop()
    expect(run(calm, 10, true, { calm: true }).hop).toBe(0)
  })
})
