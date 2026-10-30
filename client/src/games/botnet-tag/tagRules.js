import { reconnectDelay } from '../../features/hub/presence/rules.js'

export { reconnectDelay }
export const MOVE_GAP_MS = 50
export const MAX_FAILED_CONNECTS = 10
export const URGENT_MS = 30000
export const IMMUNITY_MS = 15000
export const MAX_PLAYERS = 8
export const MAX_EVENTS = 20

export function tagUrl(loc = globalThis.location) {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/api/botnet-tag`
}

// close codes the server uses on purpose: 4401 session ended, 4403 no class, 4408 too many bad messages, 4409 newer tab
export function closeDecision(code, staff = false) {
  if (code === 4401) return 'ended'
  if (code === 4409) return 'superseded'
  if (code === 4403) return staff ? 'stopped' : 'no-class'
  if (code === 4408 || code === 1009) return 'stopped'
  return 'retry'
}

// server clocks differ from the browser clock, so each snapshot carries its own offset
export function msUntil(target, clientNow, offset) {
  return Math.max(0, target - (clientNow + offset))
}

export function formatClock(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function isUrgent(ms) {
  return ms > 0 && ms <= URGENT_MS
}
