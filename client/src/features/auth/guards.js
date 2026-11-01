import { AxiosError, CanceledError } from 'axios'

export function createAccountGuard(auth, { resolveDestination } = {}) {
  return async (to) => {
    if (!to.meta.requiresAccount && !to.meta.accountAware && !to.meta.authPage) return true
    const previouslySignedIn = auth.status === 'authenticated'
    let user
    try {
      user = await auth.restoreSession({ force: true })
    } catch {
      return to.meta.requiresAccount ? { path: '/login', query: { reason: 'unavailable' } } : true
    }
    if (to.meta.requiresAccount && !user) {
      const fallback = previouslySignedIn ? 'expired' : 'required'
      return { path: '/login', query: { reason: auth.sessionEnd || fallback } }
    }
    if (to.meta.requiredRole && !user?.globalRoles?.includes(to.meta.requiredRole)) {
      return { path: '/forbidden' }
    }
    if (
      to.meta.allowedRoles &&
      !to.meta.allowedRoles.some((role) => user?.globalRoles?.includes(role))
    ) {
      return { path: '/forbidden' }
    }
    if (to.meta.authPage && user) {
      if (!resolveDestination) return { name: 'town' }
      try {
        return await resolveDestination(user)
      } catch {
        return { path: '/join-class', query: { onboarding: '1' } }
      }
    }
    return true
  }
}

// a 401 on a request made while signed in means the session ended, whichever feature made it.
// signed-out callers and failed sign-ins never pass this test, so it cannot redirect in a loop
export function sessionEndedBy(error, isSignedIn) {
  const body = error?.response?.data?.error
  if (error?.response?.status !== 401 || body?.code !== 'AUTHENTICATION_REQUIRED') return null
  if (!isSignedIn()) return null
  return { replaced: body.reason === 'session-replaced' }
}

export function installBrowserAccountAccess(
  client,
  { checkSession, onExpired, isSignedIn = () => false, getOrigin = () => window.location.origin },
) {
  const responses = client.interceptors.response.use(
    (response) => {
      // fetching a security token replaces the marker, so that reply is the one chance to say why
      if (response?.data?.sessionEnded === 'replaced' && isSignedIn()) onExpired({ replaced: true })
      return response
    },
    (error) => {
      const ended = sessionEndedBy(error, isSignedIn)
      if (ended) onExpired(ended)
      return Promise.reject(error)
    },
  )
  const interceptor = client.interceptors.request.use(async (config) => {
    const origin = getOrigin()
    const destination = new URL(client.getUri(config), origin)
    const protectedPath = /^\/api\/(?:news(?:\/|$)|games(?:\/|$))/.test(destination.pathname)
    if (destination.origin !== origin || !protectedPath) return config
    if (config.signal?.aborted) throw new CanceledError()

    const user = await checkSession()
    if (config.signal?.aborted) throw new CanceledError()
    if (!user) {
      onExpired()
      throw new AxiosError('Sign in to continue.', 'ERR_AUTH_REQUIRED', config, undefined, {
        status: 401,
        data: { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' } },
      })
    }
    return config
  })
  return () => {
    client.interceptors.request.eject(interceptor)
    client.interceptors.response.eject(responses)
  }
}

// an idle tab makes no requests, so it rechecks when the person comes back to it; there is no
// timer because every check counts as activity and would keep an idle session alive for ever
export function installSessionReturnCheck({
  checkSession,
  onExpired,
  isSignedIn,
  target = window,
  now = Date.now,
  minimumGapMs = 5000,
}) {
  let lastCheck = -Infinity
  async function check() {
    if (target.document.visibilityState === 'hidden' || !isSignedIn()) return
    if (now() - lastCheck < minimumGapMs) return
    lastCheck = now()
    try {
      if (!(await checkSession())) onExpired({})
    } catch {
      // an unreachable server or a busy account request says nothing about the session
    }
  }
  target.addEventListener('focus', check)
  target.document.addEventListener('visibilitychange', check)
  return () => {
    target.removeEventListener('focus', check)
    target.document.removeEventListener('visibilitychange', check)
  }
}
