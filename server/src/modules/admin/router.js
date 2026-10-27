import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { AuthError } from '../auth/policy.js'
import { CohortError } from '../cohorts/policy.js'
import { AdminError } from './policy.js'
import { createAdminService } from './service.js'

const ACCESS_ERRORS = Object.freeze({
  AUTHENTICATION_REQUIRED: { status: 401, message: 'Sign in to continue.' },
  CAPABILITY_FORBIDDEN: { status: 403, message: 'This action is unavailable.' },
  CSRF_INVALID: { status: 403, message: 'Refresh the security token and try again.' },
  ORIGIN_FORBIDDEN: { status: 403, message: 'This request came from an untrusted origin.' },
})

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

function createWriteLimiter({ windowMs, limit, message }) {
  const store = new MemoryStore()
  const middleware = rateLimit({
    windowMs,
    limit,
    store,
    ipv6Subnet: 56,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message },
        requestId: response.locals.requestId,
      })
    },
  })
  return { middleware, store }
}

function sendAdminError(error, _request, response, next) {
  if (error instanceof AdminError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
      },
      requestId: response.locals.requestId,
    })
    return
  }
  if (error instanceof AuthError || error instanceof CohortError) {
    const safeError = ACCESS_ERRORS[error.code]
    if (safeError) {
      response.status(safeError.status).json({
        error: { code: error.code, message: safeError.message },
        requestId: response.locals.requestId,
      })
      return
    }
  }
  next(error)
}

export function createAdminRouter(
  database,
  { requireSession, requireMutation, now, clientOrigin, recordAuditEvent, activationService } = {},
) {
  const sessionMiddleware = requireMiddlewareArray(requireSession, 'session')
  const mutationMiddleware = requireMiddlewareArray(requireMutation, 'mutation')
  const service = createAdminService(database, {
    now,
    clientOrigin,
    recordAuditEvent,
    activationService,
  })
  const router = Router()
  const ordinaryWrites = createWriteLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: 'Too many changes. Please try again later.',
  })
  const activationWrites = createWriteLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message: 'Too many instructor account requests. Please try again later.',
  })

  router.get('/admin/users', ...sessionMiddleware, async (request, response, next) => {
    try {
      response.json(await service.listUsers(response.locals.authUser, request.query))
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/admin/users/:userId',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.updateUserStatus(
            response.locals.authUser,
            request.params.userId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/admin/institutions', ...sessionMiddleware, async (request, response, next) => {
    try {
      response.json(await service.listInstitutions(response.locals.authUser, request.query))
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/admin/institutions',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response
          .status(201)
          .json(
            await service.createInstitution(response.locals.authUser, request.body, request.query),
          )
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/admin/institutions/:institutionId',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.updateInstitution(
            response.locals.authUser,
            request.params.institutionId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/admin/cohorts', ...sessionMiddleware, async (request, response, next) => {
    try {
      response.json(await service.listCohorts(response.locals.authUser, request.query))
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/admin/cohorts',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response
          .status(201)
          .json(await service.createCohort(response.locals.authUser, request.body, request.query))
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/admin/cohorts/:cohortId',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.updateCohort(
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

  router.get('/admin/instructors', ...sessionMiddleware, async (request, response, next) => {
    try {
      response.json(await service.listInstructors(response.locals.authUser, request.query))
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/admin/instructors',
    ...sessionMiddleware,
    activationWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response
          .status(201)
          .json(
            await service.provisionInstructor(
              response.locals.authUser,
              request.body,
              request.query,
            ),
          )
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/administrators',
    ...sessionMiddleware,
    activationWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response
          .status(201)
          .json(
            await service.provisionAdministrator(
              response.locals.authUser,
              request.body,
              request.query,
            ),
          )
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/instructors/:userId/activation',
    ...sessionMiddleware,
    activationWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.reissueActivation(
            response.locals.authUser,
            request.params.userId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.put(
    '/admin/instructors/:userId/assignments',
    ...sessionMiddleware,
    ordinaryWrites.middleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        response.json(
          await service.setAssignments(
            response.locals.authUser,
            request.params.userId,
            request.body,
            request.query,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.use(sendAdminError)
  router.dispose = () => {
    ordinaryWrites.store.shutdown()
    activationWrites.store.shutdown()
  }
  return router
}
