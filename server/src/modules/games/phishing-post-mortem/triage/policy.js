import { tierForRound } from './generator/index.js'

export const GAME_ID = 'phishing-post-mortem'
export const RULESET_VERSION = 'phish-4'
export const LEGACY_RULESET_VERSION = 'phish-3'
// par: what a strong class run reaches, about 16 emails in a row with no mistake, 11 seconds each; scores may exceed it
export const PAR_SCORE = 1000
export const TIMED_SECONDS = 180
export const MAX_MISTAKES = 3
export const PRACTICE_ROUNDS = 12
export const TIMED_ROUND_CAP = 60
export const TIER_POINTS = Object.freeze({ 1: 10, 2: 20, 3: 30 })
export const TELL_BONUS = 10
export const MAX_HINT_TIER = 2

const ROUND_ID = /^[0-9a-z]{6}$/
const PART_ID = /^p[0-9a-z]{4}$/
const ACTION_FIELDS = ['roundId', 'call', 'partId']

export class TriageError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'TriageError'
    this.code = code
    this.status = status
  }
}

export function multiplier(streakBefore) {
  if (streakBefore >= 6) return 3
  return streakBefore >= 3 ? 2 : 1
}

// the phish-3 maximum, kept for saved results: 60 rounds, each a phish with its tell found, on a
// perfect streak, which no run reaches
export function maxTimedScore() {
  let total = 0
  for (let index = 0; index < TIMED_ROUND_CAP; index += 1) {
    total += (TIER_POINTS[tierForRound(index)] + TELL_BONUS) * multiplier(index)
  }
  return total
}

function invalid() {
  return new TriageError(
    'PHISH_INVALID_REQUEST',
    'That call could not be read. Check your selection and try again.',
  )
}

// a hint names only the round; the server decides which tier comes next
function parseHint(payload) {
  if (Object.keys(payload).some((key) => key !== 'roundId')) throw invalid()
  if (typeof payload.roundId !== 'string' || !ROUND_ID.test(payload.roundId)) throw invalid()
  return { roundId: payload.roundId }
}

export function parseAction(type, payload) {
  if (type !== 'triage-call' && type !== 'triage-hint')
    throw new TriageError('PHISH_INVALID_ACTION', 'Choose a supported triage action.')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid()
  if (type === 'triage-hint') return parseHint(payload)
  if (Object.keys(payload).some((key) => !ACTION_FIELDS.includes(key))) throw invalid()
  const { roundId, call, partId } = payload
  if (typeof roundId !== 'string' || !ROUND_ID.test(roundId)) throw invalid()
  if (call !== 'report' && call !== 'trust') throw invalid()
  if (call === 'report' && (typeof partId !== 'string' || !PART_ID.test(partId))) throw invalid()
  if (call === 'trust' && Object.hasOwn(payload, 'partId')) throw invalid()
  return call === 'report' ? { roundId, call, partId } : { roundId, call }
}
