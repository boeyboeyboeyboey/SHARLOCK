import { api } from '../../services/api.js'

const FIELD_NAMES = new Set([
  'email',
  'username',
  'password',
  'passwordConfirmation',
  'avatarId',
  'code',
  '_',
])

const SAFE_MESSAGES = Object.freeze({
  AUTHENTICATION_REQUIRED: 'Your session has ended. Sign in again to continue.',
  INVALID_CREDENTIALS: 'Email, username or password is incorrect.',
  ACCOUNT_UNAVAILABLE:
    'An account could not be created with those details. If you already have one, or started signing up, sign in to continue.',
  VALIDATION_ERROR: 'Check the highlighted fields and try again.',
  CSRF_INVALID: 'Your security check expired. Review the form and try again.',
  ORIGIN_FORBIDDEN: 'This request could not be verified. Refresh and try again.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  PASSWORD_SERVICE_BUSY: 'Sign-in is temporarily busy. Please try again shortly.',
  VERIFICATION_CODE_INVALID: 'That code is not right. Check it and try again.',
  VERIFICATION_CODE_EXPIRED: 'That code has expired. Use Resend code to get a new one.',
  VERIFICATION_ATTEMPTS_EXCEEDED: 'Too many wrong codes. Use Resend code to get a new one.',
  VERIFICATION_NOT_PENDING: 'Your sign-up session ended. Sign in to get a new code.',
})

const FIELD_MESSAGES = Object.freeze({
  email: 'Enter a valid email address.',
  username: 'Use 3 to 32 letters, numbers, underscores or hyphens.',
  password: 'That password could not be accepted. Please choose a different password.',
  passwordConfirmation: 'Passwords must match.',
  avatarId: 'Choose one of the available avatars.',
  code: 'Enter the 6-digit code.',
  _: 'Check the highlighted fields and try again.',
})

export class SafeAuthError extends Error {
  constructor({ code = 'REQUEST_FAILED', status = 0, message, fieldErrors, retryAfter }) {
    super(message || 'Sharlock could not complete that request. Please try again.')
    this.name = 'SafeAuthError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors || Object.freeze({})
    this.retryAfter = retryAfter || null
  }
}

function safeFieldErrors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({})
  const errors = Object.create(null)
  for (const key of Object.keys(value)) {
    if (FIELD_NAMES.has(key)) errors[key] = FIELD_MESSAGES[key]
  }
  return Object.freeze(errors)
}

// words a retry-after in seconds as the wait a person can act on
function waitPhrase(seconds) {
  if (seconds < 60) return 'in a moment'
  const minutes = Math.ceil(seconds / 60)
  if (minutes === 1) return 'in about a minute'
  if (minutes < 60) return `in about ${minutes} minutes`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? 'in about an hour' : `in about ${hours} hours`
}

export function toSafeAuthError(error) {
  if (error instanceof SafeAuthError) return error

  const status = Number.isInteger(error?.response?.status)
    ? error.response.status
    : Number.isInteger(error?.status)
      ? error.status
      : 0
  const payload = error?.response?.data?.error || error
  const code = typeof payload?.code === 'string' ? payload.code : 'REQUEST_FAILED'
  const knownMessage = Object.hasOwn(SAFE_MESSAGES, code) ? SAFE_MESSAGES[code] : null
  const retryAfterHeader = error?.response?.headers?.['retry-after']
  const retryAfter = Number.isFinite(Number(retryAfterHeader))
    ? Math.max(1, Number(retryAfterHeader))
    : null
  let message =
    knownMessage ||
    (status === 429
      ? SAFE_MESSAGES.RATE_LIMITED
      : status >= 500
        ? 'Sharlock is temporarily unavailable. Please try again shortly.'
        : status === 0
          ? 'We could not reach Sharlock. Check your connection and try again.'
          : 'Sharlock could not complete that request. Please try again.')
  if (status === 429 && retryAfter)
    message = `Too many attempts. Try again ${waitPhrase(retryAfter)}.`

  return new SafeAuthError({
    code,
    status,
    message,
    fieldErrors: safeFieldErrors(payload?.fieldErrors),
    retryAfter,
  })
}

function csrfHeaders(csrfToken) {
  return { headers: { 'X-CSRF-Token': csrfToken } }
}

export async function requestCsrfToken() {
  const response = await api.get('/auth/csrf')
  if (typeof response.data?.csrfToken !== 'string' || !response.data.csrfToken) {
    throw new SafeAuthError({ message: 'The security check could not be prepared. Try again.' })
  }
  return response.data.csrfToken
}

// the session probe answers 200 whether or not anyone is signed in
export async function requestSession() {
  const response = await api.get('/auth/session')
  return response.data
}

export async function requestLogin(payload, csrfToken) {
  const response = await api.post('/auth/login', payload, csrfHeaders(csrfToken))
  return response.data
}

export async function requestRegistration(payload, csrfToken) {
  const response = await api.post('/auth/register', payload, csrfHeaders(csrfToken))
  return response.data
}

export async function requestVerifyEmail(payload, csrfToken) {
  const response = await api.post('/auth/verify-email', payload, csrfHeaders(csrfToken))
  return response.data
}

export async function requestResendVerification(csrfToken) {
  const response = await api.post('/auth/verify-email/resend', null, csrfHeaders(csrfToken))
  return response.data
}

export async function requestLogout(csrfToken) {
  await api.post('/auth/logout', null, csrfHeaders(csrfToken))
}
