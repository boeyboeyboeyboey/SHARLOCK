import { walkable } from './arena.js'
import { BASE_SPEED, STATION_REACH, TAG_REACH } from './rules.js'

const BOT_SPEED = BASE_SPEED * 0.85
const MAX_STEP_MS = 250
const FLEE_RANGE = 7
const SOLVE_MIN_MS = 4000
const SOLVE_SPAN_MS = 6000
const SOLVE_SUCCESS = 0.7
const PICK_CHANCE = 0.03
const RETRY_MS = 3000
// headings tried in order when the direct line is blocked by a wall
const TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

function nearest(from, list) {
  let best = null
  let bestGap = Infinity
  for (const item of list) {
    const d = gap(from, item)
    if (d < bestGap) {
      best = item
      bestGap = d
    }
  }
  return best
}

// walks one tick toward (or away from) a point through the same move validation as humans
function walk(round, bot, goal, now, away = false) {
  const dt = Math.min(Math.max(now - (bot.lastMoveAt ?? now), 0), MAX_STEP_MS) / 1000
  if (dt === 0) return
  const sign = away ? -1 : 1
  const heading = Math.atan2(sign * (goal.x - bot.x), sign * (goal.z - bot.z))
  const stride = BOT_SPEED * dt
  for (const turn of TURNS) {
    const angle = heading + turn
    const x = bot.x + Math.sin(angle) * stride
    const z = bot.z + Math.cos(angle) * stride
    if (!walkable(x, z)) continue
    round.move(bot.sid, { x, z, yaw: angle }, now)
    return
  }
}

function hunt(round, bot, now) {
  const clean = round.players().filter((p) => !p.infected)
  const prey = clean.filter((p) => p.immuneUntil <= now)
  const target = nearest(bot, prey.length ? prey : clean)
  if (!target) return
  if (prey.length && gap(bot, target) <= TAG_REACH) round.tag(bot.sid, target.sid, now)
  else walk(round, bot, target, now)
}

function patrol(round, bot, brain, now, rng) {
  if (round.hasPuzzle(bot.sid)) {
    if (brain.solveAt !== null && now >= brain.solveAt) {
      round.botSubmit(bot.sid, brain.solveOk, now)
      brain.station = null
      brain.solveAt = null
      brain.nextPickAt = now + RETRY_MS
    }
    return
  }
  brain.solveAt = null
  if (brain.station) {
    const station = round.stationList().find((s) => s.id === brain.station)
    if (!station || station.coolingUntil > now) brain.station = null
    else if (gap(bot, station) <= STATION_REACH - 0.3) {
      const started = round.stationStart(bot.sid, station.id, now)
      if (started.ok) {
        brain.solveAt = now + SOLVE_MIN_MS + rng() * SOLVE_SPAN_MS
        brain.solveOk = rng() < SOLVE_SUCCESS
      } else brain.nextPickAt = now + RETRY_MS
      if (!started.ok) brain.station = null
    } else walk(round, bot, station, now)
    return
  }
  if (bot.immuneUntil > now || now < brain.nextPickAt || now < bot.lockedUntil) return
  if (rng() >= PICK_CHANCE) return
  const free = round.stationList().filter((s) => s.coolingUntil <= now)
  const pick = nearest(bot, free)
  if (pick) brain.station = pick.id
}

// one decision per tick; infected bots hunt, clean bots flee or go patch a station
export function stepBot(round, bot, now, rng) {
  if (!round || !bot?.isBot || round.phase !== 'playing') return
  bot.brain ??= { station: null, solveAt: null, solveOk: false, nextPickAt: 0 }
  if (bot.infected) {
    hunt(round, bot, now)
    return
  }
  const threat = nearest(
    bot,
    round.players().filter((p) => p.infected),
  )
  if (threat && gap(bot, threat) < FLEE_RANGE) {
    walk(round, bot, threat, now, true)
    return
  }
  patrol(round, bot, bot.brain, now, rng)
}
