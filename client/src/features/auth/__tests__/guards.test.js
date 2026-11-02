import { afterEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError } from 'axios'
import {
  createAccountGuard,
  installBrowserAccountAccess,
  installSessionReturnCheck,
} from '../guards.js'

const disposals = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))

function account(status = 'anonymous') {
  return { status, restoreSession: vi.fn().mockResolvedValue(null) }
}

function clientWithAccess(checkSession) {
  const adapter = vi.fn(async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { accepted: true },
  }))
  const client = axios.create({ baseURL: '/api', adapter })
  let signedIn = true
  const onExpired = vi.fn(() => (signedIn = false))
  disposals.push(
    installBrowserAccountAccess(client, {
      checkSession,
      onExpired,
      isSignedIn: () => signedIn,
      getOrigin: () => 'http://localhost:5173',
    }),
  )
  return { client, adapter, onExpired }
}

// answers each request from a table of path to [status, body]
function clientWithResponses(table, { signedIn = true } = {}) {
  const adapter = vi.fn(async (config) => {
    const [status, data] = table[config.url] ?? [200, {}]
    const response = { config, status, statusText: '', headers: {}, data }
    if (status < 400) return response
    throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, response)
  })
  const client = axios.create({ baseURL: '/api', adapter })
  const onExpired = vi.fn()
  disposals.push(
    installBrowserAccountAccess(client, {
      checkSession: vi.fn().mockResolvedValue({ id: 'student' }),
      onExpired,
      isSignedIn: () => signedIn,
      getOrigin: () => 'http://localhost:5173',
    }),
  )
  return { client, onExpired }
}

