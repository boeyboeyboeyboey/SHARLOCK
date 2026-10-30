// pure message rules for wharf presence, shared by the service and its unit tests
export const PRESENCE_PATH = '/api/presence'
export const MAX_PAYLOAD_BYTES = 256
export const MIN_MOVE_INTERVAL_MS = 100
export const BOUNDS = Object.freeze({ minX: -60, maxX: 70, minZ: -90, maxZ: 80 })
// the 2d town is a 1120 x 800 world in css px
export const BOUNDS_2D = Object.freeze({ minX: 0, maxX: 1120, minY: 0, maxY: 800 })
export const MODES = Object.freeze(['2d', '3d'])

const COHORT_ID = /^[a-f0-9]{24}$/

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// maps any finite angle into (-pi, pi]
export function normalizeYaw(yaw) {
  const turn = Math.PI * 2
  let wrapped = yaw % turn
  if (wrapped > Math.PI) wrapped -= turn
  else if (wrapped <= -Math.PI) wrapped += turn
  return wrapped
}

const round = (value) => Math.round(value * 1000) / 1000

// returns a clean move, a join, or null for anything unknown or malformed
export function parseClientMessage(raw) {
  let message
  try {
    message = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
  } catch {
    return null
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  if (message.type === 'join') {
    return typeof message.cohortId === 'string' && COHORT_ID.test(message.cohortId)
      ? { type: 'join', cohortId: message.cohortId }
      : null
  }
  if (message.type === 'move') {
    if (message.mode !== undefined && !MODES.includes(message.mode)) return null
    if (message.mode === '2d') {
      const { x, y, moving = false } = message
      if (![x, y].every((value) => typeof value === 'number' && Number.isFinite(value))) return null
      if (typeof moving !== 'boolean') return null
      return {
        type: 'move',
        mode: '2d',
        x: round(clamp(x, BOUNDS_2D.minX, BOUNDS_2D.maxX)),
        y: round(clamp(y, BOUNDS_2D.minY, BOUNDS_2D.maxY)),
        moving,
      }
    }
    const { x, z, yaw, moving } = message
    if (![x, z, yaw].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return null
    }
    if (typeof moving !== 'boolean') return null
    return {
      type: 'move',
      mode: '3d',
      x: round(clamp(x, BOUNDS.minX, BOUNDS.maxX)),
      z: round(clamp(z, BOUNDS.minZ, BOUNDS.maxZ)),
      yaw: clamp(round(normalizeYaw(yaw)), -3.141, 3.141),
      moving,
    }
  }
  return null
}

// true when a move arrives sooner than the 10 Hz budget allows
export function movesTooFast(lastMoveAt, now) {
  return lastMoveAt !== null && now - lastMoveAt < MIN_MOVE_INTERVAL_MS
}

// staff are anyone holding an instructor or admin role; everyone else is a student
export function roleFor(globalRoles) {
  return globalRoles.includes('admin') || globalRoles.includes('instructor') ? 'staff' : 'student'
}
