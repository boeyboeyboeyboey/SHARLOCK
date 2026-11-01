import { Router } from 'express'
import { AuthError, parseEmptyQuery } from '../auth/policy.js'
import { rateLimitResponse } from '../auth/rate-limits.js'
import { CohortError } from '../cohorts/policy.js'
import {
  ActivationError,
  parseStudentRecoveryIssue,
  parseStudentRecoveryLookup,
  recoveryObjectId,
  StudentRecoveryError,
} from './policy.js'
import { createRecoveryService } from './service.js'

export function createActivationRouter(database, { requireMutation, ...settings }) {
  const service = createRecoveryService(database, settings)
  const router = Router()
  router.post('/activate-account', ...requireMutation, async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      await service.activateAccount(request.body, { requestId: response.locals.requestId })
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  router.use((error, _request, response, next) => {
    if (!(error instanceof ActivationError)) {
      next(error)
      return
    }
    response.status(error.status).json({
      error: { code: error.code, message: error.message },
      requestId: response.locals.requestId,
    })
  })
  return router
}

// express requires four arguments for route error handling
// eslint-disable-next-line no-unused-vars
function recoveryError(error, request, response, _next) {
  if (error instanceof AuthError && error.status === 429) {
    rateLimitResponse(request, response, error)
    return
  }
  if (
    error instanceof StudentRecoveryError ||
    error instanceof AuthError ||
    error instanceof CohortError
  ) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message:
          error instanceof StudentRecoveryError || error.status !== 400
            ? error.message
            : 'Check the recovery request and try again.',
      },
      requestId: response.locals.requestId,
    })
    return
  }
  const failure = new StudentRecoveryError('RECOVERY_FAILED', 503)
  response.status(failure.status).json({
    error: { code: failure.code, message: failure.message },
    requestId: response.locals.requestId,
  })
}

function prepareStaffRequest(kind) {
  return (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      const roles = response.locals.authUser.globalRoles
      const eligible =
        kind === 'instructor'
          ? roles.includes('instructor') && !roles.includes('admin')
          : roles.includes('admin')
      if (!eligible) throw new StudentRecoveryError('RECOVERY_FORBIDDEN', 403)
      if (kind === 'lookup') {
        parseStudentRecoveryLookup(request.body)
      } else {
        parseStudentRecoveryIssue(request.body)
        recoveryObjectId(request.params.studentId || request.params.userId)
        if (kind === 'instructor') recoveryObjectId(request.params.cohortId)
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function createRecoveryRouter(
  database,
  {
    requireSession,
    requireMutation,
    recoveryIssueStaff,
    recoveryLookup,
    consumeStudentIssueLimit,
    now,
    clientOrigin,
  },
) {
  const service = createRecoveryService(database, { now, clientOrigin, consumeStudentIssueLimit })
  const router = Router()
  const noStore = (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  }
  router.post(
    '/admin/recovery/lookup',
    noStore,
    ...requireSession,
    ...requireMutation,
    prepareStaffRequest('lookup'),
    recoveryLookup,
    async (request, response, next) => {
      try {
        response.json(await service.lookupStudent(response.locals.authUser, request.body))
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/cohorts/:cohortId/students/:studentId/recovery',
    noStore,
    ...requireSession,
    ...requireMutation,
    prepareStaffRequest('instructor'),
    recoveryIssueStaff,
    async (request, response, next) => {
      try {
        response.json(
          await service.issueInstructorStudentReset(
            response.locals.authUser,
            request.params.cohortId,
            request.params.studentId,
            request.body,
            { requestId: response.locals.requestId },
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/admin/users/:userId/recovery',
    noStore,
    ...requireSession,
    ...requireMutation,
    prepareStaffRequest('admin'),
    recoveryIssueStaff,
    async (request, response, next) => {
      try {
        response.json(
          await service.issueAdminStudentReset(
            response.locals.authUser,
            request.params.userId,
            request.body,
            { requestId: response.locals.requestId },
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  router.use(recoveryError)
  return router
}
