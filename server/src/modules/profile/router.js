import { Router } from 'express'
import { AuthError } from '../auth/policy.js'
import {
  ProfileError,
  parseHowToPlayInput,
  parseProfileQuery,
  parseProfileUpdateInput,
} from './policy.js'
import { createProfileService } from './service.js'

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

function requestActor(request, response) {
  return {
    id: response.locals.authUser?.id,
    authVersion: request.session?.authVersion,
  }
}

function sendProfileError(error, _request, response, next) {
  if (error instanceof AuthError) {
    const safeErrors = {
      AUTHENTICATION_REQUIRED: [401, 'Sign in to continue.'],
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

export function createProfileRouter(database, { requireSession, requireMutation } = {}) {
  const sessionMiddleware = requireMiddlewareArray(requireSession, 'session')
  const mutationMiddleware = requireMiddlewareArray(requireMutation, 'mutation')
  const service = createProfileService(database)
  const router = Router()

  router.get('/me/profile', ...sessionMiddleware, async (request, response, next) => {
    try {
      parseProfileQuery(request.query)
      response.json(await service.getProfile(requestActor(request, response)))
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/me/profile',
    ...sessionMiddleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        parseProfileQuery(request.query)
        const input = parseProfileUpdateInput(request.body)
        response.json(await service.updateProfile(requestActor(request, response), input))
      } catch (error) {
        next(error)
      }
    },
  )

  router.put(
    '/me/how-to-play/:gameId',
    ...sessionMiddleware,
    ...mutationMiddleware,
    async (request, response, next) => {
      try {
        parseProfileQuery(request.query)
        const input = parseHowToPlayInput(request.params.gameId, request.body)
        response.set('Cache-Control', 'no-store')
        response.json(await service.setHowToPlayDismissed(requestActor(request, response), input))
      } catch (error) {
        next(error)
      }
    },
  )

  router.use(sendProfileError)
  return router
}
