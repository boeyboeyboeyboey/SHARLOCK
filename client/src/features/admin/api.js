import { api } from '../../services/api.js'
import { requestCsrfToken } from '../auth/api.js'

const SAFE_MESSAGES = Object.freeze({
  ADMIN_INVALID_REQUEST: 'Check the highlighted details and try again.',
  ADMIN_CONFLICT: 'This change conflicts with existing records. Review the details and try again.',
  ADMIN_NOT_FOUND: 'The selected account or class is unavailable. Refresh the list and try again.',
  ADMIN_STALE_ASSIGNMENTS: 'Assignments changed elsewhere. Reload them before saving again.',
  ADMIN_STALE_INSTITUTION:
    'This institution changed elsewhere. Reload the list and review your changes.',
  ADMIN_STALE_COHORT: 'This class changed elsewhere. Reload the list and review your changes.',
  ADMIN_STALE_ACCOUNT:
    'This account changed elsewhere. The list was refreshed; review its latest status.',
  ADMIN_INSTRUCTOR_ACTIVATION_REQUIRED:
    'Disabled instructors must receive a new activation link and complete activation before access is restored.',
  ADMIN_PASSWORD_INVALID: 'Check your password and try again.',
  ADMIN_FORBIDDEN: 'You do not have permission to manage this workspace.',
  ADMIN_UNAVAILABLE: 'The workspace could not complete that change. Try again later.',
  AUTHENTICATION_REQUIRED: 'Your session ended. Sign in again to continue.',
  CAPABILITY_FORBIDDEN: 'You do not have permission to manage this workspace.',
  FORBIDDEN: 'You do not have permission to manage this workspace.',
  CSRF_INVALID: 'The security check expired. Review the form and try again.',
  ORIGIN_FORBIDDEN: 'This request could not be verified. Refresh and try again.',
})

export class AdminApiError extends Error {
  constructor({ code = 'REQUEST_FAILED', status = 0, message, fieldErrors }) {
    super(message)
    this.fieldErrors = fieldErrors
    this.name = 'AdminApiError'
    this.code = code
    this.status = status
  }
}

function toSafeAdminError(error) {
  if (error instanceof AdminApiError) return error

  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  const responseCode = error?.response?.data?.error?.code
  const code =
    typeof responseCode === 'string' && Object.hasOwn(SAFE_MESSAGES, responseCode)
      ? responseCode
      : 'REQUEST_FAILED'
  const message =
    SAFE_MESSAGES[code] ||
    (status === 429
      ? 'Too many requests. Wait a moment and try again.'
      : status >= 500
        ? 'Sharlock is temporarily unavailable. Try again shortly.'
        : status === 0
          ? 'We could not reach Sharlock. Check your connection and try again.'
          : 'Sharlock could not complete that request. Review the details and try again.')
  const rawFields = error?.response?.data?.error?.fieldErrors
  const fieldErrors = {}
  if (rawFields && typeof rawFields === 'object') {
    for (const field of ['confirmUsername', 'password', 'reasonCategory', 'reasonNote']) {
      if (typeof rawFields[field] === 'string') fieldErrors[field] = rawFields[field].slice(0, 200)
    }
  }
  return new AdminApiError({
    code,
    status,
    message,
    ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
  })
}

async function requestList(path, { page = 1, limit = 20, signal, institutionId } = {}) {
  try {
    const params = { page, limit }
    if (institutionId) params.institutionId = institutionId
    const response = await api.get(path, { params, signal })
    return response.data
  } catch (error) {
    throw toSafeAdminError(error)
  }
}

async function requestMutation(method, path, body, signal) {
  try {
    const csrfToken = await requestCsrfToken()
    const options = {
      signal,
      headers: { 'X-CSRF-Token': csrfToken },
    }
    const response = await api[method](path, body, options)
    return response.data
  } catch (error) {
    throw toSafeAdminError(error)
  }
}

function validateActivationResult(result) {
  try {
    const url = new URL(result?.activationUrl, window.location.origin)
    if (
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/activate-account' ||
      url.search ||
      !/^#token=[A-Za-z\d_-]{43}$/.test(url.hash) ||
      !Number.isFinite(Date.parse(result?.expiresAt))
    ) {
      throw new Error()
    }
    return {
      activationUrl: url.href,
      expiresAt: result.expiresAt,
    }
  } catch {
    throw new AdminApiError({
      code: 'ADMIN_UNAVAILABLE',
      status: 0,
      message: SAFE_MESSAGES.ADMIN_UNAVAILABLE,
    })
  }
}

export function listInstitutions(options) {
  return requestList('/admin/institutions', options)
}

export function listCohorts(options) {
  return requestList('/admin/cohorts', options)
}

export function listInstructors(options) {
  return requestList('/admin/instructors', options)
}

export async function listAdminUsers({ page = 1, limit = 25, role, accountStatus, signal } = {}) {
  try {
    const params = { page, limit }
    if (role) params.role = role
    if (accountStatus) params.accountStatus = accountStatus
    const response = await api.get('/admin/users', { params, signal })
    return response.data
  } catch (error) {
    throw toSafeAdminError(error)
  }
}

export async function listAuditEvents({ page = 1, limit = 25, eventType, from, to, signal } = {}) {
  try {
    const params = { page, limit }
    if (eventType) params.eventType = eventType
    if (from) params.from = from
    if (to) params.to = to
    const response = await api.get('/admin/audit-events', { params, signal })
    return response.data
  } catch (error) {
    throw toSafeAdminError(error)
  }
}

export function createInstitution(input, signal) {
  return requestMutation('post', '/admin/institutions', input, signal)
}

export function createCohort(input, signal) {
  return requestMutation('post', '/admin/cohorts', input, signal)
}

export function updateInstitution(institutionId, input, signal) {
  return requestMutation(
    'patch',
    `/admin/institutions/${encodeURIComponent(institutionId)}`,
    input,
    signal,
  )
}

export function updateCohort(cohortId, input, signal) {
  return requestMutation('patch', `/admin/cohorts/${encodeURIComponent(cohortId)}`, input, signal)
}

export function updateAdminUser(userId, input, signal) {
  return requestMutation('patch', `/admin/users/${encodeURIComponent(userId)}`, input, signal)
}

export function deleteAdminUser(userId, input, signal) {
  return requestMutation('post', `/admin/users/${encodeURIComponent(userId)}/delete`, input, signal)
}

export async function createInstructor(input, signal) {
  const result = await requestMutation('post', '/admin/instructors', input, signal)
  return { ...result, ...validateActivationResult(result) }
}

export async function createAdministrator(input, signal) {
  const result = await requestMutation('post', '/admin/administrators', input, signal)
  return { ...result, ...validateActivationResult(result) }
}

export async function reissueInstructorActivation(instructorId, signal) {
  const result = await requestMutation(
    'post',
    `/admin/instructors/${encodeURIComponent(instructorId)}/activation`,
    undefined,
    signal,
  )
  return validateActivationResult(result)
}

export function updateInstructorAssignments(instructorId, input, signal) {
  return requestMutation(
    'put',
    `/admin/instructors/${encodeURIComponent(instructorId)}/assignments`,
    input,
    signal,
  )
}
