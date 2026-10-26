import { Types } from 'mongoose'

export class ClassResultsError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const MAX_PAGE = 10000

export function invalidRequest() {
  return new ClassResultsError(
    'CLASS_RESULTS_INVALID_REQUEST',
    'Check the request fields and try again.',
    400,
  )
}

export function classUnavailable() {
  return new ClassResultsError('COHORT_NOT_FOUND', 'This class is unavailable.', 404)
}

// malformed ids get the same 404 as unknown ones so ids cannot be probed
export function parseRouteId(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-f\d]{24}$/i.test(value) ||
    !Types.ObjectId.isValid(value)
  ) {
    throw classUnavailable()
  }
  return value.toLowerCase()
}

function parsePage(page) {
  if (page === undefined) return 1
  if (typeof page !== 'string' || !/^[1-9]\d{0,4}$/.test(page)) throw invalidRequest()
  const number = Number(page)
  if (number > MAX_PAGE) throw invalidRequest()
  return number
}

export function parseSummaryQuery(query) {
  const { page, ...unknown } = query
  if (Object.keys(unknown).length > 0) throw invalidRequest()
  return { page: parsePage(page) }
}

export function parseAttemptsQuery(query, gameIds) {
  const { gameId, page, ...unknown } = query
  if (Object.keys(unknown).length > 0) throw invalidRequest()
  if (gameId !== undefined && (typeof gameId !== 'string' || !gameIds.includes(gameId))) {
    throw invalidRequest()
  }
  return { gameId, page: parsePage(page) }
}
