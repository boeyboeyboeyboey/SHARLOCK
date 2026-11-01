import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  requestCsrfToken: vi.fn(),
}))
vi.mock('../../../services/api.js', () => ({ api: mocks.api }))
vi.mock('../../auth/api.js', () => ({ requestCsrfToken: mocks.requestCsrfToken }))

import {
  issueValidatedEnrollmentCode,
  safeError,
  issueEnrollmentCode,
  joinClass,
  listMemberships,
  revokeEnrollmentCode,
  updateMembership,
} from '../api.js'

describe('cohort API', () => {
  it.each([
    ['COHORT_ALREADY_IN_CLASS', "You're already in a class. Leave it before joining another."],
    ['COHORT_STALE_REQUEST', 'This class request changed. The list was refreshed; review it.'],
    ['COHORT_STALE_CODE', 'The invitation code changed. The panel was refreshed; review it.'],
  ])('explains %s in fixed words', (code, message) => {
    const failure = safeError({
      response: { status: 409, data: { error: { code, message: 'server text' } } },
    })
    expect(failure).toMatchObject({ code, message })
  })

  it('leaves an ended session to the shared handler, with no sentence of its own', () => {
    const failure = safeError({
      response: { status: 401, data: { error: { code: 'AUTHENTICATION_REQUIRED' } } },
    })
    expect(failure.status).toBe(401)
    expect(failure.message).not.toMatch(/session/i)
  })

  beforeEach(() => vi.clearAllMocks())

  it('uses bounded own-membership paging and exact student join payloads', async () => {
    mocks.api.get.mockResolvedValue({ data: { memberships: [], page: 1, total: 0 } })
    mocks.api.post.mockResolvedValue({ data: { membership: { status: 'pending' } } })
    await listMemberships()
    await joinClass({ code: 'ABCDEFGHJKLMPQRS' })
    await joinClass({ invitation: true })
    expect(mocks.api.get).toHaveBeenCalledWith('/me/memberships', {
      params: { page: 1, limit: 20 },
      signal: undefined,
    })
    expect(mocks.api.post.mock.calls.map(([path, body]) => [path, body])).toEqual([
      ['/cohorts/join-requests', { code: 'ABCDEFGHJKLMPQRS' }],
      ['/cohorts/join-requests', { invitation: true }],
    ])
  })

  it('gets a fresh CSRF token for each mutation and never retries a rejected action', async () => {
    mocks.requestCsrfToken
      .mockResolvedValueOnce('csrf-one')
      .mockResolvedValueOnce('csrf-two')
      .mockResolvedValueOnce('csrf-three')
    mocks.api.patch.mockResolvedValue({ data: {} })
    mocks.api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: { code: 'COHORT_CONFLICT', message: 'secret' } } },
    })
    mocks.api.delete.mockResolvedValue({ data: {} })
    await updateMembership('class-id', 'member-id', 'active', 7)
    await expect(issueEnrollmentCode('class-id', 4)).rejects.toMatchObject({
      name: 'CohortApiError',
      message: 'This class changed while you were viewing it. Try again.',
    })
    await revokeEnrollmentCode('class-id', 'code-id', 8)
    expect(mocks.requestCsrfToken).toHaveBeenCalledTimes(3)
    expect(mocks.api.patch).toHaveBeenCalledWith(
      '/cohorts/class-id/memberships/member-id',
      { status: 'active', expectedRevision: 7 },
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-one' } },
    )
    expect(mocks.api.post).toHaveBeenCalledTimes(1)
    expect(mocks.api.delete).toHaveBeenCalledWith('/cohorts/class-id/enrollment-codes/code-id', {
      signal: undefined,
      headers: { 'X-CSRF-Token': 'csrf-three' },
      data: { expectedRevision: 8 },
    })
  })

  it('accepts only a same-origin one-time class link whose fragment matches the issued code', async () => {
    const rawCode = 'ABCDEFGHJKLMPQRS'
    mocks.requestCsrfToken.mockResolvedValue('csrf')
    mocks.api.post
      .mockResolvedValueOnce({
        data: {
          id: 'code-id',
          revision: 2,
          rawCode,
          expiresAt: '2099-01-01T00:00:00.000Z',
          invitationUrl: `${window.location.origin}/join-class#code=${rawCode}`,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'code-id',
          revision: 2,
          rawCode,
          expiresAt: '2099-01-01T00:00:00.000Z',
          invitationUrl: `https://elsewhere.example/join-class#code=${rawCode}`,
        },
      })
    await expect(issueValidatedEnrollmentCode('class-id', 1)).resolves.toMatchObject({ rawCode })
    await expect(issueValidatedEnrollmentCode('class-id', 1)).rejects.toMatchObject({
      code: 'COHORT_CODE_NOT_SHOWN',
      message: 'A new code was made but could not be shown. Use Replace code to issue another.',
    })
  })

  it('words a code the join path refused for the student who typed it', () => {
    const refused = safeError({
      response: { status: 404, data: { error: { code: 'COHORT_CODE_UNAVAILABLE' } } },
    })
    expect(refused.message).toBe(
      "That class code isn't valid or has expired. Check it with your instructor.",
    )
  })
})
