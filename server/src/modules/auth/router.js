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
import { createProtectedSessionAccess, loadSessionActor, signedOutBody } from './access.js'
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
  AUTH_IDLE_MS,
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

// no authenticated session exists until the code is confirmed
async function startPendingVerificationSession(request, csrf, authSettings, pending) {
  const invitation = pendingInvitationValues(request, authSettings.now)
  await rotateSession(request, {
    ...createPendingVerificationSessionValues(
      pending.userId,
      pending.authVersion,
      authSettings.now,
    ),
    ...invitation,
  })
  const csrfToken = csrf.generateToken(request, true)
  setSessionCookieLifetime(request, authSettings.now)
  await saveSession(request)
  return csrfToken
}

const isSessionProbe = (request) => request.method === 'GET' && request.path === '/session'

function pendingVerificationOf(request) {
  const userId = request.session?.pendingVerificationUserId
  if (request.session?.userId || typeof userId !== 'string') throw notPendingError()
  return { userId, authVersion: request.session.pendingVerificationAuthVersion }
}

export function createAuthRouter(
  database,
  settings,
  { mailer = createConsoleMailer(), rateLimitOverrides } = {},
) {
  const sessionRuntime = createAuthSessionMiddleware(database, settings)
  const authSettings = sessionRuntime.settings
  const authService = createAuthService(database, { now: authSettings.now })
  const verificationService = createVerificationService(database, {
    now: authSettings.now,
    secret: authSettings.sessionSecret,
    mailer,
  })
  const events = new EventEmitter()
  const emitSessionsEnded = (sessionIds) => {
    for (const sessionId of sessionIds) events.emit('session-ended', sessionId)
  }
  const recoveryService = createRecoveryService(database, {
    now: authSettings.now,
    clientOrigin: authSettings.clientOrigin,
    onSessionsEnded: emitSessionsEnded,
  })
  const rateLimits = createRateLimits({
    secret: authSettings.sessionSecret,
    now: authSettings.now,
    overrides: rateLimitOverrides,
  })
  const csrf = createCsrfTools()
  const requireOrigin = requireExpectedOrigin(authSettings.clientOrigin)
  const router = Router()
  const sessionCollection = database.db.collection('auth_sessions')

  let lastLoginOrder = 0

  // one active login per account: the newest wins, and the order settles two in the same
  // millisecond. each login looks after saving, so of two racing logins at least the later saver
  // sees the other; if that one is the newer, this login ends itself. an ended session stays
  // briefly as an identity-free marker so its tab can be told why
  async function endOlderSessions(userId, request) {
    const { createdAt, loginOrder } = request.session
    const others = { 'session.userId': userId, _id: { $ne: request.sessionID } }
    const stale = await sessionCollection
      .find(
        {
          ...others,
          $or: [
            { 'session.createdAt': { $lt: createdAt } },
            {
              'session.createdAt': createdAt,
              'session.loginOrder': { $not: { $gte: loginOrder } },
            },
          ],
        },
        { projection: { _id: 1 } },
      )
      .toArray()
    const newer = await sessionCollection.findOne(
      {
        ...others,
        $or: [
          { 'session.createdAt': { $gt: createdAt } },
          { 'session.createdAt': createdAt, 'session.loginOrder': { $gt: loginOrder } },
        ],
      },
      { projection: { _id: 1 } },
    )
    if (newer) stale.push({ _id: request.sessionID })
    if (stale.length === 0) return
    const replacedAt = new Date(authSettings.now())
    const markerExpiry = new Date(replacedAt.getTime() + AUTH_IDLE_MS)
    await sessionCollection.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) } },
      {
        $set: {
          'session.userId': null,
          'session.authVersion': null,
          'session.replacedAt': replacedAt,
          'session.lastSeenAt': replacedAt,
          'session.absoluteExpiresAt': markerExpiry,
          expires: markerExpiry,
        },
        $unset: { 'session.csrfToken': '', 'session.classInvitation': '' },
      },
    )
    for (const doc of stale) events.emit('session-ended', doc._id, 'replaced')
  }

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
          if (isSessionProbe(request)) {
            request.sessionStore.generate(request)
            next()
            return
          }
          response.status(401).json(signedOutBody(request, response, authSettings.now))
          return
        }
        if (expired) {
          await destroySession(request)
          clearSessionCookie(response, authSettings.secureCookie)
          if (isSessionProbe(request) || (request.method === 'GET' && request.path === '/csrf')) {
            request.sessionStore.generate(request)
            next()
            return
          }
          response.status(401).json(signedOutBody(request, response, authSettings.now))
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
        const replaced = !mustCreateSession && Boolean(request.session.replacedAt)
        await rotateSession(request, createAnonymousSessionValues(authSettings.now))
        const csrfToken = csrf.generateToken(request, true)
        setSessionCookieLifetime(request, authSettings.now)
        await saveSession(request)
        response.json({ csrfToken, ...(replaced && { sessionEnded: 'replaced' }) })
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
          csrf,
          authSettings,
          pending,
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
          const verification = await verificationService.issueForLogin(account)
          const csrfToken = await startPendingVerificationSession(
            request,
            csrf,
            authSettings,
            account,
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
          loginOrder: ++lastLoginOrder,
        })
        const csrfToken = csrf.generateToken(request, true)
        setSessionCookieLifetime(request, authSettings.now)
        await saveSession(request)
        await endOlderSessions(account.userId, request)
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
        const account = await verificationService.verify(pendingVerificationOf(request), code)
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
        const verification = await verificationService.resend(pendingVerificationOf(request))
        response.status(202).json({ verification })
      } catch (error) {
        next(error)
      }
    },
  )

  // the session probe: anyone may ask, so being signed out is an answer rather than a 401
  router.get('/session', async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      if (response.locals.authUser) {
        response.json({ user: response.locals.authUser })
        return
      }
      const sessionData = request.session
      if (sessionIsExpired(sessionData, authSettings.now)) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        response.json({ user: null })
        return
      }
      if (sessionData.replacedAt) {
        response.json({ user: null, sessionEnded: 'replaced' })
        return
      }
      const verification =
        typeof sessionData.pendingVerificationUserId === 'string'
          ? await verificationService.describePending(pendingVerificationOf(request))
          : null
      response.json({ user: null, ...(verification && { verification }) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', async (request, response, next) => {
    try {
      parseEmptyQuery(request.query)
      const sessionData = request.session
      if (!sessionData?.userId) {
        if (sessionIsExpired(sessionData, authSettings.now)) {
          await destroySession(request)
          clearSessionCookie(response, authSettings.secureCookie)
        }
        response.status(401).json(signedOutBody(request, response, authSettings.now))
        return
      }
      if (sessionIsExpired(sessionData, authSettings.now)) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        response.status(401).json(signedOutBody(request, response, authSettings.now))
        return
      }

      const user = response.locals.authUser
      if (!user) {
        await destroySession(request)
        clearSessionCookie(response, authSettings.secureCookie)
        response.status(401).json(signedOutBody(request, response, authSettings.now))
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
        await recoveryService.resetStudentPassword(request.body, {
          requestId: response.locals.requestId,
        })
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
      onSessionsEnded: emitSessionsEnded,
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
