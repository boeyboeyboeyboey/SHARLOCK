import { walkable } from './arena.js'

export const BASE_SPEED = 7.2
export const SPRINT_MULT = 1.6
export const SPRINT_MS = 2500
export const SPRINT_COOLDOWN_MS = 6000
export const INFECTED_CAN_SPRINT = false
export const TAG_REACH = 1.2
// one tag at a time: a tagger waits this long before the next tag lands
export const TAG_COOLDOWN_MS = 2000
// infected players move at this share of the base speed
export const INFECTED_SPEED_MULT = 0.8
export const LATENCY_SLACK = 0.6
export const IMMUNITY_MS = 15000
export const STATION_COOLDOWN_MS = 20000
export const STATION_LOCKOUT_MS = 5000
export const STATION_REACH = 1.8
export const ROUND_MS = 120000
export const COUNTDOWN_MS = 10000
export const RESULTS_MS = 15000
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8
export const GRACE_MS = 10000
export const MIN_SAVED_ROUND_MS = 20000
export const LOBBY_IDLE_MS = 45000
// a steady solver patches about once every 17 s; a survivor tagged late can still catch the
// other survivors, which is everyone but themselves and the two patient zeros of a full round
export const PAR_PATCHES = 6
export const PAR_TAGS = 5

const MOVE_TOLERANCE = 1.25
const MOVE_SLACK = 0.5
const MOVE_CREDIT_CAP = BASE_SPEED * MOVE_TOLERANCE + MOVE_SLACK
const MAX_ELAPSED_MS = 1000
const FIRST_MOVE_MS = 100

export const patientZeroCount = (playerCount) => (playerCount >= 7 ? 2 : 1)

const isTime = (value) => typeof value === 'number' && Number.isFinite(value)

export function sprintActive(player, now) {
  const start = player?.sprintStartedAt
  return isTime(start) && now >= start && now < start + SPRINT_MS
}

// an infected player never gets a sprint, so the cooldown end is pushed out of reach
export function sprintCooldownEnd(player) {
  if (player?.infected && !INFECTED_CAN_SPRINT) return Number.MAX_SAFE_INTEGER
  const start = player?.sprintStartedAt
  return isTime(start) ? start + SPRINT_MS + SPRINT_COOLDOWN_MS : 0
}

export const canStartSprint = (player, now) => now >= sprintCooldownEnd(player)

// milliseconds of the sprint window that fall inside [from, to]
function sprintOverlapMs(player, from, to) {
  const start = player?.sprintStartedAt
  if (!isTime(start)) return 0
  return Math.max(0, Math.min(to, start + SPRINT_MS) - Math.max(from, start))
}

const spawnGap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// keeps the closest survivor as far from patient zero as the spawn set allows; ties go to the first, so shuffle first
export function pickSpawns(spawns, playerCount, zeroCount) {
  const options =
    zeroCount === 1
      ? spawns.map((spawn) => [spawn])
      : spawns.flatMap((a, i) => spawns.slice(i + 1).map((b) => [a, b]))
  let best = null
  for (const zeros of options) {
    const gapTo = (spawn) => Math.min(...zeros.map((zero) => spawnGap(zero, spawn)))
    const others = spawns
      .filter((spawn) => !zeros.includes(spawn))
      .sort((a, b) => gapTo(b) - gapTo(a))
      .slice(0, playerCount - zeroCount)
    const nearest = Math.min(...others.map(gapTo))
    if (!best || nearest > best.nearest) best = { zeros, others, nearest }
  }
  return best
}

// returns { ok, x, z, credit, reason }; a rejected move keeps the last accepted position
// each step spends a credit that refills with time, so flooding messages earns no extra travel
export function validateMove(player, pos, now) {
  const keep = (reason) => ({ ok: false, reason, x: player.x, z: player.z })
  if (!pos || !isTime(pos.x) || !isTime(pos.z) || !isTime(now)) return keep('invalid')
  if (!walkable(pos.x, pos.z)) return keep('blocked')
  const last = isTime(player.lastMoveAt) ? player.lastMoveAt : now - FIRST_MOVE_MS
  const elapsed = Math.min(Math.max(now - last, 0), MAX_ELAPSED_MS)
  const boost = Math.min(sprintOverlapMs(player, now - elapsed, now), elapsed)
  const speed = BASE_SPEED * (player.infected ? INFECTED_SPEED_MULT : 1)
  const walked = (speed * MOVE_TOLERANCE * elapsed) / 1000
  const sprinted = (speed * MOVE_TOLERANCE * boost * (SPRINT_MULT - 1)) / 1000
  const credit = isTime(player.moveCredit) ? player.moveCredit : MOVE_SLACK
  const allowed = Math.min(MOVE_CREDIT_CAP, credit + walked) + sprinted
  const distance = Math.hypot(pos.x - player.x, pos.z - player.z)
  if (distance > allowed) return keep('too_fast')
  // sample the path so a long step can't pass through a wall
  const steps = Math.ceil(distance / 0.25)
  for (let i = 1; i < steps; i += 1) {
    const f = i / steps
    if (!walkable(player.x + (pos.x - player.x) * f, player.z + (pos.z - player.z) * f)) {
      return keep('blocked')
    }
  }
  return { ok: true, x: pos.x, z: pos.z, credit: Math.min(MOVE_CREDIT_CAP, allowed - distance) }
}

export function canTag(tagger, target, now) {
  if (!tagger || !target || tagger === target) return false
  if (!tagger.infected || target.infected) return false
  if ((target.immuneUntil ?? 0) > now) return false
  return Math.hypot(tagger.x - target.x, tagger.z - target.z) <= TAG_REACH + LATENCY_SLACK
}

export function scoreFor(player, outcome) {
  const seconds = Math.floor(Math.max(0, player.survivalSeconds ?? 0))
  const bonus = outcome?.sideWon === true ? 100 : 0
  return seconds + 50 * (player.patches ?? 0) + 30 * (player.tags ?? 0) + bonus
}

// the ceiling of the current ruleset; a saved or live score stops here
export const MAX_SCORE = scoreFor(
  { survivalSeconds: ROUND_MS / 1000, patches: PAR_PATCHES, tags: PAR_TAGS },
  { sideWon: true },
)
