import { Types } from 'mongoose'

export class LeaderboardError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const MAX_PAGE = 10000
export const VIEWS = ['best', 'all-time']

const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RULESET_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export function invalidRequest() {
  return new LeaderboardError(
    'LEADERBOARD_INVALID_REQUEST',
    'Check the request fields and try again.',
    400,
  )
}

export function classUnavailable() {
  return new LeaderboardError('COHORT_NOT_FOUND', 'This class is unavailable.', 404)
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

export function parseGamesQuery(query) {
  if (Object.keys(query).length > 0) throw invalidRequest()
}

export function parseBoardQuery(query) {
  const { gameId, rulesetVersion, view = 'best', page, ...unknown } = query
  if (Object.keys(unknown).length > 0) throw invalidRequest()
  if (typeof gameId !== 'string' || !GAME_ID_PATTERN.test(gameId) || gameId.length > 64) {
    throw invalidRequest()
  }
  if (
    rulesetVersion !== undefined &&
    (typeof rulesetVersion !== 'string' || !RULESET_PATTERN.test(rulesetVersion))
  ) {
    throw invalidRequest()
  }
  if (typeof view !== 'string' || !VIEWS.includes(view)) throw invalidRequest()
  return { gameId, rulesetVersion, view, page: parsePage(page) }
}
