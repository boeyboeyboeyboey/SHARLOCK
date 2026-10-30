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

export const AUTO_TAG_REACH = 1.7
export const STATION_REACH = 1.8
export const TAG_GAP_MS = 350
export const USE_GAP_MS = 400
export const TOAST_MS = 3000
export const SPRINT_MS = 2500
export const SPRINT_COOLDOWN_MS = 6000

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// the nearest clean, non-immune player in reach; the server still decides whether the tag counts
export function nearestTarget(me, players, serverNow, reach = AUTO_TAG_REACH) {
  let best = null
  let bestGap = reach
  for (const other of players) {
    if (other.sid === me.sid || other.infected || (other.immuneUntil ?? 0) > serverNow) continue
    const d = gap(me, other)
    if (d <= bestGap) {
      best = other.sid
      bestGap = d
    }
  }
  return best
}

// the nearest station that is ready and in reach, or null
export function nearestStation(me, stations, serverNow, reach = STATION_REACH) {
  let best = null
  let bestGap = reach
  for (const station of stations) {
    if ((station.coolingUntil ?? 0) > serverNow) continue
    const d = gap(me, station)
    if (d <= bestGap) {
      best = station
      bestGap = d
    }
  }
  return best
}

// ready, active or cooldown for the touch sprint button, from when this tab last started one
export function sprintPhase(startedAt, clockNow) {
  if (!startedAt) return 'ready'
  const age = clockNow - startedAt
  if (age < SPRINT_MS) return 'active'
  return age < SPRINT_MS + SPRINT_COOLDOWN_MS ? 'cooldown' : 'ready'
}
