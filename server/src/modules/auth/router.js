import { ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { Router } from 'express'
import { createCsrfTools, requireExpectedOrigin } from './csrf.js'
import { createRateLimits, rateLimitResponse } from './rate-limits.js'
import {
  AuthError,
  parseEmptyInput,
  parseEmptyQuery,
  parseLoginInput,
  parseRegistrationInput,
} from './policy.js'
import { createAuthService } from './service.js'
import { createVerificationService } from './verification-service.js'
import { notPendingError, parseVerificationInput } from './verification.js'
import { createConsoleMailer } from './mailer.js'
import { createProtectedSessionAccess, loadSessionActor } from './access.js'
import { createActivationRouter } from '../recovery/router.js'
import { createRecoveryService } from '../recovery/service.js'
import { parseStudentPasswordResetInput, StudentRecoveryError } from '../recovery/policy.js'
import { CohortError, hashEnrollmentCode } from '../cohorts/policy.js'
import {
  capturePendingInvitation,
  clearPendingInvitation,
  pendingInvitationValues,
} from '../cohorts/invitation-session.js'
import {
  clearSessionCookie,
  createAnonymousSessionValues,
  createAuthenticatedSessionValues,
  createAuthSessionMiddleware,
  createPendingVerificationSessionValues,
  destroySession,
  rotateSession,
  saveSession,
  sessionIsExpired,
  setSessionCookieLifetime,
} from './session.js'

function sendUnauthorized(request, response) {
  response.status(401).json({
    error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' },
    requestId: response.locals.requestId,
  })
}

function sendUser(response, user, csrfToken) {
  response.status(200).json({ user, csrfToken })
}

function requestError(error, _request, response, next) {
  if (
    !(error instanceof AuthError) &&
    !(error instanceof CohortError) &&
    !(error instanceof StudentRecoveryError)
  ) {
    next(error)
    return
  }

  if (error.status === 429) {
    rateLimitResponse(_request, response, error)
    return
  }

  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
    },
    requestId: response.locals.requestId,
  })
}

// the account is created unverified and the browser holds only an anonymous session that
// remembers which account is waiting for its code. No authenticated session exists until the
// code is confirmed.
async function startPendingVerificationSession(request, response, csrf, authSettings, userId) {
  const invitation = pendingInvitationValues(request, authSettings.now)
  await rotateSession(request, {
    ...createPendingVerificationSessionValues(userId, authSettings.now),
    ...invitation,
  })
  const csrfToken = csrf.generateToken(request, true)
  setSessionCookieLifetime(request, authSettings.now)
  await saveSession(request)
  return csrfToken
}

function pendingVerificationUserId(request) {
  const userId = request.session?.pendingVerificationUserId
  if (request.session?.userId || typeof userId !== 'string') throw notPendingError()
  return userId
}

