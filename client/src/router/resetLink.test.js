import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../views/Dashboard.vue', () => ({ default: { render: () => null } }))
vi.mock('../views/ComingSoon.vue', () => ({ default: { render: () => null } }))

const TOKEN = 'T'.repeat(43)
const OTHER_TOKEN = 'U'.repeat(43)

// the router reads window.location as it is imported, so each case loads a fresh copy
async function loadRouterAt(url) {
  window.history.replaceState(null, '', url)
  vi.resetModules()
  return import('./index.js')
}

describe('reset link capture', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('takes a token from the fragment on first load and scrubs the address', async () => {
    const { getResetLinkCapture } = await loadRouterAt(`/reset-password#token=${TOKEN}`)
    expect(getResetLinkCapture()).toEqual({ status: 'ready', token: TOKEN })
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('refuses a token in the query string and scrubs it', async () => {
    const { getResetLinkCapture } = await loadRouterAt(`/reset-password?token=${TOKEN}`)
    expect(getResetLinkCapture()).toEqual({ status: 'invalid', token: '' })
    expect(window.location.search).toBe('')
  })

  it('refuses a fragment of the wrong shape', async () => {
    const { getResetLinkCapture } = await loadRouterAt('/reset-password#token=short')
    expect(getResetLinkCapture()).toEqual({ status: 'invalid', token: '' })
    expect(window.location.hash).toBe('')
  })

  it('reports a reload, which has no token left, as missing rather than invalid', async () => {
    const { getResetLinkCapture } = await loadRouterAt('/reset-password')
    expect(getResetLinkCapture()).toEqual({ status: 'missing', token: '' })
  })

  it('leaves other pages alone', async () => {
    const { getResetLinkCapture } = await loadRouterAt(`/login#token=${TOKEN}`)
    expect(getResetLinkCapture()).toEqual({ status: 'missing', token: '' })
    expect(window.location.hash).toBe(`#token=${TOKEN}`)
  })

  it('captures a link pasted into the open tab and scrubs it from the route', async () => {
    const { default: router, getResetLinkCapture } = await loadRouterAt('/reset-password')
    await router.push(`/reset-password#token=${OTHER_TOKEN}`)
    expect(getResetLinkCapture()).toEqual({ status: 'ready', token: OTHER_TOKEN })
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
  })

  it('rejects a query token on an in-app navigation', async () => {
    const { default: router, getResetLinkCapture } = await loadRouterAt('/reset-password')
    await router.push(`/reset-password?token=${TOKEN}`)
    expect(getResetLinkCapture()).toEqual({ status: 'invalid', token: '' })
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
  })

  it('forgets the token on leaving the page', async () => {
    const { default: router, getResetLinkCapture } = await loadRouterAt(
      `/reset-password#token=${TOKEN}`,
    )
    await router.push('/reset-password')
    await router.push('/forbidden')
    expect(getResetLinkCapture()).toEqual({ status: 'missing', token: '' })
  })
})
