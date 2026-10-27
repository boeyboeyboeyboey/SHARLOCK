import { isAvatarId } from '../auth/avatars.js'
import { accountDeleteReasonCategories } from '../audit/policy.js'
import { normalizeEmailAddress, normalizeUsername, parseEmptyQuery } from '../auth/policy.js'

const ADMIN_ERRORS = Object.freeze({
  ADMIN_INVALID_REQUEST: { status: 400, message: 'Check the request fields and try again.' },
  ADMIN_FORBIDDEN: { status: 403, message: 'This action is unavailable.' },
  ADMIN_NOT_FOUND: { status: 404, message: 'This account or class is unavailable.' },
  ADMIN_PASSWORD_INVALID: { status: 403, message: 'Check your password and try again.' },
  ADMIN_CONFLICT: { status: 409, message: 'This change conflicts with existing records.' },
  ADMIN_STALE_ASSIGNMENTS: { status: 409, message: 'Refresh assignments before saving again.' },
  ADMIN_STALE_INSTITUTION: { status: 409, message: 'Refresh the institution before saving again.' },
  ADMIN_STALE_COHORT: { status: 409, message: 'Refresh the class before saving again.' },
  ADMIN_STALE_ACCOUNT: { status: 409, message: 'Refresh the account before saving again.' },
  ADMIN_INSTRUCTOR_ACTIVATION_REQUIRED: {
    status: 409,
    message: 'Use the instructor activation flow to enable this account.',
  },
  ADMIN_UNAVAILABLE: {
    status: 503,
    message: 'This change could not be completed. Try again later.',
  },
})

const OBJECT_ID = /^[a-f\d]{24}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ERROR_FIELDS = new Set([
  'name',
  'slug',
  'institutionId',
  'term',
  'email',
  'username',
  'avatarId',
  'cohortIds',
  'expectedRevision',
  'confirmUsername',
  'password',
  'reasonCategory',
  'reasonNote',
  'status',
  'accountStatus',
  'role',
  'page',
  'limit',
])

export class AdminError extends Error {
  constructor(code = 'ADMIN_INVALID_REQUEST', fieldErrors) {
    const definition = ADMIN_ERRORS[code] || ADMIN_ERRORS.ADMIN_UNAVAILABLE
    super(definition.message)
    this.name = 'AdminError'
    this.code = ADMIN_ERRORS[code] ? code : 'ADMIN_UNAVAILABLE'
    this.status = definition.status
    if (fieldErrors) this.fieldErrors = safeFieldErrors(fieldErrors)
  }
}

function safeFieldErrors(fieldErrors) {
  const safe = Object.create(null)
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (ERROR_FIELDS.has(field) && typeof message === 'string') safe[field] = message
  }
  return Object.keys(safe).length ? safe : undefined
}

function invalid(fieldErrors) {
  throw new AdminError('ADMIN_INVALID_REQUEST', fieldErrors)
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactObject(input, fields) {
  if (!isRecord(input)) invalid()
  const keys = Reflect.ownKeys(input)
  if (keys.some((key) => typeof key !== 'string' || !fields.includes(key))) invalid()
  if (fields.some((field) => !Object.hasOwn(input, field))) {
    invalid(
      Object.fromEntries(
        fields
          .filter((field) => !Object.hasOwn(input, field))
          .map((field) => [field, 'This field is required.']),
      ),
    )
  }
  return input
}

function parsePageValue(value, field, maximum) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    invalid({ [field]: 'Enter a positive whole number.' })
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    invalid({ [field]: `Enter a number from 1 to ${maximum}.` })
  }
  return parsed
}

export function parseAdminListQuery(query, { institution = false, users = false } = {}) {
  if (!isRecord(query)) invalid()
  const fields = institution
    ? ['page', 'limit', 'institutionId']
    : users
      ? ['page', 'limit', 'role', 'accountStatus']
      : ['page', 'limit']
  if (Reflect.ownKeys(query).some((key) => typeof key !== 'string' || !fields.includes(key)))
    invalid()
  const result = {
    page: Object.hasOwn(query, 'page') ? parsePageValue(query.page, 'page', 10000) : 1,
    limit: Object.hasOwn(query, 'limit') ? parsePageValue(query.limit, 'limit', 50) : 20,
  }
  if (Object.hasOwn(query, 'institutionId')) {
    result.institutionId = parseAdminObjectId(query.institutionId, 'institutionId')
  }
  if (Object.hasOwn(query, 'role')) {
    if (!['student', 'instructor'].includes(query.role)) invalid({ role: 'Choose a supported role.' })
    result.role = query.role
  }
  if (Object.hasOwn(query, 'accountStatus')) {
    if (!['active', 'disabled'].includes(query.accountStatus)) {
      invalid({ accountStatus: 'Choose an account status.' })
    }
    result.accountStatus = query.accountStatus
  }
  return result
}

export function parseAccountStatusInput(input) {
  exactObject(input, ['accountStatus', 'expectedRevision'])
  if (!['active', 'disabled'].includes(input.accountStatus)) {
    invalid({ accountStatus: 'Choose an account status.' })
  }
  return {
    accountStatus: input.accountStatus,
    expectedRevision: parseExpectedRevision(input.expectedRevision),
  }
}