export function createAuthRouter(database, settings, { mailer = createConsoleMailer() } = {}) {
  const sessionRuntime = createAuthSessionMiddleware(database, settings)
  const authSettings = sessionRuntime.settings
  const authService = createAuthService(database, { now: authSettings.now })
  const verificationService = createVerificationService(database, {
    now: authSettings.now,
    secret: authSettings.sessionSecret,
    mailer,
  })
  const recoveryService = createRecoveryService(database, {
    now: authSettings.now,
    clientOrigin: authSettings.clientOrigin,
  })
  const rateLimits = createRateLimits({ secret: authSettings.sessionSecret, now: authSettings.now })
  const csrf = createCsrfTools()
  const requireOrigin = requireExpectedOrigin(authSettings.clientOrigin)
  const router = Router()
  const events = new EventEmitter()

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  router.use(sessionRuntime.middleware)
  router.use((request, _response, next) => {
    setSessionCookieLifetime(request, authSettings.now)
    next()
  })
  router.use(async (request, response, next) => {
    const sessionData = request.session
    const expired = sessionIsExpired(sessionData, authSettings.now)

    try {
      if (sessionData?.userId) {
        const user = await loadSessionActor(request, authService)
        if (!user) {
          await destroySession(request)
          clearSessionCookie(response, authSettings.secureCookie)
          sendUnauthorized(request, response)
          return
        }
        if (expired) {
          await destroySession(request)
          clearSessionCookie(response, authSettings.secureCookie)
          if (request.method === 'GET' && request.path === '/csrf') {
            request.sessionStore.generate(request)
            next()
            return
          }
          sendUnauthorized(request, response)
          return
        }
        response.locals.authUser = user
      } else if (
        expired &&
        request.method === 'POST' &&
        [
          '/register',
          '/login',
          '/verify-email',
          '/verify-email/resend',
          '/logout',
          '/activate-account',
          '/reset-password',
          '/class-invitation',
          '/class-invitation/clear',
        ].includes(request.path)
      ) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        next(new AuthError('CSRF_INVALID', 'Refresh the security token and try again.', 403))
        return
      }

      next()
    } catch (error) {
      next(error)
    }
  })

  // only a bootstrap that writes a new session spends the per-ip csrf budget
  function csrfBootstrapLimit(request, response, next) {
    if (!sessionIsExpired(request.session, authSettings.now) && request.session.csrfToken) {
      next()
      return
    }
    rateLimits.csrf(request, response, next)
  }

  router.get('/csrf', csrfBootstrapLimit, async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      const mustCreateSession = sessionIsExpired(request.session, authSettings.now)
      if (mustCreateSession || !request.session.csrfToken) {
        await rotateSession(request, createAnonymousSessionValues(authSettings.now))
        const csrfToken = csrf.generateToken(request, true)
        setSessionCookieLifetime(request, authSettings.now)
        await saveSession(request)
        response.json({ csrfToken })
        return
      }

      response.json({ csrfToken: csrf.generateToken(request) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/register',
    rateLimits.registration,
    requireOrigin,
    csrf.protect,
    async (request, response, next) => {
      try {
        parseEmptyQuery(request.query)
        const input = parseRegistrationInput(request.body)
        const pending = await verificationService.registerPending(input)
        const csrfToken = await startPendingVerificationSession(
          request,
          response,
          csrf,
          authSettings,
          pending.userId,
        )
        response.status(202).json({ verification: pending.verification, csrfToken })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/login',
    rateLimits.loginIp,
    requireOrigin,
    csrf.protect,
    async (request, response, next) => {
      let failureSlot
      try {
        parseEmptyQuery(request.query)
        const input = parseLoginInput(request.body)
        const loginAccount = await authService.findLoginAccount(input.identifier)
        // one failure budget per account, whichever identifier was typed
        failureSlot = rateLimits.reserveFailedLogin(
          loginAccount?.emailNormalized ?? input.identifier.normalized,
          request.ip,
        )
        const account = await authService.login(input, loginAccount)
        failureSlot.succeed()
        if (account.pendingVerification) {
          const verification = await verificationService.issueForLogin(account.userId)
          const csrfToken = await startPendingVerificationSession(
            request,
            response,
            csrf,
            authSettings,
            account.userId,
          )
          response.status(202).json({ verification, csrfToken })
          return
        }
        const invitation = pendingInvitationValues(request, authSettings.now)
        await rotateSession(request, {
          ...createAuthenticatedSessionValues(
            account.userId,
            account.authVersion,
            authSettings.now,
          ),
          ...invitation,
        })
        const csrfToken = csrf.generateToken(request, true)
        setSessionCookieLifetime(request, authSettings.now)
        await saveSession(request)
        sendUser(response, account.user, csrfToken)
      } catch (error) {
        if (failureSlot) {
          if (error.code === 'INVALID_CREDENTIALS') failureSlot.fail()
          else failureSlot.release()
        }
        next(error)
      }
    },
  )

  router.post(
    '/verify-email',
    rateLimits.verification,
    requireOrigin,
    csrf.protect,
    async (request, response, next) => {
      try {
        parseEmptyQuery(request.query)
        const { code } = parseVerificationInput(request.body)
        const userId = pendingVerificationUserId(request)
        const account = await verificationService.verify(userId, code)
        const invitation = pendingInvitationValues(request, authSettings.now)
        await rotateSession(request, {
          ...createAuthenticatedSessionValues(
            account.userId,
            account.authVersion,
            authSettings.now,
          ),
          ...invitation,
        })
        const csrfToken = csrf.generateToken(request, true)
        setSessionCookieLifetime(request, authSettings.now)
        await saveSession(request)
        response.status(201).json({ user: account.user, csrfToken })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/verify-email/resend',
    rateLimits.verification,
    requireOrigin,
    csrf.protect,
    async (request, response, next) => {
      try {
        parseEmptyQuery(request.query)
        parseEmptyInput(request.body)
        const verification = await verificationService.resend(pendingVerificationUserId(request))
        response.status(202).json({ verification })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/me', async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      const sessionData = request.session
      if (!sessionData?.userId) {
        if (sessionIsExpired(sessionData, authSettings.now)) {
          await destroySession(request)
          clearSessionCookie(response, authSettings.secureCookie)
        }
        sendUnauthorized(request, response)
        return
      }
      if (sessionIsExpired(sessionData, authSettings.now)) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        sendUnauthorized(request, response)
        return
      }

      const user = response.locals.authUser
      if (!user) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        sendUnauthorized(request, response)
        return
      }

      response.json({ user })
    } catch (error) {
      next(error)
    }
  })

  router.post('/logout', requireOrigin, csrf.protect, async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      parseEmptyInput(request.body)
      const endedSessionId = request.sessionID
      await destroySession(request)
      events.emit('session-ended', endedSessionId)
      clearSessionCookie(response, authSettings.secureCookie)
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/reset-password',
    requireOrigin,
    csrf.protect,
    (request, _response, next) => {
      try {
        parseEmptyQuery(request.query)
        parseStudentPasswordResetInput(request.body)
        next()
      } catch (error) {
        next(error)
      }
    },
    rateLimits.passwordReset,
    async (request, response, next) => {
      try {
        if (request.session?.userId) throw new StudentRecoveryError()
        await recoveryService.resetStudentPassword(request.body)
        response.status(204).end()
      } catch (error) {
        if (error instanceof StudentRecoveryError) {
          response.status(error.status).json({
            error: { code: error.code, message: error.message },
            requestId: response.locals.requestId,
          })
          return
        }
        next(error)
      }
    },
  )

  router.post(
    '/class-invitation',
    rateLimits.classInvitation,
    requireOrigin,
    csrf.protect,
    async (request, response) => {
      parseEmptyQuery(request.query)
      const input = request.body
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        !Object.hasOwn(input, 'code')
      ) {
        throw new CohortError(
          'ENROLLMENT_INVALID_REQUEST',
          'Check the invitation and try again.',
          400,
        )
      }
      capturePendingInvitation(request, hashEnrollmentCode(input.code), authSettings.now)
      await saveSession(request)
      response.status(204).end()
    },
  )

  router.post(
    '/class-invitation/clear',
    rateLimits.classInvitation,
    requireOrigin,
    csrf.protect,
    async (request, response) => {
      parseEmptyQuery(request.query)
      parseEmptyInput(request.body)
      clearPendingInvitation(request)
      await saveSession(request)
      response.status(204).end()
    },
  )

  router.use(
    createActivationRouter(database, {
      now: authSettings.now,
      clientOrigin: authSettings.clientOrigin,
      requireMutation: [rateLimits.activation, requireOrigin, csrf.protect],
    }),
  )

  router.use(requestError)

  async function activeUserFor(sessionData) {
    if (!sessionData?.userId || sessionIsExpired(sessionData, authSettings.now)) return null
    return authService.findActiveSessionUser(sessionData.userId, sessionData.authVersion)
  }

  // narrow session access for the websocket upgrade: the same store and cookie, no second system
  async function resolveSessionUser(request) {
    await new Promise((resolve, reject) => {
      sessionRuntime.middleware(request, new ServerResponse(request), (error) =>
        error ? reject(error) : resolve(),
      )
    })
    const user = await activeUserFor(request.session)
    return user ? { user, sessionId: request.sessionID } : null
  }

  async function recheckSession(sessionId) {
    const sessionData = await new Promise((resolve, reject) => {
      sessionRuntime.store.get(sessionId, (error, value) =>
        error ? reject(error) : resolve(value),
      )
    })
    const user = await activeUserFor(sessionData)
    return user ? { user, sessionId } : null
  }

  return Object.freeze({
    events,
    resolveSessionUser,
    recheckSession,
    router,
    requireSession: createProtectedSessionAccess(sessionRuntime, authService),
    requireMutation: [requireOrigin, csrf.protect],
    clientOrigin: authSettings.clientOrigin,
    now: authSettings.now,
    recoveryLimits: {
      recoveryIssueStaff: rateLimits.recoveryIssueStaff,
      recoveryLookup: rateLimits.recoveryLookup,
      consumeStudentIssueLimit: rateLimits.consumeStudentIssueLimit,
    },
    dispose: rateLimits.dispose,
  })
}