const ended = (reason) => [
  401,
  { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in.', ...(reason && { reason }) } },
]

describe('session end from any feature', () => {
  it('treats a 401 on a signed-in request as expiry and still rejects the caller', async () => {
    const { client, onExpired } = clientWithResponses({ '/cohorts/managed': ended() })
    await expect(client.get('/cohorts/managed')).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(onExpired).toHaveBeenCalledExactlyOnceWith({ replaced: false })
  })

  it.each(['/attempts/a1/actions', '/me/profile', '/me/wardrobe', '/leaderboards'])(
    'covers %s, not only news and games',
    async (path) => {
      const { client, onExpired } = clientWithResponses({ [path]: ended() })
      await expect(client.post(path, {})).rejects.toBeDefined()
      expect(onExpired).toHaveBeenCalledOnce()
    },
  )

  it('passes on the reason when a newer sign-in replaced the session', async () => {
    const { client, onExpired } = clientWithResponses({
      '/cohorts/managed': ended('session-replaced'),
    })
    await expect(client.get('/cohorts/managed')).rejects.toBeDefined()
    expect(onExpired).toHaveBeenCalledExactlyOnceWith({ replaced: true })
  })

  it('reads the reason from a security token reply, which replaces the marker', async () => {
    const { client, onExpired } = clientWithResponses({
      '/auth/csrf': [200, { csrfToken: 'x', sessionEnded: 'replaced' }],
    })
    await expect(client.get('/auth/csrf')).resolves.toMatchObject({ status: 200 })
    expect(onExpired).toHaveBeenCalledExactlyOnceWith({ replaced: true })
  })

  it('ignores a wrong password, whose 401 is not about a session', async () => {
    const { client, onExpired } = clientWithResponses({
      '/auth/login': [401, { error: { code: 'INVALID_CREDENTIALS' } }],
    })
    await expect(client.post('/auth/login', {})).rejects.toBeDefined()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('stays quiet for a signed-out caller, so public pages cannot loop', async () => {
    const { client, onExpired } = clientWithResponses(
      {
        '/me/enrollment': ended(),
        '/auth/csrf': [200, { csrfToken: 'x', sessionEnded: 'replaced' }],
      },
      { signedIn: false },
    )
    await expect(client.get('/me/enrollment')).rejects.toBeDefined()
    await client.get('/auth/csrf')
    expect(onExpired).not.toHaveBeenCalled()
  })
})

describe('requests that cross a sign-in or sign-out', () => {
  function clientWithHeldResponse(path, response) {
    let release
    const held = new Promise((resolve) => (release = resolve))
    const adapter = vi.fn(async (config) => {
      await held
      const reply = { config, statusText: '', headers: {}, ...response }
      if (reply.status < 400) return reply
      throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, reply)
    })
    const client = axios.create({ baseURL: '/api', adapter })
    const onExpired = vi.fn()
    const session = { signedIn: false, generation: 1 }
    disposals.push(
      installBrowserAccountAccess(client, {
        checkSession: vi.fn().mockResolvedValue({ id: 'student' }),
        onExpired,
        isSignedIn: () => session.signedIn,
        getSessionGeneration: () => session.generation,
        getOrigin: () => 'http://localhost:5173',
      }),
    )
    return { client, onExpired, session, release, sent: () => adapter.mock.calls.length > 0 }
  }

  it('ignores a 401 for a request sent before this sign-in', async () => {
    const { client, onExpired, session, release, sent } = clientWithHeldResponse('/me/enrollment', {
      status: 401,
      data: ended()[1],
    })
    const request = client.get('/me/enrollment')
    await vi.waitFor(() => expect(sent()).toBe(true))
    session.signedIn = true
    session.generation = 2
    release()
    await expect(request).rejects.toBeDefined()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('ignores a 401 sent under the account signed in before this one', async () => {
    const { client, onExpired, session, release, sent } = clientWithHeldResponse('/me/enrollment', {
      status: 401,
      data: ended()[1],
    })
    session.signedIn = true
    const request = client.get('/me/enrollment')
    await vi.waitFor(() => expect(sent()).toBe(true))
    session.generation = 5
    release()
    await expect(request).rejects.toBeDefined()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('ignores a replaced marker on a token reply sent before this sign-in', async () => {
    const { client, onExpired, session, release, sent } = clientWithHeldResponse('/auth/csrf', {
      status: 200,
      data: { csrfToken: 'x', sessionEnded: 'replaced' },
    })
    const request = client.get('/auth/csrf')
    await vi.waitFor(() => expect(sent()).toBe(true))
    session.signedIn = true
    session.generation = 2
    release()
    await expect(request).resolves.toMatchObject({ status: 200 })
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('still ends the session for a 401 on a request sent during it', async () => {
    const { client, onExpired, session, release, sent } = clientWithHeldResponse('/me/enrollment', {
      status: 401,
      data: ended()[1],
    })
    session.signedIn = true
    const request = client.get('/me/enrollment')
    await vi.waitFor(() => expect(sent()).toBe(true))
    release()
    await expect(request).rejects.toBeDefined()
    expect(onExpired).toHaveBeenCalledExactlyOnceWith({ replaced: false })
  })
})

describe('protected requests from visitors', () => {
  function protectedClient({ signedIn }) {
    const client = axios.create({ baseURL: '/api', adapter: vi.fn() })
    let active = signedIn
    const onExpired = vi.fn(() => (active = false))
    disposals.push(
      installBrowserAccountAccess(client, {
        checkSession: vi.fn().mockResolvedValue(null),
        onExpired,
        isSignedIn: () => active,
        getOrigin: () => 'http://localhost:5173',
      }),
    )
    return { client, onExpired }
  }

  it('does not call a session expired for someone who never signed in', async () => {
    const { client, onExpired } = protectedClient({ signedIn: false })
    await expect(client.get('/news')).rejects.toMatchObject({ code: 'ERR_AUTH_REQUIRED' })
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('still reports expiry when a signed-in session is gone', async () => {
    const { client, onExpired } = protectedClient({ signedIn: true })
    await expect(client.get('/news')).rejects.toMatchObject({ code: 'ERR_AUTH_REQUIRED' })
    expect(onExpired).toHaveBeenCalledOnce()
  })
})

describe('checking the session when the person returns to a tab', () => {
  function returningTab({
    visibilityState = 'visible',
    signedIn = true,
    check,
    getSessionGeneration,
  } = {}) {
    const target = new EventTarget()
    target.document = Object.assign(new EventTarget(), { visibilityState })
    const checkSession = check ?? vi.fn().mockResolvedValue(null)
    const onExpired = vi.fn()
    let time = 0
    const stop = installSessionReturnCheck({
      checkSession,
      onExpired,
      isSignedIn: () => signedIn,
      getSessionGeneration,
      target,
      now: () => time,
    })
    disposals.push(stop)
    return { target, checkSession, onExpired, stop, advance: (ms) => (time += ms) }
  }

  it('ends the session when the server no longer has it', async () => {
    const { target, onExpired } = returningTab()
    target.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledOnce())
  })

  it('does not report a deliberate sign-out during the check as expiry', async () => {
    let generation = 1
    let answer
    const { target, onExpired, checkSession } = returningTab({
      check: vi.fn(() => new Promise((resolve) => (answer = resolve))),
      getSessionGeneration: () => generation,
    })
    target.dispatchEvent(new Event('focus'))
    expect(checkSession).toHaveBeenCalledOnce()
    generation = 2
    answer(null)
    await checkSession.mock.results[0].value
    await Promise.resolve()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('checks once for a burst of focus and visibility events', async () => {
    const { target, checkSession, advance } = returningTab()
    target.dispatchEvent(new Event('focus'))
    target.document.dispatchEvent(new Event('visibilitychange'))
    expect(checkSession).toHaveBeenCalledOnce()
    advance(5000)
    target.dispatchEvent(new Event('focus'))
    expect(checkSession).toHaveBeenCalledTimes(2)
  })

  it('does nothing while hidden or signed out, and says nothing when the server is unreachable', async () => {
    const hidden = returningTab({ visibilityState: 'hidden' })
    hidden.target.document.dispatchEvent(new Event('visibilitychange'))
    expect(hidden.checkSession).not.toHaveBeenCalled()

    const anonymous = returningTab({ signedIn: false })
    anonymous.target.dispatchEvent(new Event('focus'))
    expect(anonymous.checkSession).not.toHaveBeenCalled()

    const offline = returningTab({ check: vi.fn().mockRejectedValue(new Error('offline')) })
    offline.target.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(offline.checkSession).toHaveBeenCalledOnce())
    expect(offline.onExpired).not.toHaveBeenCalled()
  })

  it('removes its listeners on disposal', () => {
    const { target, checkSession, stop } = returningTab()
    stop()
    target.dispatchEvent(new Event('focus'))
    expect(checkSession).not.toHaveBeenCalled()
  })
})

describe('account navigation', () => {
  it('sends a replaced session to sign-in with the elsewhere reason', async () => {
    const auth = { ...account('authenticated'), sessionEnd: 'elsewhere' }
    const guard = createAccountGuard(auth)
    await expect(guard({ meta: { requiresAccount: true } })).resolves.toEqual({
      path: '/login',
      query: { reason: 'elsewhere' },
    })
  })

  it('waits for restoration before permitting protected content', async () => {
    const auth = account()
    let finish
    auth.restoreSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const navigation = createAccountGuard(auth)({ meta: { requiresAccount: true } })
    let settled = false
    navigation.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish({ id: 'student' })
    await expect(navigation).resolves.toBe(true)
  })

  it('redirects anonymous or expired visitors without replaying their destination', async () => {
    for (const [status, reason] of [
      ['anonymous', 'required'],
      ['authenticated', 'expired'],
    ]) {
      const auth = account(status)
      await expect(createAccountGuard(auth)({ meta: { requiresAccount: true } })).resolves.toEqual({
        path: '/login',
        query: { reason },
      })
    }
  })

  it('fails closed for protected pages but keeps public account shells available on network errors', async () => {
    const auth = account('unknown')
    auth.restoreSession.mockRejectedValue(new Error('Connection unavailable'))
    const guard = createAccountGuard(auth)
    await expect(guard({ meta: { requiresAccount: true } })).resolves.toEqual({
      path: '/login',
      query: { reason: 'unavailable' },
    })
    await expect(guard({ meta: { accountAware: true } })).resolves.toBe(true)
  })

  it('keeps About public and sends already signed-in visitors away from account forms', async () => {
    const auth = account('authenticated')
    auth.restoreSession.mockResolvedValue({ id: 'student' })
    const guard = createAccountGuard(auth)
    await expect(guard({ meta: {} })).resolves.toBe(true)
    expect(auth.restoreSession).not.toHaveBeenCalled()
    await expect(guard({ meta: { authPage: true } })).resolves.toEqual({ name: 'town' })
  })

  it('allows only the current administrator into the workspace and preserves activation access', async () => {
    const auth = account('authenticated')
    const guard = createAccountGuard(auth)
    const adminRoute = { meta: { requiresAccount: true, requiredRole: 'admin' } }
    auth.restoreSession.mockResolvedValue({ id: 'student', globalRoles: ['student'] })
    await expect(guard(adminRoute)).resolves.toEqual({ path: '/forbidden' })
    auth.restoreSession.mockResolvedValue({ id: 'admin', globalRoles: ['admin'] })
    await expect(guard(adminRoute)).resolves.toBe(true)
    await expect(guard({ meta: { accountAware: true } })).resolves.toBe(true)
    auth.restoreSession.mockResolvedValue(null)
    await expect(guard({ meta: { accountAware: true } })).resolves.toBe(true)
  })

  it('checks the fresh staff role and delegates only successful account-page navigation', async () => {
    const auth = account('authenticated')
    const resolveDestination = vi.fn().mockResolvedValue('/join-class?carry=1')
    const guard = createAccountGuard(auth, { resolveDestination })
    const staffRoute = { meta: { requiresAccount: true, allowedRoles: ['instructor', 'admin'] } }
    auth.restoreSession.mockResolvedValue({ id: 'student', globalRoles: ['student'] })
    await expect(guard(staffRoute)).resolves.toEqual({ path: '/forbidden' })
    expect(resolveDestination).not.toHaveBeenCalled()
    auth.restoreSession.mockResolvedValue({ id: 'teacher', globalRoles: ['instructor'] })
    await expect(guard(staffRoute)).resolves.toBe(true)
    await expect(guard({ meta: { authPage: true } })).resolves.toBe('/join-class?carry=1')
    resolveDestination.mockRejectedValue(new Error('Unavailable'))
    await expect(guard({ meta: { authPage: true } })).resolves.toEqual({
      path: '/join-class',
      query: { onboarding: '1' },
    })
    expect(auth.restoreSession).toHaveBeenCalledTimes(4)
  })
})

describe('browser activity request boundary', () => {
  it('blocks an expired-session mutation before dispatch and never retries it automatically', async () => {
    const check = vi.fn().mockResolvedValue(null)
    const { client, adapter, onExpired } = clientWithAccess(check)
    await expect(
      client.post('/games/cli-cyber-defender/runs/id/commands', { command: 'help' }),
    ).rejects.toMatchObject({ code: 'ERR_AUTH_REQUIRED' })
    expect(adapter).not.toHaveBeenCalled()
    expect(onExpired).toHaveBeenCalledOnce()
    expect(check).toHaveBeenCalledOnce()
  })

  it('blocks unavailable session checks and allows verified News and game requests', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue({ id: 'student' })
    const { client, adapter, onExpired } = clientWithAccess(check)
    await expect(client.get('/news')).rejects.toThrow('Unavailable')
    expect(adapter).not.toHaveBeenCalled()
    expect(onExpired).not.toHaveBeenCalled()
    await client.get('/news')
    await client.post('/games/phishing-post-mortem/attempts', { context: { kind: 'personal' } })
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not intercept auth bootstrap, public health or other origins', async () => {
    const check = vi.fn()
    const { client, adapter } = clientWithAccess(check)
    await client.get('/auth/me')
    await client.get('/auth/csrf')
    await client.get('/health')
    await client.get('https://example.test/api/news')
    expect(check).not.toHaveBeenCalled()
    expect(adapter).toHaveBeenCalledTimes(4)
  })

  it('does not dispatch an activity after its view aborts while the session check is pending', async () => {
    let finish
    const check = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { client, adapter } = clientWithAccess(check)
    const controller = new AbortController()
    const request = client.post('/games/cli-cyber-defender/runs', {}, { signal: controller.signal })
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce())
    controller.abort()
    finish({ id: 'student' })
    await expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(adapter).not.toHaveBeenCalled()
  })
})
