import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_DRAWN, REPICK_MS, pickDrawn } from '../presence/rules.js'

const built = vi.hoisted(() => ({ count: 0 }))
vi.mock('../scenes/shared/capybara.js', () => ({
  createCapybaraStatic: () => {
    built.count += 1
    return { scaling: { setAll() {} }, dispose() {} }
  },
  createCapybaraRig: () => ({}),
  furStyles: { sharlock: {} },
}))
vi.mock('@babylonjs/core/Meshes/transformNode.js', () => ({
  TransformNode: class {
    position = { set() {} }
    rotation = {}
    dispose() {}
  },
}))
vi.mock('../scenes/wharf/toon.js', () => ({ applyToon: () => {} }))

const { createRemotePeers } = await import('../presence/remotePeers.js')

const peerAt = (i, x = i) => [
  `p${i}`,
  { sid: `p${i}`, username: `p${i}`, role: 'student', x, z: 0, yaw: 0, moving: false },
]
const crowd = (count, shift = () => 0) =>
  new Map(Array.from({ length: count }, (_, i) => peerAt(i, i + shift(i))))

let clock
let peers
beforeEach(() => {
  built.count = 0
  clock = 0
  peers = createRemotePeers({
    scene: {},
    camera: {},
    engine: {},
    canvas: {},
    tier: { npcRigs: false },
    reduced: () => false,
    look: {},
    getPlayer: () => ({ x: 0, z: 0 }),
    now: () => clock,
  })
})

describe('drawing a crowded class', () => {
  it('draws the cap and does not rebuild on every message', () => {
    peers.set(crowd(25))
    expect(built.count).toBe(MAX_DRAWN)
    for (let i = 0; i < 50; i += 1) {
      clock += 100
      peers.set(crowd(25))
    }
    expect(built.count).toBe(MAX_DRAWN)
  })

  it('does not swap rigs for two peers trading places around the cut', () => {
    peers.set(crowd(25))
    const start = built.count
    for (let i = 0; i < 20; i += 1) {
      clock += REPICK_MS
      // peers 19 and 20 keep crossing by a small step
      peers.set(crowd(25, (n) => (n === 20 ? (i % 2 ? -1.5 : 0) : 0)))
    }
    expect(built.count).toBe(start)
  })

  it('still brings in a peer who really comes closer', () => {
    peers.set(crowd(25))
    clock += REPICK_MS
    peers.set(crowd(25, (n) => (n === 24 ? -23 : 0)))
    expect(built.count).toBe(MAX_DRAWN + 1)
    expect(peers.list().map((p) => p.username)).toContain('p24')
  })

  it('refills a slot at once when a drawn peer leaves', () => {
    peers.set(crowd(25))
    const next = crowd(25)
    next.delete('p3')
    peers.set(next)
    expect(built.count).toBe(MAX_DRAWN + 1)
    expect(peers.list().map((p) => p.username)).not.toContain('p3')
  })

  it('draws a small class as it changes', () => {
    peers.set(crowd(3))
    expect(built.count).toBe(3)
    peers.set(crowd(4))
    expect(built.count).toBe(4)
    peers.set(crowd(2))
    expect(peers.list()).toHaveLength(2)
  })
})

describe('pickDrawn', () => {
  const list = [
    { sid: 'near', x: 1, z: 0 },
    { sid: 'mid', x: 5, z: 0 },
    { sid: 'far', x: 6, z: 0 },
  ]
  it('takes the nearest without a current set', () => {
    expect(pickDrawn(list, { x: 0, z: 0 }, 2).map((p) => p.sid)).toEqual(['near', 'mid'])
  })
  it('keeps a peer already drawn unless the other is nearer by the margin', () => {
    const drawn = new Set(['far'])
    expect(pickDrawn(list, { x: 0, z: 0 }, 2, drawn).map((p) => p.sid)).toEqual(['near', 'far'])
  })
})
