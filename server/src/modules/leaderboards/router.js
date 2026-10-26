import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { CohortError } from '../cohorts/policy.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { LeaderboardError, parseBoardQuery, parseGamesQuery } from './policy.js'
import { createLeaderboardService } from './service.js'

function requireMiddlewareArray(middleware) {
  if (
    !Array.isArray(middleware) ||
    middleware.length === 0 ||
    middleware.some((item) => typeof item !== 'function')
  ) {
    throw new TypeError('A session middleware array is required.')
  }
  return middleware
}

function createLimiter({ limit, perUser = false }) {
  const store = new MemoryStore()
  const options = {
    windowMs: 60 * 1000,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({
        error: {
          code: 'LEADERBOARD_RATE_LIMITED',
          message: 'Too many leaderboard requests. Please try again later.',
        },
        requestId: response.locals.requestId,
      })
    },
  }
  if (perUser) options.keyGenerator = (request) => `user:${request.session.userId}`
  else options.ipv6Subnet = 56
  return { middleware: rateLimit(options), store }
}

function sendError(error, response) {
  let status = 503
  let code = 'LEADERBOARD_UNAVAILABLE'
  let message = 'Leaderboards are temporarily unavailable.'
  if (error instanceof LeaderboardError) {
    ;({ status, code, message } = error)
  } else if (error instanceof AuthError && error.code === 'AUTHENTICATION_REQUIRED') {
    status = 401
    code = error.code
    message = 'Sign in to continue.'
  } else if (error instanceof CohortError && [401, 404].includes(error.status)) {
    ;({ status, code, message } = error)
  }
  response.set('Cache-Control', 'no-store')
  response.status(status).json({ error: { code, message }, requestId: response.locals.requestId })
}

export function createLeaderboardRouter(
  database,
  { requireSession, registry = createAttemptRegistry() } = {},
) {
  const sessionMiddleware = requireMiddlewareArray(requireSession)
  const service = createLeaderboardService(database, { registry })
  const router = Router()
  const readUser = createLimiter({ limit: 120, perUser: true })
  const readIp = createLimiter({ limit: 240 })
  const noStore = (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  }
  // express recognizes error handlers by their four-argument signature
  // eslint-disable-next-line no-unused-vars
  const routeErrorHandler = (error, _request, response, _next) => sendError(error, response)
  const guards = [noStore, ...sessionMiddleware, readUser.middleware, readIp.middleware]
  const actorOf = (response) => ({ id: response.locals.authUser.id })

  router.get(
    '/cohorts/:cohortId/leaderboard/games',
    ...guards,
    async (request, response) => {
      try {
        parseGamesQuery(request.query)
        response.json(await service.listGames(actorOf(response), request.params.cohortId))
      } catch (error) {
        sendError(error, response)
      }
    },
    routeErrorHandler,
  )

  router.get(
    '/cohorts/:cohortId/leaderboard',
    ...guards,
    async (request, response) => {
      try {
        const options = parseBoardQuery(request.query)
        response.json(await service.getBoard(actorOf(response), request.params.cohortId, options))
      } catch (error) {
        sendError(error, response)
      }
    },
    routeErrorHandler,
  )

  router.dispose = () => {
    for (const limiter of [readUser, readIp]) limiter.store.shutdown()
  }
  return router
}
