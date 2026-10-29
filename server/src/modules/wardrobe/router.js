import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { ProfileError, parseProfileQuery } from '../profile/policy.js'
import { parseWardrobeInput } from './policy.js'
import { createWardrobeService } from './service.js'

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

function createLimiter(limit) {
  const store = new MemoryStore()
  const middleware = rateLimit({
    windowMs: 60 * 1000,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (request) => `user:${request.session.userId}`,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({
        error: {
          code: 'WARDROBE_RATE_LIMITED',
          message: 'Too many wardrobe requests. Please try again later.',
        },
        requestId: response.locals.requestId,
      })
    },
  })
  return { middleware, store }
}

const safeAuthErrors = {
  AUTHENTICATION_REQUIRED: [401, 'Sign in to continue.'],
  CSRF_INVALID: [403, 'Refresh the security token and try again.'],
  ORIGIN_FORBIDDEN: [403, 'This request came from an untrusted origin.'],
}

function sendWardrobeError(error, _request, response, next) {
  if (error instanceof AuthError && safeAuthErrors[error.code]) {
    const [status, message] = safeAuthErrors[error.code]
    response.set('Cache-Control', 'no-store')
    response
      .status(status)
      .json({ error: { code: error.code, message }, requestId: response.locals.requestId })
    return
  }
  if (!(error instanceof ProfileError)) {
    next(error)
    return
  }
  response.set('Cache-Control', 'no-store')
  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
    },
    requestId: response.locals.requestId,
  })
}

export function createWardrobeRouter(
  database,
  { requireSession, requireMutation, registry = createAttemptRegistry(), now } = {},
) {
  const sessionMiddleware = requireMiddlewareArray(requireSession, 'session')
  const mutationMiddleware = requireMiddlewareArray(requireMutation, 'mutation')
  const service = createWardrobeService(database, { registry, now })
  const limiter = createLimiter(60)
  const router = Router()
  const actorOf = (request, response) => ({
    id: response.locals.authUser?.id,
    authVersion: request.session?.authVersion,
  })

  router.get(
    '/me/wardrobe',
    ...sessionMiddleware,
    limiter.middleware,
    async (request, response, next) => {
      try {
        parseProfileQuery(request.query)
        response.set('Cache-Control', 'no-store')
        response.json(await service.getWardrobe(actorOf(request, response)))
      } catch (error) {
        next(error)
      }
    },
  )

  router.put(
    '/me/wardrobe/:slot',
    ...sessionMiddleware,
    ...mutationMiddleware,
    limiter.middleware,
    async (request, response, next) => {
      try {
        parseProfileQuery(request.query)
        const input = parseWardrobeInput(request.params.slot, request.body)
        response.set('Cache-Control', 'no-store')
        response.json(await service.equip(actorOf(request, response), input))
      } catch (error) {
        next(error)
      }
    },
  )

  router.use(sendWardrobeError)
  router.dispose = () => limiter.store.shutdown()
  return router
}
