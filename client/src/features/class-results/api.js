import { api } from '../../services/api.js'

export function resultsErrorMessage(error) {
  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  if (status === 401) return 'Your session has ended. Sign in again to see class results.'
  if (status === 404) return "This class's results are not available."
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'Sharlock is temporarily unavailable. Try again shortly.'
  if (status === 0) return 'We could not reach Sharlock. Check your connection and try again.'
  return 'Class results could not be loaded. Try again.'
}

export function isNotAvailable(error) {
  return error?.response?.status === 404
}

export async function getClassResults(cohortId, { page = 1, signal } = {}) {
  const response = await api.get(`/cohorts/${encodeURIComponent(cohortId)}/results`, {
    params: { page: String(page) },
    signal,
  })
  return response.data
}

export async function getStudentAttempts(cohortId, studentId, { gameId, page = 1, signal } = {}) {
  const params = { page: String(page) }
  if (gameId) params.gameId = gameId
  const response = await api.get(
    `/cohorts/${encodeURIComponent(cohortId)}/students/${encodeURIComponent(studentId)}/attempts`,
    { params, signal },
  )
  return response.data
}
