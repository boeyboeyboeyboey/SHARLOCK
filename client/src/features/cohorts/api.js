import { api } from '../../services/api.js'
import { requestCsrfToken } from '../auth/api.js'

const SAFE_MESSAGES = Object.freeze({
  COHORT_INVALID_CODE: 'That class code is invalid, expired, or no longer active.',
  COHORT_CONFLICT: 'This class changed while you were viewing it. Refresh and try again.',
  COHORT_ALREADY_IN_CLASS: "You're already in a class. Leave it before joining another.",
  COHORT_STALE_REQUEST: 'This class request changed. Refresh the list and try again.',
  COHORT_STALE_CODE: 'The invitation code changed. Refresh before making another change.',
  COHORT_CODE_UNAVAILABLE: 'A class code could not be issued. Refresh and try again.',
  COHORT_UNAVAILABLE: 'The class workspace is unavailable. Try again shortly.',
  VALIDATION_ERROR: 'Check the class code and try again.',
  COHORT_FORBIDDEN: 'You do not have permission to manage this class.',
  COHORT_NOT_FOUND: 'This class or request is no longer available. Refresh the list.',
  AUTHENTICATION_REQUIRED: 'Your session ended. Sign in again to continue.',
  CSRF_INVALID: 'The security check expired. Review the form and try again.',
  ORIGIN_FORBIDDEN: 'This request could not be verified. Refresh and try again.',
})

export class CohortApiError extends Error {
  constructor({ code = 'REQUEST_FAILED', status = 0, message }) {
    super(message)
    this.name = 'CohortApiError'
    this.code = code
    this.status = status
  }
}

function toSafeError(error) {
  if (error instanceof CohortApiError) return error
  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  const responseCode = error?.response?.data?.error?.code
  const code =
    typeof responseCode === 'string' && Object.hasOwn(SAFE_MESSAGES, responseCode)
      ? responseCode
      : 'REQUEST_FAILED'
  let message = SAFE_MESSAGES[code]
  if (!message && status === 429) message = 'Too many attempts. Wait a moment and try again.'
  if (!message && status >= 500) message = 'Sharlock is temporarily unavailable. Try again shortly.'
  if (!message && status === 0)
    message = 'We could not reach Sharlock. Check your connection and try again.'
  if (!message)
    message = 'Sharlock could not complete that request. Review the details and try again.'
  return new CohortApiError({ code, status, message })
}

async function get(path, options = {}) {
  try {
    return (await api.get(path, options)).data
  } catch (error) {
    throw toSafeError(error)
  }
}

async function mutate(method, path, body, signal) {
  try {
    const csrfToken = await requestCsrfToken()
    signal?.throwIfAborted()
    const options = { signal, headers: { 'X-CSRF-Token': csrfToken } }
    const response =
      method === 'delete'
        ? await api.delete(path, { ...options, data: body })
        : await api[method](path, body, options)
    return response.data
  } catch (error) {
    throw toSafeError(error)
  }
}

export const listMemberships = ({ page = 1, limit = 20, signal } = {}) =>
  get('/me/memberships', { params: { page, limit }, signal })
export const getEnrollment = (signal) => get('/me/enrollment', { signal })
export const listManagedCohorts = ({ page = 1, limit = 20, signal } = {}) =>
  get('/cohorts/managed', { params: { page, limit }, signal })
export const listCohortMemberships = (
  cohortId,
  { status = 'pending', page = 1, limit = 20, signal } = {},
) =>
  get(`/cohorts/${encodeURIComponent(cohortId)}/memberships`, {
    params: { status, page, limit },
    signal,
  })
export const getEnrollmentCode = (cohortId, signal) =>
  get(`/cohorts/${encodeURIComponent(cohortId)}/enrollment-codes`, { signal })

export const holdClassInvitation = (code, signal) =>
  mutate('post', '/auth/class-invitation', { code }, signal)
export const clearClassInvitation = (signal) =>
  mutate('post', '/auth/class-invitation/clear', {}, signal)
export const joinClass = (input, signal) => mutate('post', '/cohorts/join-requests', input, signal)
export const completeOnboarding = (signal) =>
  mutate('patch', '/me/enrollment/onboarding', { completed: true }, signal)
export const updateMembership = (cohortId, membershipId, status, expectedRevision, signal) =>
  mutate(
    'patch',
    `/cohorts/${encodeURIComponent(cohortId)}/memberships/${encodeURIComponent(membershipId)}`,
    { status, expectedRevision },
    signal,
  )
export const issueEnrollmentCode = (cohortId, expectedRevision, signal) =>
  mutate(
    'post',
    `/cohorts/${encodeURIComponent(cohortId)}/enrollment-codes`,
    { expectedRevision },
    signal,
  )
export const revokeEnrollmentCode = (cohortId, codeId, expectedRevision, signal) =>
  mutate(
    'delete',
    `/cohorts/${encodeURIComponent(cohortId)}/enrollment-codes/${encodeURIComponent(codeId)}`,
    { expectedRevision },
    signal,
  )

export function safeError(error) {
  return toSafeError(error)
}

export async function issueValidatedEnrollmentCode(cohortId, expectedRevision, signal) {
  const result = await issueEnrollmentCode(cohortId, expectedRevision, signal)
  try {
    const rawCode = normalizeCode(result?.rawCode)
    const url = new URL(result?.invitationUrl, window.location.origin)
    const fragment = new URLSearchParams(url.hash.slice(1))
    const entries = [...fragment.entries()]
    const codeInUrl =
      entries.length === 1 && entries[0][0] === 'code' && fragment.getAll('code').length === 1
        ? normalizeCode(entries[0][1])
        : null
    const expiresAt = Date.parse(result?.expiresAt || result?.code?.expiresAt)
    if (
      !rawCode ||
      rawCode !== codeInUrl ||
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/join-class' ||
      url.search ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      typeof (result?.id || result?.code?.id) !== 'string' ||
      !Number.isInteger(result?.revision)
    )
      throw new Error()
    return { ...result, rawCode, expiresAt: new Date(expiresAt).toISOString() }
  } catch {
    throw new CohortApiError({
      code: 'COHORT_CODE_UNAVAILABLE',
      status: 0,
      message: SAFE_MESSAGES.COHORT_CODE_UNAVAILABLE,
    })
  }
}

function normalizeCode(value) {
  if (typeof value !== 'string') return null
  const code = value.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-HJ-NP-Z2-9]{16}$/.test(code) ? code : null
}
