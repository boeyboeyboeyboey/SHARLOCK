import { walkable } from './arena.js'

export const BASE_SPEED = 7.2
export const SPRINT_MULT = 1.6
export const SPRINT_MS = 2500
export const SPRINT_COOLDOWN_MS = 6000
export const TAG_REACH = 1.4
export const LATENCY_SLACK = 0.6
export const IMMUNITY_MS = 15000
export const STATION_COOLDOWN_MS = 20000
export const STATION_LOCKOUT_MS = 5000
export const STATION_REACH = 1.8
export const ROUND_MS = 180000
export const COUNTDOWN_MS = 10000
export const RESULTS_MS = 15000
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8

const MOVE_TOLERANCE = 1.25
const MOVE_SLACK = 0.5
const MAX_ELAPSED_MS = 1000
const FIRST_MOVE_MS = 100

// small seeded generator so tests and bots stay deterministic
export function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const patientZeroCount = (playerCount) => (playerCount >= 7 ? 2 : 1)

const isTime = (value) => typeof value === 'number' && Number.isFinite(value)

export function sprintActive(player, now) {
  const start = player?.sprintStartedAt
  return isTime(start) && now >= start && now < start + SPRINT_MS
}

export function sprintCooldownEnd(player) {
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

// returns { ok, x, z, reason }; a rejected move keeps the last accepted position
export function validateMove(player, pos, now) {
  const keep = (reason) => ({ ok: false, reason, x: player.x, z: player.z })
  if (!pos || !isTime(pos.x) || !isTime(pos.z) || !isTime(now)) return keep('invalid')
  if (!walkable(pos.x, pos.z)) return keep('blocked')
  const last = isTime(player.lastMoveAt) ? player.lastMoveAt : now - FIRST_MOVE_MS
  const elapsed = Math.min(Math.max(now - last, 0), MAX_ELAPSED_MS)
  const boost = Math.min(sprintOverlapMs(player, now - elapsed, now), elapsed)
  const budget = (BASE_SPEED * (elapsed + boost * (SPRINT_MULT - 1))) / 1000
  const allowed = budget * MOVE_TOLERANCE + MOVE_SLACK
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
  return { ok: true, x: pos.x, z: pos.z }
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
