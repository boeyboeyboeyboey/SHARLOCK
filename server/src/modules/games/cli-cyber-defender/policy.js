export const GAME_ID = 'cli-cyber-defender'
export const RULESET_VERSION = 'cli-3'
export const MODES = ['timed', 'practice']
export const INCIDENT_COUNT = 8
export const SHIFT_SECONDS = 200
export const MIN_WINDOW_SECONDS = 20
export const MAX_WINDOW_SECONDS = 30
export const TWO_STEP_INCIDENTS = 2
export const TOTAL_STEPS = INCIDENT_COUNT + TWO_STEP_INCIDENTS
export const MAX_LOOKUPS_PER_INCIDENT = 6
export const MAX_MISTAKES_PER_INCIDENT = 3
export const TIME_PENALTY_SECONDS = 5
export const MIN_PENALISED_WINDOW_SECONDS = 5
export const POINTS_PER_STEP = 100
export const MAX_MULTIPLIER = 3
export const MAX_COMMAND_LENGTH = 120
export const MAX_COMMANDS_PER_RUN = 120
export const MAX_SCORE = Array.from(
  { length: TOTAL_STEPS },
  (_, index) => POINTS_PER_STEP * Math.min(MAX_MULTIPLIER, index + 1),
).reduce((total, points) => total + points, 0)

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ACTION_ID = /^[A-Za-z0-9-]{8,64}$/
const INCIDENT_ID = /^incident-0[1-8]$/

export class CliError extends Error {
  constructor(code, message, status = 400, fieldErrors = null) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function invalid(fieldErrors) {
  return new CliError(
    'CLI_INVALID_BODY',
    'That request could not be read. Reload the game and try again.',
    400,
    fieldErrors,
  )
}

function readObject(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw invalid({ body: 'expected an object' })
  const fieldErrors = {}
  for (const key of Object.keys(body))
    if (!allowed.includes(key)) fieldErrors[key] = 'unsupported field'
  return fieldErrors
}

function readPattern(value, pattern, field, fieldErrors) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fieldErrors[field] = 'expected a valid identifier'
    return null
  }
  return value
}

export function parseRunId(value) {
  if (typeof value !== 'string' || !RUN_ID.test(value)) throw runNotFound()
  return value
}

export function parseStart(body) {
  const fieldErrors = readObject(body, ['mode', 'context'])
  if (!MODES.includes(body.mode)) fieldErrors.mode = 'expected timed or practice'
  const { context } = body
  if (!context || typeof context !== 'object' || Array.isArray(context))
    fieldErrors.context = 'expected a context object'
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return { mode: body.mode, context }
}

export function parseCommandBody(body) {
  const fieldErrors = readObject(body, ['actionId', 'incidentId', 'command'])
  const actionId = readPattern(body.actionId, ACTION_ID, 'actionId', fieldErrors)
  const incidentId = readPattern(body.incidentId, INCIDENT_ID, 'incidentId', fieldErrors)
  const { command } = body
  if (typeof command !== 'string' || !command.length || command.length > MAX_COMMAND_LENGTH)
    fieldErrors.command = `expected 1 to ${MAX_COMMAND_LENGTH} characters`
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return { actionId, incidentId, command }
}

export function parseEmptyBody(body) {
  const fieldErrors = readObject(body, [])
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return {}
}

export function parseHintBody(body) {
  const fieldErrors = readObject(body, ['incidentId'])
  const incidentId = readPattern(body.incidentId, INCIDENT_ID, 'incidentId', fieldErrors)
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return { incidentId }
}

export function parseCompleteBody(body) {
  const fieldErrors = readObject(body, ['actionId'])
  const actionId = readPattern(body.actionId, ACTION_ID, 'actionId', fieldErrors)
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
  return { actionId }
}

export function runNotFound() {
  return new CliError(
    'CLI_RUN_NOT_FOUND',
    'That game has ended or expired. Start a new game to keep playing.',
    404,
  )
}

export function incidentClosed() {
  return new CliError(
    'CLI_INCIDENT_CLOSED',
    'That incident is no longer open. Check the current alert.',
    409,
  )
}

export function actionConflict() {
  return new CliError(
    'CLI_ACTION_CONFLICT',
    'That command was already submitted with different input.',
    409,
  )
}

export function runFinished() {
  return new CliError('CLI_RUN_FINISHED', 'This game is already finished.', 409)
}

export function runNotFinished() {
  return new CliError(
    'CLI_RUN_NOT_FINISHED',
    'The game is still running. Handle the remaining challenges first.',
    409,
  )
}

export function runPaused() {
  return new CliError('CLI_RUN_PAUSED', 'The game is paused. Resume it to keep playing.', 409)
}

export function pauseUnavailable() {
  return new CliError(
    'CLI_PAUSE_UNAVAILABLE',
    'Only a timed game that is still running can be paused.',
    409,
  )
}

export function hintUnavailable() {
  return new CliError(
    'CLI_HINT_UNAVAILABLE',
    'Hints are only available during untimed practice.',
    409,
  )
}

export function commandLimit() {
  return new CliError(
    'CLI_COMMAND_LIMIT',
    'This game has reached its command limit. Start a new game.',
    409,
  )
}

export function rateLimited() {
  return new CliError('CLI_RATE_LIMITED', 'Too many requests. Wait a moment and try again.', 429)
}
