import { api } from '../../services/api.js'

export function progressErrorMessage(error) {
  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  if (status === 401) return 'Your session has ended. Sign in again to see your progress.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'Sharlock is temporarily unavailable. Try again shortly.'
  if (status === 0) return 'We could not reach Sharlock. Check your connection and try again.'
  return 'Your progress could not be loaded. Try again.'
}

export async function getProgress({ signal } = {}) {
  const response = await api.get('/me/progress', { signal })
  return response.data
}

export async function listAttempts({ gameId, page = 1, signal } = {}) {
  const params = { page: String(page) }
  if (gameId) params.gameId = gameId
  const response = await api.get('/me/attempts', { params, signal })
  return response.data
}
