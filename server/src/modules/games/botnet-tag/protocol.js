// pure message rules for botnet tag rounds, shared by the socket service and its unit tests
export const BOTNET_TAG_PATH = '/api/botnet-tag'
export const MAX_PAYLOAD_BYTES = 2304
export const MAX_SUBMISSION_BYTES = 2048
export const RATE_WINDOW_MS = 1000

// messages allowed per rate window; anything above is dropped and counts as a strike
export const RATE_LIMITS = Object.freeze({
  join: 3,
  ready: 5,
  move: 25,
  sprint: 3,
  tag: 10,
  station: 5,
  submit: 5,
  leave: 3,
})

const COHORT_ID = /^[a-f0-9]{24}$/
const MAX_COORD = 1000
const MAX_ID_LENGTH = 32

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const idText = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH

// maps any finite angle into (-pi, pi]
export function normalizeYaw(yaw) {
  const turn = Math.PI * 2
  let wrapped = yaw % turn
  if (wrapped > Math.PI) wrapped -= turn
  else if (wrapped <= -Math.PI) wrapped += turn
  return wrapped
}

// returns a clean message or null for anything unknown, malformed or oversized
export function parseClientMessage(raw) {
  let message
  try {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8')
    if (text.length > MAX_PAYLOAD_BYTES) return null
    message = JSON.parse(text)
  } catch {
    return null
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  switch (message.type) {
    case 'join':
      return typeof message.cohortId === 'string' && COHORT_ID.test(message.cohortId)
        ? { type: 'join', cohortId: message.cohortId }
        : null
    case 'ready':
      return typeof message.ready === 'boolean' ? { type: 'ready', ready: message.ready } : null
    case 'move': {
      const { x, z, yaw } = message
      if (![x, z, yaw].every(finite) || Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD) {
        return null
      }
      return { type: 'move', x, z, yaw: normalizeYaw(yaw) }
    }
    case 'sprint':
    case 'leave':
      return { type: message.type }
    case 'tag':
      return idText(message.target) ? { type: 'tag', target: message.target } : null
    case 'station':
      return idText(message.id) ? { type: 'station', id: message.id } : null
    case 'submit': {
      const { submission } = message
      if (!submission || typeof submission !== 'object' || Array.isArray(submission)) return null
      if (JSON.stringify(submission).length > MAX_SUBMISSION_BYTES) return null
      return { type: 'submit', submission }
    }
    default:
      return null
  }
}

// counts messages per type in a rolling one second window; false means over the limit
export function allowMessage(counters, type, at) {
  const entry = counters.get(type)
  if (!entry || at - entry.start >= RATE_WINDOW_MS) {
    counters.set(type, { start: at, count: 1 })
    return true
  }
  entry.count += 1
  return entry.count <= RATE_LIMITS[type]
}
