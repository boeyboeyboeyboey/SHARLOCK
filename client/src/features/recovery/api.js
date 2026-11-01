import { api } from '../../services/api.js'
import { avatarPresets } from '../auth/avatars.js'
import { requestCsrfToken } from '../auth/api.js'

const ID_PATTERN = /^[a-f\d]{24}$/i
const TOKEN_PATTERN = /^[A-Za-z\d_-]{43}$/

const SAFE_MESSAGES = Object.freeze({
  RECOVERY_INVALID_REQUEST: 'Check the recovery details and try again.',
  RECOVERY_UNAVAILABLE: 'The recovery request could not be completed. Refresh and try again.',
  RECOVERY_FORBIDDEN: 'You do not have permission to issue recovery for this student.',
  RECOVERY_FAILED: 'The recovery request could not be completed. Try again later.',
  AUTHENTICATION_REQUIRED: 'Your session has ended. Sign in again to continue.',
  CAPABILITY_FORBIDDEN: 'You do not have permission to manage this workspace.',
  CSRF_INVALID: 'The security check expired. Review and try again.',
  ORIGIN_FORBIDDEN: 'This request could not be verified. Refresh and try again.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  PASSWORD_SERVICE_BUSY: 'Sharlock is busy right now. Try again in a moment.',
})

export class RecoveryApiError extends Error {
  constructor({ code = 'REQUEST_FAILED', status = 0, message }) {
    super(message)
    this.name = 'RecoveryApiError'
    this.code = code
    this.status = status
  }
}

function toSafeRecoveryError(error) {
  if (error instanceof RecoveryApiError) return error

  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  const responseCode = error?.response?.data?.error?.code
  const code =
    typeof responseCode === 'string' && Object.hasOwn(SAFE_MESSAGES, responseCode)
      ? responseCode
      : 'REQUEST_FAILED'
  const message =
    SAFE_MESSAGES[code] ||
    (status === 429
      ? SAFE_MESSAGES.RATE_LIMITED
      : status >= 500
        ? 'Sharlock is temporarily unavailable. Try again shortly.'
        : status === 0
          ? 'We could not reach Sharlock. Check your connection and try again.'
          : 'Sharlock could not complete the recovery request. Review the details and try again.')
  return new RecoveryApiError({ code, status, message })
}

function invalidRequest() {
  return new RecoveryApiError({
    code: 'RECOVERY_INVALID_REQUEST',
    status: 400,
    message: SAFE_MESSAGES.RECOVERY_INVALID_REQUEST,
  })
}

function invalidResponse() {
  return new RecoveryApiError({
    code: 'RECOVERY_FAILED',
    status: 503,
    message: SAFE_MESSAGES.RECOVERY_FAILED,
  })
}

async function post(path, body, signal) {
  try {
    const csrfToken = await requestCsrfToken()
    signal?.throwIfAborted()
    return await api.post(path, body, {
      signal,
      headers: { 'X-CSRF-Token': csrfToken },
    })
  } catch (error) {
    throw toSafeRecoveryError(error)
  }
}

function parseStudent(value) {
  if (value === null) return null
  if (
    !value ||
    typeof value !== 'object' ||
    !ID_PATTERN.test(value.id) ||
    typeof value.username !== 'string' ||
    value.username.length < 3 ||
    value.username.length > 32 ||
    typeof value.email !== 'string' ||
    value.email.length < 3 ||
    value.email.length > 254 ||
    !avatarPresets.some((preset) => preset.id === value.avatarId)
  ) {
    throw invalidResponse()
  }
  return {
    id: value.id,
    username: value.username,
    email: value.email,
    avatarId: value.avatarId,
  }
}

function parseResetLink(value) {
  try {
    const url = new URL(value?.resetUrl, window.location.origin)
    const tokenMatch = /^#token=([A-Za-z\d_-]{43})$/.exec(url.hash)
    const expiresAt = Date.parse(value?.expiresAt)
    if (
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/reset-password' ||
      url.search ||
      !tokenMatch ||
      !TOKEN_PATTERN.test(tokenMatch[1]) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      throw new Error()
    }
    return { resetUrl: url.href, expiresAt: value.expiresAt }
  } catch {
    throw invalidResponse()
  }
}

export async function lookupStudent(email, signal) {
  if (typeof email !== 'string' || !email.trim() || email.length > 254) throw invalidRequest()
  const response = await post('/admin/recovery/lookup', { email }, signal)
  return { student: parseStudent(response.data?.student) }
}

export async function issueAdminRecovery(userId, signal) {
  if (typeof userId !== 'string' || !ID_PATTERN.test(userId)) throw invalidRequest()
  const response = await post(
    `/admin/users/${encodeURIComponent(userId)}/recovery`,
    { identityVerified: true },
    signal,
  )
  return parseResetLink(response.data)
}

export async function issueInstructorRecovery(cohortId, studentId, signal) {
  if (
    typeof cohortId !== 'string' ||
    !ID_PATTERN.test(cohortId) ||
    typeof studentId !== 'string' ||
    !ID_PATTERN.test(studentId)
  ) {
    throw invalidRequest()
  }
  const response = await post(
    `/cohorts/${encodeURIComponent(cohortId)}/students/${encodeURIComponent(studentId)}/recovery`,
    { identityVerified: true },
    signal,
  )
  return parseResetLink(response.data)
}

export async function resetPassword(token, password, signal) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) || typeof password !== 'string') {
    throw invalidRequest()
  }
  const response = await post('/auth/reset-password', { token, password }, signal)
  if (response.status !== 204) throw invalidResponse()
}

export function safeRecoveryError(error) {
  return toSafeRecoveryError(error)
}
