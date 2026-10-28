import {
  INCIDENT_COUNT,
  MAX_MULTIPLIER,
  MAX_WINDOW_SECONDS,
  MIN_WINDOW_SECONDS,
  MIN_PENALISED_WINDOW_SECONDS,
  POINTS_PER_STEP,
  SHIFT_SECONDS,
  TIME_PENALTY_SECONDS,
} from './policy.js'

// start every window at the minimum, then hand out the spare seconds one at a time
// to random windows that still have room, so the total is always exactly the shift length
export function generateWindows(randomInt) {
  const windows = Array(INCIDENT_COUNT).fill(MIN_WINDOW_SECONDS)
  let spare = SHIFT_SECONDS - MIN_WINDOW_SECONDS * INCIDENT_COUNT
  while (spare > 0) {
    const open = windows
      .map((seconds, index) => (seconds < MAX_WINDOW_SECONDS ? index : -1))
      .filter((index) => index >= 0)
    windows[open[randomInt(open.length)]] += 1
    spare -= 1
  }
  return windows
}

export function pointsFor(streak) {
  return POINTS_PER_STEP * Math.min(MAX_MULTIPLIER, streak)
}

// pure replay of the run from stored timestamps; reading it never changes the run.
// each incident opens when the previous one resolves or expires, and a missed window
// is derived from the server clock rather than written by a timer.
// incident.events lists accepted containment steps in order ('ok' or 'bad'); every ok step scores
// at the current streak and a bad one resets it. in timed mode each bad step cuts the penalty from
// the window it happened in while the incident stays open, and from the next window when that
// step closed the incident (resolution.closedByMistake)
export function deriveProgress(run, now) {
  const timed = run.mode === 'timed'
  let opensAt = run.startedAt
  let carry = 0
  let streak = 0
  let bestStreak = 0
  let score = 0
  let current = null
  const incidents = []

  for (const [index, incident] of run.incidents.entries()) {
    if (current) {
      incidents.push({ index, incidentId: incident.id, outcome: 'pending', pointsAwarded: 0 })
      continue
    }
    const events = incident.events ?? []
    let pointsAwarded = 0
    let stepsDone = 0
    for (const event of events) {
      if (event.kind === 'ok') {
        streak += 1
        stepsDone += 1
        bestStreak = Math.max(bestStreak, streak)
        pointsAwarded += pointsFor(streak)
      } else streak = 0
    }
    score += pointsAwarded

    const bad = events.filter((event) => event.kind === 'bad')
    const own = incident.resolution?.closedByMistake ? bad.slice(0, -1) : bad
    let closesAt = null
    let penaltySeconds = 0
    if (timed) {
      const base = incident.windowSeconds
      const penalty = (carry + own.length) * TIME_PENALTY_SECONDS
      const effective = penalty
        ? Math.max(Math.min(MIN_PENALISED_WINDOW_SECONDS, base), base - penalty)
        : base
      penaltySeconds = base - effective
      closesAt = opensAt + effective * 1000
      if (own.length) closesAt = Math.max(closesAt, own[own.length - 1].at)
    }
    let outcome
    let nextOpensAt
    if (incident.resolution) {
      outcome = incident.resolution.outcome
      nextOpensAt = incident.resolution.at
    } else if (timed && now >= closesAt) {
      outcome = 'missed'
      nextOpensAt = closesAt
    } else if (run.endedAt !== null) {
      outcome = 'skipped'
      nextOpensAt = opensAt
    } else {
      current = {
        index,
        incidentId: incident.id,
        opensAt,
        closesAt,
        stepsDone,
        mistakes: bad.length,
        penaltySeconds,
      }
      incidents.push({ index, incidentId: incident.id, outcome: 'open', pointsAwarded })
      continue
    }
    if (outcome === 'missed' || outcome === 'skipped') streak = 0
    carry = timed && incident.resolution?.closedByMistake ? 1 : 0
    incidents.push({
      index,
      incidentId: incident.id,
      outcome,
      pointsAwarded,
      opensAt,
      closesAt,
      penaltySeconds,
    })
    opensAt = nextOpensAt
  }

  return {
    incidents,
    current,
    score,
    streak,
    bestStreak,
    multiplier: Math.min(MAX_MULTIPLIER, streak + 1),
    finished: current === null,
  }
}
