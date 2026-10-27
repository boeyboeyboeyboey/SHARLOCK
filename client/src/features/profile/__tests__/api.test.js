import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), put: vi.fn() },
  requestCsrfToken: vi.fn(),
}))

vi.mock('../../../services/api.js', () => ({ api: mocks.api }))
vi.mock('../../auth/api.js', () => ({ requestCsrfToken: mocks.requestCsrfToken }))

import { getOwnProfile, ProfileApiError, setHowToPlayDismissed, updateOwnProfile } from '../api.js'

describe('profile API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads only the exact own-profile DTO', async () => {
    mocks.api.get.mockResolvedValue({ data: { username: 'Case_Finder', avatarId: 'blue' } })
    await expect(getOwnProfile()).resolves.toEqual({ username: 'Case_Finder', avatarId: 'blue' })
    expect(mocks.api.get).toHaveBeenCalledWith('/me/profile', { signal: undefined })

    mocks.api.get.mockResolvedValue({
      data: { username: 'Case_Finder', avatarId: 'blue', title: 'Detective', points: 10 },
    })
    await expect(getOwnProfile()).rejects.toMatchObject({
      name: 'ProfileApiError',
      message: 'Sharlock returned an incomplete profile. Try again.',
    })
  })

  it('trims username without changing case and sends only the allowlisted fields with fresh CSRF', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf-token')
    mocks.api.patch.mockResolvedValue({ data: { username: 'New_Case', avatarId: 'reader' } })

    await expect(updateOwnProfile({ username: ' New_Case ', avatarId: 'reader' })).resolves.toEqual(
      { username: 'New_Case', avatarId: 'reader' },
    )

    expect(mocks.requestCsrfToken).toHaveBeenCalledOnce()
    expect(mocks.api.patch).toHaveBeenCalledWith(
      '/me/profile',
      { username: 'New_Case', avatarId: 'reader' },
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-token' } },
    )
  })

  it('rejects unsupported client fields before dispatch and maps conflicts without backend text', async () => {
    await expect(
      updateOwnProfile({ username: 'Case_Finder', avatarId: 'blue', email: 'leak@example.test' }),
    ).rejects.toBeInstanceOf(ProfileApiError)
    expect(mocks.requestCsrfToken).not.toHaveBeenCalled()
    expect(mocks.api.patch).not.toHaveBeenCalled()

    mocks.requestCsrfToken.mockResolvedValue('csrf-token')
    mocks.api.patch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: { code: 'PROFILE_USERNAME_TAKEN', message: 'private backend detail' } },
      },
    })
    await expect(
      updateOwnProfile({ username: 'Case_Finder', avatarId: 'blue' }),
    ).rejects.toMatchObject({
      status: 409,
      fieldErrors: { username: 'That username is already in use. Choose another one.' },
      message: 'That username is already in use. Choose another one.',
    })
  })
})

describe('how to play API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends exactly { dismissed } with a fresh CSRF token and returns the list', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf-token')
    mocks.api.put.mockResolvedValue({ data: { howToPlayDismissed: ['clearance-tower'] } })

    await expect(setHowToPlayDismissed('clearance-tower', true)).resolves.toEqual([
      'clearance-tower',
    ])
    expect(mocks.api.put).toHaveBeenCalledWith(
      '/me/how-to-play/clearance-tower',
      { dismissed: true },
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-token' } },
    )
  })

  it('rejects bad input before any request and malformed responses after', async () => {
    await expect(setHowToPlayDismissed('../x', true)).rejects.toBeInstanceOf(ProfileApiError)
    await expect(setHowToPlayDismissed('clearance-tower', 'yes')).rejects.toBeInstanceOf(
      ProfileApiError,
    )
    expect(mocks.api.put).not.toHaveBeenCalled()

    mocks.requestCsrfToken.mockResolvedValue('csrf-token')
    mocks.api.put.mockResolvedValue({ data: { howToPlayDismissed: 'nope' } })
    await expect(setHowToPlayDismissed('clearance-tower', true)).rejects.toBeInstanceOf(
      ProfileApiError,
    )
  })

  it('maps server failures to a safe error', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf-token')
    mocks.api.put.mockRejectedValue({
      response: { status: 403, data: { error: { code: 'CSRF_INVALID', message: 'private' } } },
    })
    await expect(setHowToPlayDismissed('clearance-tower', true)).rejects.toMatchObject({
      code: 'CSRF_INVALID',
      status: 403,
    })
  })
})
