import {
  clearSessionCookie,
  destroySession,
  sessionIsExpired,
  setSessionCookieLifetime,
} from './session.js'

// the replaced marker lets a signed-out tab say a newer sign-in ended it
export function signedOutBody(request, response, now) {
  const replaced = request.session?.replacedAt && !sessionIsExpired(request.session, now)
  return {
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Sign in to continue.',
      ...(replaced && { reason: 'session-replaced' }),
    },
    requestId: response.locals.requestId,
  }
}

export async function loadSessionActor(request, authService) {
  if (!request.session?.userId) return null
  return authService.findActiveSessionUser(request.session.userId, request.session.authVersion)
}

export function createProtectedSessionAccess(sessionRuntime, authService) {
  const { settings } = sessionRuntime
  return [
    (_request, response, next) => {
      response.set('Cache-Control', 'no-store')
      next()
    },
    sessionRuntime.middleware,
    (request, _response, next) => {
      setSessionCookieLifetime(request, settings.now)
      next()
    },
    async (request, response, next) => {
      const user = await loadSessionActor(request, authService)
      if (!user || sessionIsExpired(request.session, settings.now)) {
        const body = signedOutBody(request, response, settings.now)
        // a replaced marker stays until it expires, so parallel requests all get the same reason
        if (!body.error.reason) {
          await destroySession(request)
          clearSessionCookie(response, settings.secureCookie)
        }
        response.status(401).json(body)
        return
      }
      response.locals.authUser = user
      next()
    },
  ]
}
