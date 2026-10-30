import { describe, expect, it } from 'vitest'
import { approachTownPeer, PEER_SNAP, syncTownPeers } from '../townPeers.js'

const peer = (sid, over = {}) => ({
  sid,
  username: sid,
  role: 'student',
  x: 100,
  y: 200,
  moving: false,
  look: {},
  ...over,
})
const asMap = (...list) => new Map(list.map((p) => [p.sid, p]))
const from = { x: 0, y: 0 }

describe('town classmates', () => {
  it('adds a peer at its reported spot with a name and sprite', () => {
    const [entry] = syncTownPeers([], asMap(peer('a', { role: 'staff' })), from)
    expect(entry).toMatchObject({ sid: 'a', x: 100, y: 200, staff: true })
    expect(entry.markup).toContain('<svg')
  })

  it('drops peers that left and ignores ones without 2d coordinates', () => {
    const first = syncTownPeers([], asMap(peer('a'), peer('b')), from)
    expect(first).toHaveLength(2)
    const next = syncTownPeers(first, asMap(peer('b'), peer('c', { x: undefined })), from)
    expect(next.map((entry) => entry.sid)).toEqual(['b'])
  })

  it('keeps only the 20 nearest', () => {
    const many = Array.from({ length: 30 }, (_, i) => peer(`p${i}`, { x: i * 10, y: 0 }))
    const drawn = syncTownPeers([], asMap(...many), from)
    expect(drawn).toHaveLength(20)
    expect(drawn.some((entry) => entry.sid === 'p29')).toBe(false)
  })

  it('glides toward the target and faces the way it travels', () => {
    const [entry] = syncTownPeers([], asMap(peer('a')), from)
    entry.target = { x: 40, y: 200 }
    entry.moving = true
    approachTownPeer(entry, 0.05)
    expect(entry.x).toBeLessThan(100)
    expect(entry.x).toBeGreaterThan(40)
    expect(entry.facing).toBe('left')
    expect(entry.frame).toBeGreaterThan(0)
  })

  it('snaps under reduced motion and on long jumps', () => {
    const [entry] = syncTownPeers([], asMap(peer('a')), from)
    entry.target = { x: 160, y: 200 }
    approachTownPeer(entry, 0.05, true)
    expect(entry.x).toBe(160)
    entry.target = { x: 160 + PEER_SNAP + 10, y: 200 }
    approachTownPeer(entry, 0.016)
    expect(entry.x).toBe(entry.target.x)
  })
})
