import { isAvatarId } from './avatars.js'

export class AuthError extends Error {
  constructor(code, message, status = 400, fieldErrors, retryAfterMs) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
    this.retryAfterMs = retryAfterMs
  }
}

const REGISTER_FIELDS = ['email', 'username', 'password', 'avatarId']
const LOGIN_FIELDS = ['identifier', 'password']
const LEGACY_LOGIN_FIELDS = ['email', 'password']
const LOGIN_IDENTIFIER_MESSAGE = 'Enter your email address or username.'
const EMAIL_LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i
const EMAIL_DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const USERNAME = /^[a-z0-9_-]{3,32}$/i
const UNICODE_UPPERCASE = /\p{Lu}/u
const UNICODE_PUNCTUATION_OR_SYMBOL = /[\p{P}\p{S}]/u

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function addFieldError(fieldErrors, field, message) {
  fieldErrors[field] = message
}

function unsafeKey(key) {
  return (
    key === '__proto__' ||
    key === 'prototype' ||
    key === 'constructor' ||
    key.startsWith('$') ||
    key.includes('.')
  )
}

function exactInput(body, expectedFields) {
  const fieldErrors = Object.create(null)
  if (!isRecord(body)) {
    addFieldError(fieldErrors, '_', 'Must be a JSON object.')
    throw validationError(fieldErrors)
  }

  const keys = Object.keys(body)
  for (const key of keys) {
    if (unsafeKey(key)) addFieldError(fieldErrors, key, 'This field is not allowed.')
    else if (!expectedFields.includes(key))
      addFieldError(fieldErrors, key, 'This field is not allowed.')
  }
  for (const field of expectedFields) {
    if (!Object.hasOwn(body, field)) addFieldError(fieldErrors, field, 'This field is required.')
  }
  return { fieldErrors, values: body }
}

function validationError(fieldErrors) {
  return new AuthError(
    'VALIDATION_ERROR',
    'Check the highlighted fields and try again.',
    400,
    fieldErrors,
  )
}

function normalizeEmail(value, fieldErrors) {
  if (typeof value !== 'string') {
    addFieldError(fieldErrors, 'email', 'Enter a valid email address.')
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  let isAscii = true
  for (const character of normalized) {
    if (character.codePointAt(0) > 0x7f) isAscii = false
  }
  if (!normalized || normalized.length > 254 || !isAscii || normalized.split('@').length !== 2) {
    addFieldError(fieldErrors, 'email', 'Enter a valid email address.')
    return undefined
  }

  const [local, domain] = normalized.split('@')
  if (
    local.length < 1 ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !EMAIL_LOCAL.test(local) ||
    !EMAIL_DOMAIN.test(domain)
  ) {
    addFieldError(fieldErrors, 'email', 'Enter a valid email address.')
    return undefined
  }
  return normalized
}

const NEW_PASSWORD_LENGTH_MESSAGE = 'Use at least 12 characters.'
const NEW_PASSWORD_LIMIT_MESSAGE = 'That password is too long.'
const NEW_PASSWORD_UPPERCASE_MESSAGE = 'Include at least one uppercase letter.'
const NEW_PASSWORD_SYMBOL_MESSAGE = 'Include at least one punctuation or symbol character.'
const LOGIN_PASSWORD_MESSAGE = 'Enter your password.'
const MAX_PASSWORD_CODE_POINTS = 128

// sign-in has no length rule to reveal; the upper bound only keeps the hash work bounded
function parseLoginPassword(value, fieldErrors) {
  const characters = typeof value === 'string' ? Array.from(value) : []
  const wellFormed = characters.every((character) => {
    const point = character.codePointAt(0)
    return point < 0xd800 || point > 0xdfff
  })
  if (!characters.length || !wellFormed || characters.length > MAX_PASSWORD_CODE_POINTS) {
    addFieldError(fieldErrors, 'password', LOGIN_PASSWORD_MESSAGE)
    return undefined
  }
  return value
}

function parseNewPassword(value, fieldErrors) {
  if (typeof value !== 'string') {
    addFieldError(
      fieldErrors,
      'password',
      [
        NEW_PASSWORD_LENGTH_MESSAGE,
        NEW_PASSWORD_UPPERCASE_MESSAGE,
        NEW_PASSWORD_SYMBOL_MESSAGE,
      ].join(' '),
    )
    return undefined
  }

  let codePoints = 0
  let wellFormed = true
  let hasUppercase = false
  let hasPunctuationOrSymbol = false
  for (const character of value) {
    const point = character.codePointAt(0)
    if (point >= 0xd800 && point <= 0xdfff) wellFormed = false
    if (UNICODE_UPPERCASE.test(character)) hasUppercase = true
    if (UNICODE_PUNCTUATION_OR_SYMBOL.test(character)) hasPunctuationOrSymbol = true
    codePoints += 1
  }
  const passwordMessages = []
  if (!wellFormed || codePoints < 12) passwordMessages.push(NEW_PASSWORD_LENGTH_MESSAGE)
  if (codePoints > MAX_PASSWORD_CODE_POINTS) passwordMessages.push(NEW_PASSWORD_LIMIT_MESSAGE)
  if (!hasUppercase) passwordMessages.push(NEW_PASSWORD_UPPERCASE_MESSAGE)
  if (!hasPunctuationOrSymbol) passwordMessages.push(NEW_PASSWORD_SYMBOL_MESSAGE)
  if (passwordMessages.length) {
    addFieldError(fieldErrors, 'password', passwordMessages.join(' '))
    return undefined
  }
  return value
}

function throwIfInvalid(fieldErrors) {
  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors)
}

