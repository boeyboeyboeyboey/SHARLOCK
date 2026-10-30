import { api } from '../../services/api.js'
import { requestCsrfToken } from '../../features/auth/api.js'

const BASE = '/games/social-engineering-simulator/shift'

export const MAX_MESSAGE_LENGTH = 1000
export const HINT_PENALTY = 10

export const DECISIONS = [
  { id: 'grant', label: 'Grant', icon: '✓' },
  { id: 'callback', label: 'Call back', icon: '☎' },
  { id: 'refuse', label: 'Refuse', icon: '✕' },
  { id: 'escalate', label: 'Escalate', icon: '▲' },
]

export const TOOLS = [
  { id: 'directory', label: 'Directory', icon: '☰' },
  { id: 'ticket', label: 'Ticket', icon: '✉' },
  { id: 'callback', label: 'Call back', icon: '☎' },
]

const ERROR_MESSAGES = {
  SOC_SHIFT_NOT_FOUND: 'Shift expired. Start again.',
  SOC_CALL_RESOLVED: 'Call is over.',
  SOC_CALL_OPEN: 'Decide first.',
  SOC_SHIFT_FINISHED: 'Shift is over.',
  SOC_SHIFT_NOT_FINISHED: 'Finish every call first.',
  SOC_MESSAGE_LIMIT: 'No messages left.',
  SOC_COLLEAGUE_LIMIT: 'No colleague asks left.',
  SOC_HINT_LIMIT: 'No hints left.',
  SOC_BUSY: 'Wait for the reply.',
  SOC_RATE_LIMITED: 'Too fast. Wait a moment.',
}

// every post is state-changing, so each carries a fresh csrf token
async function post(path, body, timeout = 20000) {
  const token = await requestCsrfToken()
  const { data } = await api.post(`${BASE}/${path}`, body, {
    timeout,
    headers: { 'X-CSRF-Token': token },
  })
  return data
}

export const startShift = (context) => post('start', { context })
export const sendMessage = (shiftId, content) => post('message', { shiftId, content }, 45000)
export const askColleague = (shiftId, content) => post('colleague', { shiftId, content }, 45000)
export const useDeskTool = (shiftId, tool) => post('tool', { shiftId, tool })
export const requestHint = (shiftId) => post('hint', { shiftId })
export const decide = (shiftId, decision) => post('decide', { shiftId, decision })
export const nextCall = (shiftId) => post('next', { shiftId })
export const completeShift = (shiftId) => post('complete', { shiftId })

export function isShiftGone(error) {
  return error?.response?.data?.error?.code === 'SOC_SHIFT_NOT_FOUND'
}

export function simulatorErrorMessage(error, fallback = 'Something went wrong.') {
  if (error?.response?.status === 401) return 'Signed out. Sign in again.'
  const code = error?.response?.data?.error?.code
  return ERROR_MESSAGES[code] ?? fallback
}
