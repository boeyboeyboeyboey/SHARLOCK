import { SocialEngError } from './policy.js'

export const SHIFT_RULESET_VERSION = '2026-10-31'
export const SHIFT_DECISIONS = ['grant', 'callback', 'refuse', 'escalate']
export const DESK_TOOLS = ['directory', 'ticket', 'callback']
export const MAX_STRIKES = 3
export const MODEL_MESSAGES_PER_CALL = 5
export const MAX_MESSAGES_PER_CALL = 12
export const COLLEAGUE_ASKS_PER_CALL = 2
export const COLLEAGUE_TIMEOUT_MS = 20000
export const ATTACKER_TIMEOUT_MS = 15000
export const HINT_PENALTY = 10
export const SHIFT_WEIGHTS = { decision: 60, verify: 25, efficiency: 15 }
export const EFFICIENCY_MESSAGES = 4
export const STREAK_BONUS = 10
export const SHIFT_IDLE_TTL_MS = 30 * 60 * 1000
export const MAX_SHIFTS = 500

const SHIFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MESSAGE_LENGTH = 1000

function invalid(fieldErrors) {
  return new SocialEngError(
    'SOC_INVALID_BODY',
    'That request could not be read. Reload the simulation and try again.',
    400,
    fieldErrors,
  )
}

// shared shape: an object with exactly the allowed fields and a valid shift id
function parse(body, allowed, extra) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw invalid({ body: 'expected an object' })
  const fieldErrors = {}
  for (const key of Object.keys(body))
    if (!allowed.includes(key)) fieldErrors[key] = 'unsupported field'
  const result = {}
  if (allowed.includes('shiftId')) {
    if (typeof body.shiftId !== 'string' || !SHIFT_ID.test(body.shiftId))
      fieldErrors.shiftId = 'expected a valid shift identifier'
    result.shiftId = body.shiftId
  }
  extra?.(body, fieldErrors, result)
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return result
}

export const parseShiftId = (body) => parse(body, ['shiftId'])

export function parseShiftStart(body) {
  return parse(body, ['context'], (input, errors, result) => {
    if (!input.context || typeof input.context !== 'object' || Array.isArray(input.context))
      errors.context = 'expected an object'
    result.context = input.context
  })
}

export function parseShiftMessage(body) {
  return parse(body, ['shiftId', 'content'], (input, errors, result) => {
    if (typeof input.content !== 'string' || input.content.trim().length < 1) {
      errors.content = 'expected a non-empty message'
    } else if (input.content.length > MAX_MESSAGE_LENGTH) {
      errors.content = `expected at most ${MAX_MESSAGE_LENGTH} characters`
    }
    result.content = input.content
  })
}

export function parseShiftTool(body) {
  return parse(body, ['shiftId', 'tool'], (input, errors, result) => {
    if (typeof input.tool !== 'string' || !DESK_TOOLS.includes(input.tool))
      errors.tool = `expected one of ${DESK_TOOLS.join(', ')}`
    result.tool = input.tool
  })
}

export function parseShiftDecision(body) {
  return parse(body, ['shiftId', 'decision'], (input, errors, result) => {
    if (typeof input.decision !== 'string' || !SHIFT_DECISIONS.includes(input.decision))
      errors.decision = `expected one of ${SHIFT_DECISIONS.join(', ')}`
    result.decision = input.decision
  })
}

export function shiftError(code, message, status = 409) {
  return new SocialEngError(code, message, status)
}

export const shiftNotFound = () =>
  shiftError('SOC_SHIFT_NOT_FOUND', 'That shift was not found or has ended.', 404)