export function parseAccountDeleteInput(input) {
  if (!isRecord(input)) invalid()
  const keys = Reflect.ownKeys(input)
  const required = ['confirmUsername', 'password', 'reasonCategory', 'expectedRevision']
  if (keys.some((key) => typeof key !== 'string' || ![...required, 'reasonNote'].includes(key))) {
    invalid()
  }
  const missing = required.filter((field) => !Object.hasOwn(input, field))
  if (missing.length) invalid(Object.fromEntries(missing.map((field) => [field, 'This field is required.'])))
  if (typeof input.confirmUsername !== 'string' || !input.confirmUsername.trim() ||
    input.confirmUsername.length > 64) {
    invalid({ confirmUsername: 'Type the username to confirm.' })
  }
  if (typeof input.password !== 'string' || !input.password || input.password.length > 128) {
    invalid({ password: 'Enter your password.' })
  }
  if (!accountDeleteReasonCategories.includes(input.reasonCategory)) {
    invalid({ reasonCategory: 'Choose a reason.' })
  }
  let reasonNote
  if (Object.hasOwn(input, 'reasonNote') && input.reasonNote !== undefined) {
    if (typeof input.reasonNote !== 'string') invalid({ reasonNote: 'Enter a valid note.' })
    reasonNote = input.reasonNote.trim()
    if (reasonNote.length < 10 || reasonNote.length > 500) {
      invalid({ reasonNote: 'Enter between 10 and 500 characters.' })
    }
  } else if (input.reasonCategory === 'other') {
    invalid({ reasonNote: 'Add a note of 10 to 500 characters.' })
  }
  return {
    confirmUsername: input.confirmUsername,
    password: input.password,
    reasonCategory: input.reasonCategory,
    ...(reasonNote !== undefined && { reasonNote }),
    expectedRevision: parseExpectedRevision(input.expectedRevision),
  }
}

export function parseAdminObjectId(value, field = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    invalid({ [field]: 'Enter a valid identifier.' })
  }
  return value.toLowerCase()
}

function parseText(value, field, maximum) {
  if (typeof value !== 'string') invalid({ [field]: 'Enter a valid value.' })
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) {
    invalid({ [field]: `Enter between 1 and ${maximum} characters.` })
  }
  return normalized
}

export function parseInstitutionInput(input) {
  exactObject(input, ['name', 'slug'])
  const name = parseText(input.name, 'name', 100)
  const slug = parseText(input.slug, 'slug', 64).toLowerCase()
  if (slug.length < 3 || !SLUG.test(slug)) {
    invalid({ slug: 'Use 3 to 64 lowercase letters, numbers or single hyphens.' })
  }
  return { name, slug }
}

export function parseCohortInput(input) {
  exactObject(input, ['institutionId', 'name', 'term'])
  return {
    institutionId: parseAdminObjectId(input.institutionId, 'institutionId'),
    name: parseText(input.name, 'name', 100),
    term: parseText(input.term, 'term', 50),
  }
}

function parseStatus(value) {
  if (!['active', 'inactive'].includes(value)) invalid({ status: 'Choose an available status.' })
  return value
}

function parseExpectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid({ expectedRevision: 'Refresh the record before saving.' })
  }
  return value
}

export function parseInstitutionUpdateInput(input) {
  return parseUpdateFields(input, ['name', 'status'], {
    name: (value) => parseText(value, 'name', 100),
    status: parseStatus,
  })
}

export function parseCohortUpdateInput(input) {
  return parseUpdateFields(input, ['name', 'term', 'status'], {
    name: (value) => parseText(value, 'name', 100),
    term: (value) => parseText(value, 'term', 50),
    status: parseStatus,
  })
}

function parseUpdateFields(input, mutableFields, parsers) {
  if (!isRecord(input)) invalid()
  const fields = [...mutableFields, 'expectedRevision']
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !fields.includes(key)))
    invalid()
  if (!Object.hasOwn(input, 'expectedRevision')) {
    invalid({ expectedRevision: 'Refresh the record before saving.' })
  }
  if (!mutableFields.some((field) => Object.hasOwn(input, field))) invalid()
  return {
    ...Object.fromEntries(
      mutableFields
        .filter((field) => Object.hasOwn(input, field))
        .map((field) => [field, parsers[field](input[field])]),
    ),
    expectedRevision: parseExpectedRevision(input.expectedRevision),
  }
}

export function parseInstructorInput(input) {
  exactObject(input, ['email', 'username', 'avatarId'])
  let email
  let username
  try {
    email = normalizeEmailAddress(input.email)
  } catch {
    invalid({ email: 'Enter a valid email address.' })
  }
  try {
    username = normalizeUsername(input.username)
  } catch {
    invalid({ username: 'Use 3 to 32 letters, numbers, underscores or hyphens.' })
  }
  if (!isAvatarId(input.avatarId)) invalid({ avatarId: 'Choose one of the available avatars.' })
  return { emailNormalized: email, username, avatarId: input.avatarId }
}

export function parseAssignmentsInput(input) {
  exactObject(input, ['cohortIds', 'expectedRevision'])
  if (!Array.isArray(input.cohortIds) || input.cohortIds.length > 50) {
    invalid({ cohortIds: 'Choose no more than 50 classes.' })
  }
  const cohortIds = input.cohortIds.map((id) => parseAdminObjectId(id, 'cohortIds'))
  if (new Set(cohortIds).size !== cohortIds.length) {
    invalid({ cohortIds: 'Choose each class only once.' })
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    invalid({ expectedRevision: 'Refresh the assignment list before saving.' })
  }
  return { cohortIds, expectedRevision: input.expectedRevision }
}

export function assertEmptyAdminBody(input) {
  if (input === undefined) return
  if (!isRecord(input) || Reflect.ownKeys(input).length !== 0) invalid()
}

export function assertEmptyAdminQuery(query) {
  try {
    parseEmptyQuery(query)
  } catch {
    invalid()
  }
}
