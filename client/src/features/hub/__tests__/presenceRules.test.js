import { describe, expect, it } from 'vitest'
import {
  approachPeer,
  closeDecision,
  isMoving,
  pickDrawn,
  reconnectDelay,
  shouldSendMove,
  wrapAngle,
} from '../presence/rules.js'

const at = (over = {}) => ({ x: 0, z: 0, yaw: 0, moving: false, at: 0, ...over })

describe('presence rules', () => {
  it('sends the first move, then only changes at 10 Hz or less', () => {
    expect(shouldSendMove(null, at(), 0)).toBe(true)
    expect(shouldSendMove(at(), at({ x: 5 }), 50)).toBe(false)
    expect(shouldSendMove(at(), at({ x: 5 }), 100)).toBe(true)
    expect(shouldSendMove(at(), at({ moving: true }), 200)).toBe(true)
    expect(shouldSendMove(at(), at({ yaw: 0.5 }), 200)).toBe(true)
  })

  it('stays quiet while still, with a keepalive each second', () => {
    expect(shouldSendMove(at(), at(), 500)).toBe(false)
    expect(shouldSendMove(at(), at(), 999)).toBe(false)
    expect(shouldSendMove(at(), at(), 1000)).toBe(true)
  })

  it('treats a wrapped yaw turn as no change', () => {
    expect(shouldSendMove(at({ yaw: Math.PI - 0.001 }), at({ yaw: -Math.PI + 0.001 }), 200)).toBe(
      false,
    )
  })

  it('detects movement between samples', () => {
    expect(isMoving(null, { x: 1, z: 1 })).toBe(false)
    expect(isMoving({ x: 0, z: 0 }, { x: 0.5, z: 0 })).toBe(true)
    expect(isMoving({ x: 0, z: 0 }, { x: 0.001, z: 0 })).toBe(false)
  })

  it('decides what each close code means', () => {
    expect(closeDecision(4401)).toBe('stop-quiet')
    expect(closeDecision(4403, true)).toBe('stop')
    expect(closeDecision(4403)).toBe('slow-retry')
    expect(closeDecision(4409)).toBe('superseded')
    expect(closeDecision(4408)).toBe('stop')
    expect(closeDecision(1006)).toBe('retry')
    expect(closeDecision(1001)).toBe('retry')
  })

  it('backs off from one second up to thirty', () => {
    expect([0, 1, 2, 3].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000])
    expect(reconnectDelay(20)).toBe(30000)
  })

  it('wraps angles to the shortest turn', () => {
    expect(wrapAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1)
    expect(wrapAngle(-Math.PI * 2 - 0.1)).toBeCloseTo(-0.1)
  })

  it('eases toward the target and takes the short way round in yaw', () => {
    const peer = { x: 0, z: 0, yaw: Math.PI - 0.1, target: { x: 4, z: 0, yaw: -Math.PI + 0.1 } }
    approachPeer(peer, 0.1)
    expect(peer.x).toBeGreaterThan(0)
    expect(peer.x).toBeLessThan(4)
    expect(peer.yaw).toBeGreaterThan(Math.PI - 0.1)
    for (let i = 0; i < 100; i += 1) approachPeer(peer, 0.1)
    expect(peer.x).toBeCloseTo(4, 2)
  })

  it('snaps on a long jump', () => {
    const peer = { x: 0, z: 0, yaw: 0, target: { x: 40, z: 0, yaw: 1 } }
    approachPeer(peer, 0.016)
    expect(peer).toMatchObject({ x: 40, yaw: 1 })
  })

  it('keeps the nearest peers up to the cap', () => {
    const peers = Array.from({ length: 30 }, (_, i) => ({ sid: `s${i}`, x: i, z: 0 }))
    const kept = pickDrawn(peers, { x: 0, z: 0 }, 20)
    expect(kept).toHaveLength(20)
    expect(kept.map((p) => p.sid)).not.toContain('s25')
    expect(pickDrawn(peers.slice(0, 5), { x: 0, z: 0 })).toHaveLength(5)
  })
})
