import { api } from '../../services/api.js'
import { requestCsrfToken } from '../../features/auth/api.js'

const BASE = '/games/social-engineering-simulator'

export const MAX_MESSAGE_LENGTH = 1000
export const NUDGE_IDLE_MS = 12000
export const VERIFIER_TIMEOUT_MS = 65000

export const DECISIONS = [
  {
    id: 'refuse',
    label: 'Refuse and end',
    description: 'Decline to share the code and close the conversation.',
  },
  {
    id: 'verify-independently',
    label: 'Verify through a known channel',
    description:
      'Refuse, then confirm the request using a help-desk ticket or a number you look up yourself.',
  },
  {
    id: 'share-code',
    label: 'Share the code',
    description: 'Hand over the reset code.',
  },
]

// every post is state-changing, so each carries a fresh csrf token
async function post(path, body, options) {
  const token = await requestCsrfToken()
  const { data } = await api.post(`${BASE}/${path}`, body, {
    ...options,
    headers: { 'X-CSRF-Token': token },
  })
  return data
}

export function startSession(context, signal) {
  return post('session', { context }, { signal, timeout: 15000 })
}

export function sendMessage(sessionId, content, signal) {
  return post('message', { sessionId, content }, { signal, timeout: 45000 })
}

export function sendVerifierMessage(sessionId, content, signal) {
  return post('verifier-message', { sessionId, content }, { signal, timeout: VERIFIER_TIMEOUT_MS })
}

export function requestNudge(sessionId, signal) {
  return post('nudge', { sessionId }, { signal, timeout: 15000 })
}

export function completeSession(sessionId, decision, signal) {
  return post('complete', { sessionId, decision }, { signal, timeout: 15000 })
}

// true when the server no longer holds this session (restart, idle expiry or already completed)
export function isSessionGone(error) {
  return error?.response?.data?.error?.code === 'LLM_SESSION_NOT_FOUND'
}

export function simulatorErrorMessage(error, fallback) {
  if (error?.response?.status === 401) return 'Your session ended. Sign in again, then retry.'
  const message = error?.response?.data?.error?.message
  return typeof message === 'string' && message ? message : fallback
}
