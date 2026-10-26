import { api } from '../../services/api.js'

export function leaderboardErrorMessage(error) {
  const status = Number.isInteger(error?.response?.status)
    ? error.response.status
    : Number.isInteger(error?.status)
      ? error.status
      : 0
  if (status === 401) return 'Your session has ended. Sign in again to see the leaderboard.'
  if (status === 404) return "This class's leaderboard is not available."
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'Sharlock is temporarily unavailable. Try again shortly.'
  if (status === 0) return 'We could not reach Sharlock. Check your connection and try again.'
  return 'The leaderboard could not be loaded. Try again.'
}

export async function getLeaderboardGames(cohortId, { signal } = {}) {
  const response = await api.get(`/cohorts/${encodeURIComponent(cohortId)}/leaderboard/games`, {
    signal,
  })
  return response.data
}

export async function getLeaderboard(cohortId, { gameId, view = 'best', page = 1, signal } = {}) {
  const response = await api.get(`/cohorts/${encodeURIComponent(cohortId)}/leaderboard`, {
    params: { gameId, view, page: String(page) },
    signal,
  })
  return response.data
}
