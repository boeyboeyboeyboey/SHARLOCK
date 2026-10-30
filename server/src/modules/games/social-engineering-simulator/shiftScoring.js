import {
  EFFICIENCY_MESSAGES,
  HINT_PENALTY,
  MAX_STRIKES,
  SHIFT_WEIGHTS,
  STREAK_BONUS,
} from './shiftPolicy.js'
import { CALLS_PER_SHIFT } from './callGenerator.js'

export const SHIFT_MAX_SCORE =
  CALLS_PER_SHIFT * (SHIFT_WEIGHTS.decision + SHIFT_WEIGHTS.verify + SHIFT_WEIGHTS.efficiency) +
  (CALLS_PER_SHIFT - 1) * STREAK_BONUS

function efficiencyPoints(messagesUsed) {
  if (messagesUsed <= EFFICIENCY_MESSAGES) return SHIFT_WEIGHTS.efficiency
  const over = (messagesUsed - EFFICIENCY_MESSAGES) / EFFICIENCY_MESSAGES
  return Math.max(0, Math.round(SHIFT_WEIGHTS.efficiency * (1 - over)))
}

// callback is correct whenever a number on file exists; without one it only half works
function decisionPoints({ genuine, callbackViable, decision, verified }) {
  const full = SHIFT_WEIGHTS.decision
  const half = full / 2
  if (decision === 'callback') return callbackViable ? full : half
  if (genuine) {
    if (decision === 'grant') return verified ? full : half
    if (decision === 'escalate') return half
    return 0
  }
  return decision === 'grant' ? 0 : full
}

// input: { genuine, callbackViable, decision, leaked, verified, messagesUsed, hints }
// decision is 'none' when the call ended on a leak
export function scoreCall(input) {
  const leaked = Boolean(input.leaked)
  const decision = leaked ? 0 : decisionPoints(input)
  const checked = input.verified || input.decision === 'callback'
  const verify = !leaked && decision > 0 && checked ? SHIFT_WEIGHTS.verify : 0
  const efficiency = !leaked && decision > 0 ? efficiencyPoints(input.messagesUsed) : 0
  const hintCost = input.hints * HINT_PENALTY
  const score = Math.max(0, decision + verify + efficiency - hintCost)
  return {
    score,
    correct: !leaked && decision === SHIFT_WEIGHTS.decision,
    strike: leaked || (!input.genuine && input.decision === 'grant'),
    breakdown: [
      {
        key: 'decision',
        label: 'Handled the request',
        points: decision,
        max: SHIFT_WEIGHTS.decision,
      },
      {
        key: 'verify',
        label: 'Checked before deciding',
        points: verify,
        max: SHIFT_WEIGHTS.verify,
      },
      {
        key: 'efficiency',
        label: 'Kept the call short',
        points: efficiency,
        max: SHIFT_WEIGHTS.efficiency,
      },
      { key: 'hints', label: 'Asked Sharlock for hints', points: -hintCost, max: 0 },
    ],
  }
}

function outcomeFor(strikes) {
  if (strikes >= MAX_STRIKES) return 'compromised'
  return strikes > 0 ? 'partial' : 'resisted'
}

// calls are the played calls in order; unplayed calls (early end) score nothing
export function scoreShift(calls) {
  let strikes = 0
  let streak = 0
  let bonus = 0
  let total = 0
  const results = calls.map((input) => {
    const result = scoreCall(input)
    if (result.strike) strikes += 1
    streak = result.correct ? streak + 1 : 0
    const callBonus = result.correct && streak > 1 ? STREAK_BONUS : 0
    bonus += callBonus
    total += result.score + callBonus
    return { ...result, streak, bonus: callBonus }
  })
  return { score: total, bonus, strikes, outcome: outcomeFor(strikes), calls: results }
}
