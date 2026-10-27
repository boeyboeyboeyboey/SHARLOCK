import { api } from '../../services/api.js'
import { requestCsrfToken } from '../auth/api.js'

const messages = {
  ATTEMPT_STALE_REVISION: 'This case changed in another tab. Reload the case before continuing.',
  AUTHENTICATION_REQUIRED: 'Your session ended. Sign in again, then reopen this case.',
  CSRF_INVALID: 'The security check expired. Retry your request.',
  ATTEMPT_NOT_FOUND: 'This case is unavailable to your account.',
  RESOURCE_NOT_FOUND: 'This class is no longer available. Your case has not been changed.',
}

export function safeAttemptError(error) {
  const code = error?.response?.data?.error?.code
  const status = error?.response?.status
  let message = 'Could not reach saved play. Retry to check the same request.'
  if (messages[code]) message = messages[code]
  else if (status === 429) message = 'Too many requests. Wait a moment before retrying.'
  else if (status === 403 || status === 404)
    message = 'Your account cannot access this case or class now.'
  else if (status === 400 || status === 409)
    message = 'This action could not be accepted. Reload the case and review it.'
  return { message, status: status || 0 }
}

export async function listAttemptContexts(page = 1, signal) {
  return (await api.get('/attempt-contexts', { params: { page, limit: 50 }, signal })).data
}

export async function readAttempt(id, signal) {
  return (await api.get(`/attempts/${encodeURIComponent(id)}`, { signal })).data
}

// token lives in module memory only, never in browser storage
let csrfToken = null
let csrfRequest = null

function getCsrf() {
  if (csrfToken) return Promise.resolve(csrfToken)
  if (!csrfRequest) {
    const request = requestCsrfToken()
      .then((token) => {
        if (csrfRequest === request) csrfToken = token
        return token
      })
      .finally(() => {
        if (csrfRequest === request) csrfRequest = null
      })
    csrfRequest = request
  }
  return csrfRequest
}

function clearCsrf() {
  csrfToken = null
  csrfRequest = null
}

async function post(path, body, signal) {
  const token = await getCsrf()
  return (await api.post(path, body, { signal, headers: { 'X-CSRF-Token': token } })).data
}

// csrf runs before the attempt handlers, so a rejected write never executed and one retry is safe
export async function writeAttempt(path, body, signal) {
  try {
    return await post(path, body, signal)
  } catch (error) {
    const status = error?.response?.status
    if (status === 401) clearCsrf()
    if (status !== 403 || error.response.data?.error?.code !== 'CSRF_INVALID') throw error
    clearCsrf()
    return post(path, body, signal)
  }
}
