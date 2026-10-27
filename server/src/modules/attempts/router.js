import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { CohortError } from '../cohorts/policy.js'
import { AttemptError } from './policy.js'
import { createAttemptRegistry } from './registry.js'
import { createAttemptService } from './service.js'
import { createContextService } from '../../services/context.js'
import { parsePagination } from '../cohorts/policy.js'
import { assertEmptyQuery } from './policy.js'

const authMessages = {
  AUTHENTICATION_REQUIRED: [401, 'Sign in to continue.'],
  CAPABILITY_FORBIDDEN: [403, 'This action is unavailable.'],
  CSRF_INVALID: [403, 'Refresh the security token and try again.'],
  ORIGIN_FORBIDDEN: [403, 'This request came from an untrusted origin.'],
}

function requireMiddlewareArray(middleware, name) {
  if (
    !Array.isArray(middleware) ||
    middleware.length === 0 ||
    middleware.some((item) => typeof item !== 'function')
  ) {
    throw new TypeError(`A ${name} middleware array is required.`)
  }
  return middleware
}

function createLimiter({ windowMs, limit, retryAfterSeconds, perUser = false }) {
  const store = new MemoryStore()
  const options = {
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', String(retryAfterSeconds))
      response.status(429).json({
        error: {
          code: 'ATTEMPT_RATE_LIMITED',
          message: 'Too many saved-attempt requests. Please try again later.',
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
  let status
  let code
  let message
  let fieldErrors

  if (error instanceof AttemptError) {
    status = error.status
    code = error.code
    message = error.message
    fieldErrors = error.fieldErrors
  } else if (error instanceof AuthError) {
    const safeError = Object.hasOwn(authMessages, error.code) ? authMessages[error.code] : null
    if (safeError) [status, message] = safeError
    code = error.code
  } else if (error instanceof CohortError) {
    status = error.status
    code = error.code
    message = error.message
    fieldErrors = error.fieldErrors
  } else {
    status = 503
    code = 'ATTEMPT_UNAVAILABLE'
    message = 'Saved attempts are temporarily unavailable.'
  }

  if (!status) {
    status = 503
    code = 'ATTEMPT_UNAVAILABLE'
    message = 'Saved attempts are temporarily unavailable.'
    fieldErrors = undefined
  }

  response.set('Cache-Control', 'no-store')
  response.status(status).json({
    error: {
      code,
      message,
      ...(fieldErrors && { fieldErrors }),
    },
    requestId: response.locals.requestId,
  })
}

function createHandler(callback) {
  return async (request, response) => {
    try {
      const result = await callback(request, response)
      response.json(result)
    } catch (error) {
      sendError(error, response)
    }
  }
}

// per-ip starts allow a whole class behind one school address; per-user limits still bound abuse
export const DEFAULT_ATTEMPT_LIMITS = Object.freeze({
  startUser: 30,
  startIp: 300,
  actionUser: 120,
  actionIp: 240,
  readUser: 240,
  readIp: 480,
})

export function createAttemptRouter(
  database,
  { requireSession, requireMutation, now, registry = createAttemptRegistry(), limits = {} } = {},
) {
  const limit = { ...DEFAULT_ATTEMPT_LIMITS, ...limits }
  const sessionMiddleware = requireMiddlewareArray(requireSession, 'session')
  const mutationMiddleware = requireMiddlewareArray(requireMutation, 'mutation')
  const service = createAttemptService(database, { registry, now })
  const router = Router()
  const startUser = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: limit.startUser,
    retryAfterSeconds: 900,
    perUser: true,
  })
  const startIp = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: limit.startIp,
    retryAfterSeconds: 900,
  })
  const actionUser = createLimiter({
    windowMs: 60 * 1000,
    limit: limit.actionUser,
    retryAfterSeconds: 60,
    perUser: true,
  })
  const actionIp = createLimiter({
    windowMs: 60 * 1000,
    limit: limit.actionIp,
    retryAfterSeconds: 60,
  })
  const readUser = createLimiter({
    windowMs: 60 * 1000,
    limit: limit.readUser,
    retryAfterSeconds: 60,
    perUser: true,
  })
  const readIp = createLimiter({
    windowMs: 60 * 1000,
    limit: limit.readIp,
    retryAfterSeconds: 60,
  })
  const noStore = (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  }
  // express recognizes error handlers by their four-argument signature
  // eslint-disable-next-line no-unused-vars
  const routeErrorHandler = (error, _request, response, _next) => {
    sendError(error, response)
  }

  router.get(
    '/attempt-contexts',
    noStore,
    ...sessionMiddleware,
    readUser.middleware,
    readIp.middleware,
    createHandler((request, response) => {
      const { page, limit, ...unknown } = request.query
      assertEmptyQuery(unknown)
      if (
        [page, limit].some(
          (value) =>
            value !== undefined && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)),
        )
      ) {
        throw new AttemptError('ATTEMPT_INVALID_REQUEST', 'Use valid pagination values.', 400)
      }
      const pagination = parsePagination({
        page: page === undefined ? 1 : Number(page),
        limit: limit === undefined ? 20 : Number(limit),
      })
      return createContextService(database).listEligibleContexts(
        response.locals.authUser,
        pagination,
      )
    }),
    routeErrorHandler,
  )

  router.post(
    '/games/:gameId/attempts',
    noStore,
    ...sessionMiddleware,
    startUser.middleware,
    startIp.middleware,
    ...mutationMiddleware,
    createHandler(async (request, response) => {
      const result = await service.startAttempt(
        response.locals.authUser,
        request.params.gameId,
        request.body,
        request.query,
      )
      response.status(201)
      return result
    }),
    routeErrorHandler,
  )

  router.get(
    '/attempts/:attemptId',
    noStore,
    ...sessionMiddleware,
    readUser.middleware,
    readIp.middleware,
    createHandler((request, response) =>
      service.getAttempt(response.locals.authUser, request.params.attemptId, request.query),
    ),
    routeErrorHandler,
  )

  router.post(
    '/attempts/:attemptId/actions',
    noStore,
    ...sessionMiddleware,
    actionUser.middleware,
    actionIp.middleware,
    ...mutationMiddleware,
    createHandler((request, response) =>
      service.applyAction(
        response.locals.authUser,
        request.params.attemptId,
        request.body,
        request.query,
      ),
    ),
    routeErrorHandler,
  )

  router.post(
    '/attempts/:attemptId/complete',
    noStore,
    ...sessionMiddleware,
    actionUser.middleware,
    actionIp.middleware,
    ...mutationMiddleware,
    createHandler((request, response) =>
      service.completeAttempt(
        response.locals.authUser,
        request.params.attemptId,
        request.body,
        request.query,
      ),
    ),
    routeErrorHandler,
  )

  router.dispose = () => {
    for (const limiter of [startUser, startIp, actionUser, actionIp, readUser, readIp])
      limiter.store.shutdown()
  }
  return router
}
