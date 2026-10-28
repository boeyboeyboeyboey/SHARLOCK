import { generateCase } from './generator/index.js'
import { FIRST_TRY_BONUS, MAX_LIVES, REPAIR_POINTS, TIER_POINTS } from './policy.js'

export const TOPIC_OF_KIND = Object.freeze({
  'login-tautology': 'sql-injection',
  'login-comment': 'sql-injection',
  'login-numeric': 'sql-injection',
  union: 'union-injection',
  blind: 'blind-injection',
  'second-order': 'second-order-injection',
})
export const SQL_TOPICS = Object.freeze([
  'sql-injection',
  'union-injection',
  'blind-injection',
  'second-order-injection',
  'parameterized-queries',
])

export function caseAt(state, index) {
  return generateCase({ seed: state.seed, index })
}

export function solvedPoints(rec) {
  const bonus = rec.slips === 0 && !rec.assisted ? FIRST_TRY_BONUS : 0
  return TIER_POINTS[rec.tier] + bonus
}

export function fixPoints() {
  return REPAIR_POINTS
}

// derives every total from the stored case records so state never holds a second copy
export function tally(cases) {
  const totals = { score: 0, solved: 0, failed: 0, repairsRight: 0, repairsWrong: 0, closed: 0 }
  for (const rec of cases) {
    if (rec.outcome === 'open') continue
    totals.closed += 1
    totals.score += rec.points
    const solved = rec.outcome === 'solved'
    if (rec.kind === 'repair') totals[solved ? 'repairsRight' : 'repairsWrong'] += 1
    else totals[solved ? 'solved' : 'failed'] += 1
  }
  return totals
}

export function livesLeft(cases) {
  return Math.max(0, MAX_LIVES - tally(cases).failed)
}

// per-topic solved and total counts of the closed injection cases
export function topicBreakdown(cases) {
  const byTopic = new Map()
  for (const rec of cases) {
    if (rec.outcome === 'open' || rec.kind === 'repair') continue
    const topic = TOPIC_OF_KIND[rec.kind]
    const entry = byTopic.get(topic) ?? { solved: 0, total: 0 }
    entry.total += 1
    if (rec.outcome === 'solved') entry.solved += 1
    byTopic.set(topic, entry)
  }
  return byTopic
}
