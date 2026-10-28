import { tierForRound } from './generator/index.js'

export const GAME_ID = 'phishing-post-mortem'
export const RULESET_VERSION = 'phish-3'
export const TIMED_SECONDS = 180
export const MAX_MISTAKES = 3
export const PRACTICE_ROUNDS = 12
export const TIMED_ROUND_CAP = 60
export const TIER_POINTS = Object.freeze({ 1: 10, 2: 20, 3: 30 })
export const TELL_BONUS = 10

const ROUND_ID = /^[0-9a-z]{6}$/
const PART_ID = /^p[0-9a-z]{4}$/
const ACTION_FIELDS = ['roundId', 'call', 'partId']

export class TriageError extends Error {
  constructor(code, message, status = 400, fieldErrors = null) {
    super(message)
    this.name = 'TriageError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export function multiplier(streakBefore) {
  if (streakBefore >= 6) return 3
  return streakBefore >= 3 ? 2 : 1
}

// upper bound for a full timed run: every round a phish with its tell found on a perfect streak
export function maxTimedScore() {
  let total = 0
  for (let index = 0; index < TIMED_ROUND_CAP; index += 1) {
    total += (TIER_POINTS[tierForRound(index)] + TELL_BONUS) * multiplier(index)
  }
  return total
}

function invalid(fieldErrors) {
  return new TriageError(
    'PHISH_INVALID_REQUEST',
    'That call could not be read. Check your selection and try again.',
    400,
    fieldErrors,
  )
}

export function parseAction(type, payload) {
  if (type !== 'triage-call')
    throw new TriageError('PHISH_INVALID_ACTION', 'Choose a supported triage action.')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw invalid({ body: 'expected an object' })
  const fieldErrors = Object.create(null)
  for (const key of Object.keys(payload))
    if (!ACTION_FIELDS.includes(key)) fieldErrors[key] = 'unsupported field'
  const { roundId, call, partId } = payload
  if (typeof roundId !== 'string' || !ROUND_ID.test(roundId))
    fieldErrors.roundId = 'expected a valid identifier'
  if (call !== 'report' && call !== 'trust') fieldErrors.call = 'expected report or trust'
  if (call === 'report' && (typeof partId !== 'string' || !PART_ID.test(partId)))
    fieldErrors.partId = 'expected the part you are reporting'
  if (call === 'trust' && Object.hasOwn(payload, 'partId'))
    fieldErrors.partId = 'not allowed when trusting an email'
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return call === 'report' ? { roundId, call, partId } : { roundId, call }
}
