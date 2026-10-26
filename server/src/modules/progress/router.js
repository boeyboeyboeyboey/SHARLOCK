import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { createProgressService } from './service.js'

class ProgressError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

const MAX_PAGE = 10000

function invalidRequest() {
  return new ProgressError(
    'PROGRESS_INVALID_REQUEST',
    'Check the request fields and try again.',
    400,
  )
}

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
          code: 'PROGRESS_RATE_LIMITED',
          message: 'Too many progress requests. Please try again later.',
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
  let code = 'PROGRESS_UNAVAILABLE'
  let message = 'Progress is temporarily unavailable.'
  if (error instanceof ProgressError) {
    ;({ status, code, message } = error)
  } else if (error instanceof AuthError && error.code === 'AUTHENTICATION_REQUIRED') {
    status = 401
    code = error.code
    message = 'Sign in to continue.'
  }
  response.set('Cache-Control', 'no-store')
  response.status(status).json({ error: { code, message }, requestId: response.locals.requestId })
}

function parseHistoryQuery(query, savingGameIds) {
  const { gameId, page, ...unknown } = query
  if (Object.keys(unknown).length > 0) throw invalidRequest()
  if (gameId !== undefined && (typeof gameId !== 'string' || !savingGameIds.includes(gameId))) {
    throw invalidRequest()
  }
  if (page !== undefined && (typeof page !== 'string' || !/^[1-9]\d{0,4}$/.test(page))) {
    throw invalidRequest()
  }
  const pageNumber = page === undefined ? 1 : Number(page)
  if (pageNumber > MAX_PAGE) throw invalidRequest()
  return { gameId, page: pageNumber }
}

export function createProgressRouter(
  database,
  { requireSession, now, registry = createAttemptRegistry() } = {},
) {
  const sessionMiddleware = requireMiddlewareArray(requireSession)
  const service = createProgressService(database, { registry, now })
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

  router.get(
    '/me/progress',
    ...guards,
    async (request, response) => {
      try {
        if (Object.keys(request.query).length > 0) throw invalidRequest()
        response.json(await service.getProgress(response.locals.authUser.id))
      } catch (error) {
        sendError(error, response)
      }
    },
    routeErrorHandler,
  )

  router.get(
    '/me/attempts',
    ...guards,
    async (request, response) => {
      try {
        const options = parseHistoryQuery(request.query, service.savingGameIds)
        response.json(await service.listHistory(response.locals.authUser.id, options))
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
