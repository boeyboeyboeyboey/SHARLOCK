import { MAX_DRAWN, pickDrawn } from '../hub/presence/rules.js'
import { peerMarkup } from './townArt.js'

const FRAME_SECONDS = 0.3

export const PEER_RATE = 10
// a jump longer than this many world px snaps instead of gliding
export const PEER_SNAP = 240

// eases a drawn classmate toward their last reported spot; reduced motion and long jumps snap
export function approachTownPeer(peer, dt, reduced = false) {
  const dx = peer.target.x - peer.x
  const dy = peer.target.y - peer.y
  if (reduced || Math.hypot(dx, dy) > PEER_SNAP) {
    peer.x = peer.target.x
    peer.y = peer.target.y
    peer.frame = 0
    return peer
  }
  const k = 1 - Math.exp(-Math.max(0, dt) * PEER_RATE)
  peer.x += dx * k
  peer.y += dy * k
  if (Math.abs(dx) > 1) peer.facing = dx < 0 ? 'left' : 'right'
  if (peer.moving) {
    peer.anim += Math.max(0, dt)
    peer.frame = 1 + (Math.floor(peer.anim / FRAME_SECONDS) % 2)
  } else peer.frame = 0
  return peer
}

const lookKey = (look) => JSON.stringify(look ?? {})

// reconciles the drawn list with the latest same-mode peer map: new peers appear at their spot, the nearest MAX_DRAWN stay
export function syncTownPeers(drawn, peers, from, reduced = false) {
  const valid = [...peers.values()].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  const keep = pickDrawn(
    valid.map((p) => ({ ...p, z: p.y })),
    { x: from.x, z: from.y },
    MAX_DRAWN,
  )
  const next = []
  for (const peer of keep) {
    const old = drawn.find((entry) => entry.sid === peer.sid)
    const entry = old ?? {
      sid: peer.sid,
      x: peer.x,
      y: peer.y,
      facing: 'right',
      frame: 0,
      anim: 0,
      markup: '',
      look: '',
    }
    entry.username = peer.username
    entry.staff = peer.role === 'staff'
    entry.moving = Boolean(peer.moving) && !reduced
    entry.target = { x: peer.x, y: peer.y }
    const key = lookKey(peer.look)
    if (entry.look !== key) {
      entry.look = key
      entry.markup = peerMarkup(peer.look)
    }
    next.push(entry)
  }
  return next
}
