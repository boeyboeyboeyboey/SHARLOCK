export const GAME_ID = 'sql-injection-arcade'
export const RULESET_VERSION = 'sql-2'
export const TIMED_SECONDS = 180
export const MAX_LIVES = 3
export const PRACTICE_CASES = 12
export const MAX_TRIES = 3
export const MAX_PROBES = 6
export const REPAIR_EVERY = 4
export const TIER_POINTS = Object.freeze({ 1: 10, 2: 20, 3: 30 })
export const FIRST_TRY_BONUS = 10
export const REPAIR_POINTS = 10
export const MAX_INPUT = 120
export const MAX_NAME = 40

// one repair slot follows every fourth case, so a slot cycle is five long
const CYCLE = REPAIR_EVERY + 1
export const PRACTICE_SLOTS = PRACTICE_CASES + Math.floor(PRACTICE_CASES / REPAIR_EVERY)
export const TIMED_SLOT_CAP = 36

export const KIND_TIER = Object.freeze({
  'login-tautology': 1,
  'login-comment': 1,
  'login-numeric': 1,
  union: 2,
  blind: 2,
  'second-order': 3,
})

// most actions one case can take: blind probes plus the answer
const WORST_CASE_ACTIONS = MAX_PROBES + 1

export function isRepairSlot(index) {
  return index % CYCLE === CYCLE - 1
}

export function caseNumber(index) {
  return index - Math.floor(index / CYCLE)
}

function maxTier(number) {
  if (number < 3) return 1
  return number < 7 ? 2 : 3
}

export function maxTimedActions() {
  let total = 0
  for (let index = 0; index < TIMED_SLOT_CAP; index += 1)
    total += isRepairSlot(index) ? 1 : WORST_CASE_ACTIONS
  return total
}

// upper bound for a full timed run: every case solved first try at the highest tier then possible
export function maxTimedScore() {
  let total = 0
  for (let index = 0; index < TIMED_SLOT_CAP; index += 1)
    total += isRepairSlot(index)
      ? REPAIR_POINTS
      : TIER_POINTS[maxTier(caseNumber(index))] + FIRST_TRY_BONUS
  return total
}

export class SqlError extends Error {
  constructor(code, message, status = 400, fieldErrors = null) {
    super(message)
    this.name = 'SqlError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const CASE_ID = /^[0-9a-z]{6}$/
const OPTION_IDS = ['a', 'b', 'c', 'd']
const FIELDS = {
  attempt: ['caseId', 'inputs'],
  register: ['caseId', 'inputs'],
  'change-password': ['caseId'],
  answer: ['caseId', 'value'],
  'choose-fix': ['caseId', 'optionId'],
  hint: ['caseId'],
}

function invalid(fieldErrors) {
  return new SqlError(
    'SQL_INVALID_REQUEST',
    'That action could not be read. Check your input and try again.',
    400,
    fieldErrors,
  )
}

export function parseAction(type, payload) {
  if (typeof type !== 'string' || !Object.hasOwn(FIELDS, type))
    throw new SqlError('SQL_INVALID_ACTION', 'Choose a supported puzzle action.')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw invalid({ body: 'expected an object' })
  const errors = Object.create(null)
  for (const key of Object.keys(payload))
    if (!FIELDS[type].includes(key)) errors[key] = 'unsupported'
  if (typeof payload.caseId !== 'string' || !CASE_ID.test(payload.caseId))
    errors.caseId = 'expected a valid identifier'
  if (type === 'attempt' || type === 'register') {
    const limit = type === 'register' ? MAX_NAME : MAX_INPUT
    const { inputs } = payload
    if (
      !Array.isArray(inputs) ||
      inputs.length < 1 ||
      inputs.length > (type === 'register' ? 1 : 2) ||
      !inputs.every((item) => typeof item === 'string' && item.length <= limit)
    )
      errors.inputs = `expected fictional text up to ${limit} characters`
  }
  if (type === 'answer' && payload.value !== 'yes' && payload.value !== 'no')
    errors.value = 'expected yes or no'
  if (type === 'choose-fix' && !OPTION_IDS.includes(payload.optionId))
    errors.optionId = 'expected one of the offered options'
  if (Object.keys(errors).length) throw invalid(errors)
  return Object.fromEntries(FIELDS[type].map((key) => [key, payload[key]]))
}
