export const MOVE_GAP_MS = 100
export const KEEPALIVE_MS = 1000
export const MAX_DRAWN = 20
export const MAX_FAILED_CONNECTS = 10
const MOVED = 0.02
const TAU = Math.PI * 2

// close codes the server uses on purpose: 4401 session ended, 4403 no class access, 4408 too many bad messages
export function closeDecision(code) {
  if (code === 4401) return 'stop-quiet'
  if (code === 4403 || code === 4408) return 'stop'
  return 'retry'
}

// 1 s, 2 s, 4 s ... up to 30 s
export function reconnectDelay(attempt) {
  return Math.min(30000, 1000 * 2 ** Math.max(0, attempt))
}

export function wrapAngle(angle) {
  return angle - TAU * Math.round(angle / TAU)
}

// a move goes out when the player changed, never faster than 10 Hz, and at least once a second as a keepalive
export function shouldSendMove(last, next, now) {
  if (!last) return true
  const gap = now - last.at
  if (gap < MOVE_GAP_MS) return false
  if (gap >= KEEPALIVE_MS) return true
  return (
    next.moving !== last.moving ||
    Math.hypot(next.x - last.x, next.z - last.z) > MOVED ||
    Math.abs(wrapAngle(next.yaw - last.yaw)) > MOVED
  )
}

// the player counts as moving while the position changed since the previous sample
export function isMoving(prev, next) {
  return Boolean(prev) && Math.hypot(next.x - prev.x, next.z - prev.z) > 0.03
}

// eases a drawn peer toward its last reported spot; a long jump snaps
export function approachPeer(peer, dt, { rate = 12, snap = 8 } = {}) {
  const dx = peer.target.x - peer.x
  const dz = peer.target.z - peer.z
  if (Math.hypot(dx, dz) > snap) {
    peer.x = peer.target.x
    peer.z = peer.target.z
    peer.yaw = peer.target.yaw
    return peer
  }
  const k = 1 - Math.exp(-Math.max(0, dt) * rate)
  peer.x += dx * k
  peer.z += dz * k
  peer.yaw += wrapAngle(peer.target.yaw - peer.yaw) * k
  return peer
}

// the nearest peers up to the cap
export function pickDrawn(peers, from, cap = MAX_DRAWN) {
  const list = [...peers]
  if (list.length <= cap) return list
  const d = (p) => Math.hypot(p.x - from.x, p.z - from.z)
  return list.sort((a, b) => d(a) - d(b)).slice(0, cap)
}
