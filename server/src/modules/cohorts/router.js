import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { getPendingInvitation, clearPendingInvitation } from './invitation-session.js'
import { CohortError, parseListQuery } from './policy.js'
import { createCohortService } from './service.js'

function sendCohortError(error, _request, response, next) {
  if (error instanceof AuthError) {
    const safeErrors = {
      AUTHENTICATION_REQUIRED: [401, 'Sign in to continue.'],
      CAPABILITY_FORBIDDEN: [403, 'This action is unavailable.'],
      CSRF_INVALID: [403, 'Refresh the security token and try again.'],
      ORIGIN_FORBIDDEN: [403, 'This request came from an untrusted origin.'],
    }
    const safeError = safeErrors[error.code]
    if (safeError) {
      response.set('Cache-Control', 'no-store')
      response.status(safeError[0]).json({
        error: { code: error.code, message: safeError[1] },
        requestId: response.locals.requestId,
      })
      return
    }
  }
  if (!(error instanceof CohortError)) {
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

function createLimiter({ windowMs, limit, message, perUser = false }) {
  const store = new MemoryStore()
  const options = {
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message },
        requestId: response.locals.requestId,
      })
    },
  }
  if (perUser) options.keyGenerator = (request) => `user:${request.session.userId}`
  else options.ipv6Subnet = 56
  const middleware = rateLimit(options)
  return { middleware, store }
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()))
  })
}

export function createCohortRouter(
  database,
  {
    requireSession,
    requireMutation,
    now,
    clientOrigin,
    recordAuditEvent,
    onMembershipChanged,
  } = {},
) {
  const sessionMiddleware = requireMiddlewareArray(requireSession, 'session')
  const mutationMiddleware = requireMiddlewareArray(requireMutation, 'mutation')
  const service = createCohortService(database, {
    now,
    clientOrigin,
    recordAuditEvent,
    onMembershipChanged,
  })
  const router = Router()
  const joinUser = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many class requests. Please try again later.',
    perUser: true,
  })
  const joinIp = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: 'Too many class requests. Please try again later.',
  })
  const codeUser = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message: 'Too many class code changes. Please try again later.',
    perUser: true,
  })
  const codeIp = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    message: 'Too many class code changes. Please try again later.',
  })
  const staffUser = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: 'Too many class changes. Please try again later.',
    perUser: true,
  })
  const staffIp = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: 'Too many class changes. Please try again later.',
  })
  const noStore = (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  }

  router.get('/me/memberships', noStore, ...sessionMiddleware, async (request, response, next) => {
    try {
      const result = await service.listMemberships(
        response.locals.authUser,
        parseListQuery(request.query),
      )
      response.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get(
    '/me/teaching-assignments',
    noStore,
    ...sessionMiddleware,
    async (request, response, next) => {
      try {
        const result = await service.listTeachingAssignments(
          response.locals.authUser,
          parseListQuery(request.query),
        )
        response.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/me/enrollment', noStore, ...sessionMiddleware, async (request, response, next) => {
    try {
      const result = await service.getEnrollment(response.locals.authUser, request.query)
      response.json({ ...result, hasInvitation: Boolean(getPendingInvitation(request, now)) })
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/me/enrollment/onboarding',
    noStore,
    ...sessionMiddleware,
    staffUser.middleware,
    staffIp.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        await service.completeOnboarding(response.locals.authUser, request.body, request.query)
        response.status(204).end()
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/cohorts/join-requests',
    noStore,
    ...sessionMiddleware,
    joinUser.middleware,
    joinIp.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        const invitationHash = getPendingInvitation(request, now)
        const result = await service.join(response.locals.authUser, request.body, {
          invitationHash,
          query: request.query,
        })
        if (invitationHash) {
          clearPendingInvitation(request)
          await saveSession(request)
        }
        response.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/cohorts/managed', noStore, ...sessionMiddleware, async (request, response, next) => {
    try {
      response.json(await service.listManaged(response.locals.authUser, request.query))
    } catch (error) {
      next(error)
    }
  })

  router.get(
    '/cohorts/:cohortId/memberships',
    noStore,
    ...sessionMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.listMembers(
            response.locals.authUser,
            request.params.cohortId,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/cohorts/:cohortId/memberships/:membershipId',
    noStore,
    ...sessionMiddleware,
    staffUser.middleware,
    staffIp.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.decide(
            response.locals.authUser,
            request.params.cohortId,
            request.params.membershipId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.get(
    '/cohorts/:cohortId/enrollment-codes',
    noStore,
    ...sessionMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.getCode(response.locals.authUser, request.params.cohortId, request.query),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/cohorts/:cohortId/enrollment-codes',
    noStore,
    ...sessionMiddleware,
    codeUser.middleware,
    codeIp.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response
          .status(201)
          .json(
            await service.issueCode(
              response.locals.authUser,
              request.params.cohortId,
              request.body,
              request.query,
            ),
          )
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete(
    '/cohorts/:cohortId/enrollment-codes/:codeId',
    noStore,
    ...sessionMiddleware,
    staffUser.middleware,
    staffIp.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.revokeCode(
            response.locals.authUser,
            request.params.cohortId,
            request.params.codeId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.use(sendCohortError)
  router.dispose = () => {
    for (const limiter of [joinUser, joinIp, codeUser, codeIp, staffUser, staffIp])
      limiter.store.shutdown()
  }
  return router
}
