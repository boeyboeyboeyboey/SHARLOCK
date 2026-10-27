import { AuthError, normalizeUsername, parseEmptyQuery } from '../auth/policy.js'
import { isAvatarId } from '../auth/avatars.js'
import { HOW_TO_PLAY_GAME_IDS } from './how-to-play.js'

export class ProfileError extends Error {
  constructor(code, message, status = 400, fieldErrors) {
    super(message)
    this.name = 'ProfileError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const allowedFields = ['username', 'avatarId']

function validationError(fieldErrors) {
  return new ProfileError(
    'VALIDATION_ERROR',
    'Check the highlighted fields and try again.',
    400,
    fieldErrors,
  )
}

export function parseProfileUpdateInput(input) {
  const fieldErrors = Object.create(null)
  const prototype = input && typeof input === 'object' ? Object.getPrototypeOf(input) : null
  const isRecord =
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (prototype === Object.prototype || prototype === null)

  if (!isRecord) {
    fieldErrors._ = 'Must be a JSON object.'
    throw validationError(fieldErrors)
  }

  const keys = Reflect.ownKeys(input)
  if (keys.some((key) => typeof key !== 'string' || !allowedFields.includes(key))) {
    fieldErrors._ = 'Only username and avatar are allowed.'
  }
  for (const field of allowedFields) {
    if (!Object.hasOwn(input, field)) fieldErrors[field] = 'This field is required.'
  }

  let username
  try {
    username = normalizeUsername(input.username)
  } catch (error) {
    if (!(error instanceof AuthError) || error.code !== 'VALIDATION_ERROR') throw error
    fieldErrors.username = 'Use 3 to 32 letters, numbers, underscores or hyphens.'
  }

  if (!isAvatarId(input.avatarId)) {
    fieldErrors.avatarId = 'Choose one of the available avatars.'
  }

  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors)
  return { username, avatarId: input.avatarId }
}

export function parseProfileQuery(query) {
  try {
    parseEmptyQuery(query)
  } catch (error) {
    if (!(error instanceof AuthError)) throw error
    throw new ProfileError(error.code, error.message, error.status, error.fieldErrors)
  }
}

export function parseHowToPlayInput(gameId, input) {
  const fieldErrors = Object.create(null)
  if (typeof gameId !== 'string' || !HOW_TO_PLAY_GAME_IDS.includes(gameId)) {
    fieldErrors.gameId = 'Choose a game that has a how to play guide.'
  }

  const prototype = input && typeof input === 'object' ? Object.getPrototypeOf(input) : null
  const isRecord =
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (prototype === Object.prototype || prototype === null)
  if (!isRecord) {
    fieldErrors._ = 'Must be a JSON object.'
  } else {
    const keys = Reflect.ownKeys(input)
    if (keys.length !== 1 || keys[0] !== 'dismissed') fieldErrors._ = 'Only dismissed is allowed.'
    else if (typeof input.dismissed !== 'boolean') fieldErrors.dismissed = 'Must be true or false.'
  }

  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors)
  return { gameId, dismissed: input.dismissed }
}