export function parseNewPasswordInput(value) {
  const fieldErrors = Object.create(null)
  const password = parseNewPassword(value, fieldErrors)
  throwIfInvalid(fieldErrors)
  return password
}

export function normalizeEmailAddress(value) {
  const fieldErrors = Object.create(null)
  const normalized = normalizeEmail(value, fieldErrors)
  throwIfInvalid(fieldErrors)
  return normalized
}

export function normalizeUsername(value) {
  if (typeof value !== 'string') {
    throw validationError(
      Object.assign(Object.create(null), {
        username: 'Use 3 to 32 letters, numbers, underscores or hyphens.',
      }),
    )
  }

  const normalized = value.trim()
  if (!USERNAME.test(normalized)) {
    throw validationError(
      Object.assign(Object.create(null), {
        username: 'Use 3 to 32 letters, numbers, underscores or hyphens.',
      }),
    )
  }
  return { display: normalized, normalized: normalized.toLowerCase() }
}

function parseBody(body, expectedFields, registration) {
  const { fieldErrors, values } = exactInput(body, expectedFields)
  const emailNormalized = normalizeEmail(values.email, fieldErrors)
  const password = parseNewPassword(values.password, fieldErrors)
  let username
  let avatarId

  if (registration) {
    if (typeof values.username !== 'string') {
      addFieldError(
        fieldErrors,
        'username',
        'Use 3 to 32 letters, numbers, underscores or hyphens.',
      )
    } else {
      const display = values.username.trim()
      if (!USERNAME.test(display)) {
        addFieldError(
          fieldErrors,
          'username',
          'Use 3 to 32 letters, numbers, underscores or hyphens.',
        )
      } else {
        username = { display, normalized: display.toLowerCase() }
      }
    }
    if (!isAvatarId(values.avatarId))
      addFieldError(fieldErrors, 'avatarId', 'Choose one of the available avatars.')
    else avatarId = values.avatarId
  }

  throwIfInvalid(fieldErrors)
  return registration
    ? { emailNormalized, username, password, avatarId }
    : { emailNormalized, password }
}

export function parseRegistrationInput(body) {
  return parseBody(body, REGISTER_FIELDS, true)
}

// usernames cannot contain '@', so the identifier type is unambiguous
function normalizeLoginIdentifier(value, fieldErrors, field) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.includes('@')) {
      const normalized = normalizeEmail(trimmed, Object.create(null))
      if (normalized) return { kind: 'email', normalized }
    } else if (USERNAME.test(trimmed)) {
      return { kind: 'username', normalized: trimmed.toLowerCase() }
    }
  }
  addFieldError(fieldErrors, field, LOGIN_IDENTIFIER_MESSAGE)
  return undefined
}

export function parseLoginInput(body) {
  // older callers still send { email, password }
  const expectedFields =
    isRecord(body) && Object.hasOwn(body, 'email') && !Object.hasOwn(body, 'identifier')
      ? LEGACY_LOGIN_FIELDS
      : LOGIN_FIELDS
  const { fieldErrors, values } = exactInput(body, expectedFields)
  const field = expectedFields[0]
  const identifier = normalizeLoginIdentifier(values[field], fieldErrors, field)
  const password = parseLoginPassword(values.password, fieldErrors)
  throwIfInvalid(fieldErrors)
  return { identifier, password }
}

export function parseEmptyInput(body) {
  if (body === undefined) return {}
  if (!isRecord(body) || Object.keys(body).length > 0) {
    throw validationError(
      Object.assign(Object.create(null), { _: 'This request does not accept fields.' }),
    )
  }
  return {}
}

export function parseEmptyQuery(query) {
  if (!isRecord(query) || Object.keys(query).length > 0) {
    const fieldErrors = Object.create(null)
    if (isRecord(query)) {
      for (const key of Object.keys(query))
        addFieldError(fieldErrors, key, 'This query field is not allowed.')
    } else addFieldError(fieldErrors, '_', 'This request does not accept query fields.')
    throw validationError(fieldErrors)
  }
}

export function isAllowedObject(value, expectedFields) {
  if (!isRecord(value)) return false
  return Object.keys(value).every((key) => !unsafeKey(key) && expectedFields.includes(key))
}
