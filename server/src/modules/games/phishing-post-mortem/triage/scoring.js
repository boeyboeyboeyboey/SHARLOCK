import { generateRound } from './generator/index.js'
import { MAX_MISTAKES, TIER_POINTS, TELL_BONUS, multiplier } from './policy.js'

export const PHISH_TYPE_TOPICS = Object.freeze({
  lookalike: 'lookalike-domains',
  spoof: 'sender-spoofing',
  replyTo: 'reply-to-mismatch',
  linkMismatch: 'link-mismatch',
  bec: 'business-email-compromise',
  qr: 'qr-phishing',
  attachment: 'malicious-attachment',
  legit: 'legitimate-email-recognition',
})

// derives the running totals from the stored rounds so state never holds a second copy
export function tally(rounds) {
  let score = 0
  let streak = 0
  let mistakes = 0
  for (const round of rounds) {
    score += round.points
    if (round.correct) streak += 1
    else {
      streak = 0
      mistakes += 1
    }
  }
  return { score, streak, mistakes }
}

export function roundFor(state, roundIndex) {
  return generateRound({ seed: state.seed, roundIndex })
}

// scores one call against the private answer, given the streak before it
export function judgeCall({ email, answer }, call, partId, streakBefore) {
  const phish = answer.verdict === 'phish'
  const correct = phish ? call === 'report' : call === 'trust'
  const tellHit = call === 'report' && phish && answer.tellPartIds.includes(partId)
  const base = TIER_POINTS[email.tier] + (tellHit ? TELL_BONUS : 0)
  const points = correct ? base * multiplier(streakBefore) : 0
  return { correct, tellHit, points }
}

export function mistakeLimitReached(rounds) {
  return tally(rounds).mistakes >= MAX_MISTAKES
}

// per-type correct and total counts for the debrief topics
export function typeBreakdown(state) {
  const byType = new Map()
  state.rounds.forEach((round, index) => {
    const { answer } = roundFor(state, index)
    const entry = byType.get(answer.type) ?? { correct: 0, total: 0 }
    entry.total += 1
    if (round.correct) entry.correct += 1
    byType.set(answer.type, entry)
  })
  return byType
}
