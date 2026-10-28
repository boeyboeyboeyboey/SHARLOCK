import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { createAccountGuard, installBrowserAccountAccess } from '../guards.js'

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
  const onExpired = vi.fn()
  disposals.push(
    installBrowserAccountAccess(client, {
      checkSession,
      onExpired,
      getOrigin: () => 'http://localhost:5173',
    }),
  )
  return { client, adapter, onExpired }
}

describe('account navigation', () => {
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
      path: '/join-class', query: { onboarding: '1' },
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
