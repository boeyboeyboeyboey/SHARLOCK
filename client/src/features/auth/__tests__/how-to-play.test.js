import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  requestCurrentUser: vi.fn(),
  requestCsrfToken: vi.fn(),
  setHowToPlayDismissed: vi.fn(),
}))

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js')
  return {
    ...actual,
    requestCurrentUser: mocks.requestCurrentUser,
    requestCsrfToken: mocks.requestCsrfToken,
  }
})
vi.mock('../../profile/api.js', () => ({ setHowToPlayDismissed: mocks.setHowToPlayDismissed }))

import { useAuthStore } from '../store.js'

const baseUser = {
  id: '66f0a35f2d84787cce1a1001',
  email: 'detective@example.test',
  username: 'Case_Finder',
  avatarId: 'blue',
  globalRoles: ['student'],
}

async function signedIn(extra = {}) {
  mocks.requestCsrfToken.mockResolvedValue('t')
  mocks.requestCurrentUser.mockResolvedValue({ ...baseUser, ...extra })
  const auth = useAuthStore()
  await auth.restoreSession()
  return auth
}

describe('how to play dismissal in the auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('defaults the list to empty when the server omits it', async () => {
    const auth = await signedIn()
    expect(auth.user.howToPlayDismissed).toEqual([])
  })

  it('keeps the server list and rejects a malformed one', async () => {
    const auth = await signedIn({ howToPlayDismissed: ['clearance-tower'] })
    expect(auth.user.howToPlayDismissed).toEqual(['clearance-tower'])

    setActivePinia(createPinia())
    const bad = useAuthStore()
    mocks.requestCurrentUser.mockResolvedValue({ ...baseUser, howToPlayDismissed: [1] })
    await expect(bad.restoreSession()).rejects.toThrow()
    expect(bad.status).not.toBe('authenticated')
  })

  it('updates optimistically, then adopts the server list', async () => {
    const auth = await signedIn()
    let resolve
    mocks.setHowToPlayDismissed.mockReturnValue(new Promise((done) => (resolve = done)))

    const pending = auth.setHowToPlayDismissed('clearance-tower', true)
    expect(auth.user.howToPlayDismissed).toEqual(['clearance-tower'])
    resolve(['clearance-tower', 'cli-cyber-defender'])
    await pending

    expect(mocks.setHowToPlayDismissed).toHaveBeenCalledWith('clearance-tower', true)
    expect(auth.user.howToPlayDismissed).toEqual(['clearance-tower', 'cli-cyber-defender'])
  })

  it('reverts and rethrows when the request fails', async () => {
    const auth = await signedIn({ howToPlayDismissed: ['clearance-tower'] })
    const failure = new Error('offline')
    mocks.setHowToPlayDismissed.mockRejectedValue(failure)

    await expect(auth.setHowToPlayDismissed('clearance-tower', false)).rejects.toBe(failure)
    expect(auth.user.howToPlayDismissed).toEqual(['clearance-tower'])
  })
})
