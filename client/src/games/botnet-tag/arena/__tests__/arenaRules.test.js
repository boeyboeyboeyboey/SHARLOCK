import { describe, expect, it } from 'vitest'
import {
  correctPosition,
  labelScale,
  needsCorrection,
  nudgeLabels,
  slideStep,
  stationView,
  worldDirection,
} from '../arenaRules.js'
import { approachPeer } from '../../../../features/hub/presence/rules.js'

describe('slideStep', () => {
  it('moves freely in the open', () => {
    expect(slideStep({ x: -8, z: 0 }, 1, 0, 0.5)).toEqual({ x: -7.5, z: 0 })
  })

  it('slides along the centre block instead of stopping', () => {
    const next = slideStep({ x: 0, z: -2.4 }, 0.7071, 0.7071, 0.4)
    expect(next.x).toBeCloseTo(0.283, 2)
    expect(next.z).toBe(-2.4)
  })

  it('stops in a corner', () => {
    expect(slideStep({ x: 21.7, z: 15.7 }, 1, 1, 1)).toEqual({ x: 21.7, z: 15.7 })
  })
})

describe('worldDirection', () => {
  it('forward intent follows the camera heading', () => {
    expect(worldDirection(0, 1, { x: 0, z: 1 })).toEqual({ x: 0, z: 1 })
    const right = worldDirection(1, 0, { x: 0, z: 1 })
    expect(right.x).toBe(1)
    expect(right.z).toBeCloseTo(0)
  })
})

describe('server correction', () => {
  it('ignores small gaps and flags a rejected move', () => {
    expect(needsCorrection({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(false)
    expect(needsCorrection({ x: 0, z: 0 }, { x: 1.6, z: 0 })).toBe(true)
    expect(needsCorrection({ x: 0, z: 0 }, null)).toBe(false)
  })

  it('eases toward the server spot and snaps on a huge gap', () => {
    const eased = correctPosition({ x: 0, z: 0 }, { x: 3, z: 0 }, 0.1)
    expect(eased.x).toBeGreaterThan(0)
    expect(eased.x).toBeLessThan(3)
    expect(correctPosition({ x: 0, z: 0 }, { x: 10, z: 0 }, 0.016)).toEqual({ x: 10, z: 0 })
  })
})

describe('remote interpolation', () => {
  it('eases a peer toward its snapshot target', () => {
    const peer = { x: 0, z: 0, yaw: 0, target: { x: 2, z: 0, yaw: 1 } }
    approachPeer(peer, 0.05)
    expect(peer.x).toBeGreaterThan(0)
    expect(peer.x).toBeLessThan(2)
  })
})

describe('stationView', () => {
  it('is ready with no cooldown and reports progress while cooling', () => {
    expect(stationView({ coolingUntil: 0 }, 1000)).toEqual({ cooling: false, progress: 1 })
    const half = stationView({ coolingUntil: 11000 }, 1000, 20000)
    expect(half.cooling).toBe(true)
    expect(half.progress).toBeCloseTo(0.5)
  })
})

describe('nudgeLabels', () => {
  const item = (key, x, y) => ({ key, x, y, w: 80, h: 20 })

  it('separates overlapping labels and keeps apart ones still', () => {
    const offsets = nudgeLabels([item('a', 100, 100), item('b', 104, 102), item('c', 400, 100)])
    expect(offsets.get('c')).toBe(0)
    expect(offsets.get('a') === 0 || offsets.get('b') === 0).toBe(true)
    expect(Math.max(offsets.get('a'), offsets.get('b'))).toBeGreaterThan(18)
  })

  it('never detaches a label further than the cap', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => item(`p${i}`, 100, 100))
    for (const off of nudgeLabels(crowd, { max: 40 }).values()) expect(off).toBeLessThanOrEqual(40)
  })
})

describe('labelScale', () => {
  it('clamps to a readable range', () => {
    expect(labelScale(1)).toBe(1.25)
    expect(labelScale(200)).toBe(0.8)
  })
})
