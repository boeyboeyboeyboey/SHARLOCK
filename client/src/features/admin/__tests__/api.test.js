import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
  requestCsrfToken: vi.fn(),
}))

vi.mock('../../../services/api.js', () => ({ api: mocks.api }))
vi.mock('../../auth/api.js', () => ({ requestCsrfToken: mocks.requestCsrfToken }))

import {
  createCohort,
  createInstitution,
  createAdministrator,
  createInstructor,
  listAdminUsers,
  listAuditEvents,
  listCohorts,
  listInstitutions,
  reissueInstructorActivation,
  listPendingAdministrators,
  reissueAdministratorActivation,
  cancelPendingAdministrator,
  updateCohort,
  updateInstitution,
  updateAdminUser,
  updateInstructorAssignments,
} from '../api.js'

describe('admin workspace API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses bounded list requests with the optional class institution filter', async () => {
    mocks.api.get.mockResolvedValue({ data: { institutions: [], cohorts: [], page: 1, total: 0 } })

    await listInstitutions()
    await listCohorts({ page: 2, limit: 50, institutionId: '0123456789abcdef01234567' })

    expect(mocks.api.get).toHaveBeenNthCalledWith(1, '/admin/institutions', {
      params: { page: 1, limit: 20 },
      signal: undefined,
    })
    expect(mocks.api.get).toHaveBeenNthCalledWith(2, '/admin/cohorts', {
      params: { page: 2, limit: 50, institutionId: '0123456789abcdef01234567' },
      signal: undefined,
    })
  })

  it('uses the audit read endpoint with bounded paging and approved filters', async () => {
    const signal = new AbortController().signal
    mocks.api.get.mockResolvedValue({ data: { events: [], page: 2, total: 0 } })

    await listAuditEvents({
      eventType: 'admin.cohort.create',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-17T12:00:00.000Z',
      page: 2,
      limit: 25,
      signal,
    })

    expect(mocks.api.get).toHaveBeenCalledWith('/admin/audit-events', {
      params: {
        page: 2,
        limit: 25,
        eventType: 'admin.cohort.create',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-17T12:00:00.000Z',
      },
      signal,
    })
    expect(mocks.requestCsrfToken).not.toHaveBeenCalled()
  })

  it('omits unspecified audit dates so the server uses its current retention window', async () => {
    mocks.api.get.mockResolvedValue({ data: { events: [], page: 1, total: 0 } })

    await listAuditEvents({ eventType: 'admin.user.disable', page: 1, limit: 25 })

    expect(mocks.api.get).toHaveBeenCalledWith('/admin/audit-events', {
      params: { page: 1, limit: 25, eventType: 'admin.user.disable' },
      signal: undefined,
    })
  })

  it('uses role and account status filters on the minimal account list', async () => {
    const signal = new AbortController().signal
    mocks.api.get.mockResolvedValue({ data: { users: [], page: 2, total: 0 } })

    await listAdminUsers({
      page: 2,
      limit: 25,
      role: 'instructor',
      accountStatus: 'disabled',
      signal,
    })

    expect(mocks.api.get).toHaveBeenCalledWith('/admin/users', {
      params: { page: 2, limit: 25, role: 'instructor', accountStatus: 'disabled' },
      signal,
    })
    expect(mocks.requestCsrfToken).not.toHaveBeenCalled()
  })

  it('sends the revisioned account status patch with a fresh CSRF token', async () => {
    const signal = new AbortController().signal
    mocks.requestCsrfToken.mockResolvedValue('csrf-account')
    mocks.api.patch.mockResolvedValue({ data: { user: { id: 'user-id', revision: 5 } } })

    const result = await updateAdminUser(
      'user/id',
      { accountStatus: 'disabled', expectedRevision: 4 },
      signal,
    )

    expect(result.user.revision).toBe(5)
    expect(mocks.api.patch).toHaveBeenCalledWith(
      '/admin/users/user%2Fid',
      { accountStatus: 'disabled', expectedRevision: 4 },
      { signal, headers: { 'X-CSRF-Token': 'csrf-account' } },
    )
  })

  it('maps audit API failures to a safe local message', async () => {
    mocks.api.get.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { error: { code: 'REQUEST_FAILED', message: 'private server detail' } },
      },
    })

    await expect(listAuditEvents()).rejects.toMatchObject({
      name: 'AdminApiError',
      message: 'Sharlock is temporarily unavailable. Try again shortly.',
    })
  })

  it('maps account-control failures without exposing backend details', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf-account')
    mocks.api.patch
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: { code: 'ADMIN_STALE_ACCOUNT', message: 'private backend detail' } },
        },
      })
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            error: {
              code: 'ADMIN_INSTRUCTOR_ACTIVATION_REQUIRED',
              message: 'private backend detail',
            },
          },
        },
      })

    await expect(
      updateAdminUser('student-id', { accountStatus: 'disabled', expectedRevision: 1 }),
    ).rejects.toMatchObject({
      code: 'ADMIN_STALE_ACCOUNT',
      status: 409,
      message: 'This account changed elsewhere. The list was refreshed; review its latest status.',
    })
    await expect(
      updateAdminUser('instructor-id', { accountStatus: 'active', expectedRevision: 1 }),
    ).rejects.toMatchObject({
      code: 'ADMIN_INSTRUCTOR_ACTIVATION_REQUIRED',
      status: 409,
      message:
        'Disabled instructors must receive a new activation link and complete activation before access is restored.',
    })
  })

  it('uses a fresh CSRF token and exact payload for each mutation without replay', async () => {
    mocks.requestCsrfToken
      .mockResolvedValueOnce('csrf-one')
      .mockResolvedValueOnce('csrf-two')
      .mockResolvedValueOnce('csrf-three')
      .mockResolvedValueOnce('csrf-four')
      .mockResolvedValueOnce('csrf-five')
    mocks.api.post
      .mockResolvedValueOnce({ data: { id: 'institution-id' } })
      .mockResolvedValueOnce({ data: { id: 'cohort-id' } })
      .mockResolvedValueOnce({
        data: {
          instructor: { id: '0123456789abcdef01234567' },
          activationUrl: `${window.location.origin}/activate-account#token=${'A'.repeat(43)}`,
          expiresAt: '2026-10-16T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        data: {
          activationUrl: `${window.location.origin}/activate-account#token=${'B'.repeat(43)}`,
          expiresAt: '2026-10-16T00:00:00.000Z',
        },
      })
    mocks.api.put.mockResolvedValueOnce({
      data: { instructor: { id: '0123456789abcdef01234567' } },
    })

    const institution = { name: 'Example Academy', slug: 'example-academy' }
    const cohort = {
      institutionId: '0123456789abcdef01234567',
      name: 'Blue Class',
      term: '2026 Term 3',
    }
    const instructor = {
      email: 'teacher@example.test',
      username: 'Example_Teacher',
      avatarId: 'mint',
    }
    const assignments = { cohortIds: ['0123456789abcdef01234567'], expectedRevision: 3 }

    await createInstitution(institution)
    await createCohort(cohort)
    const created = await createInstructor(instructor)
    await reissueInstructorActivation('0123456789abcdef01234567')
    await updateInstructorAssignments('0123456789abcdef01234567', assignments)

    expect(mocks.requestCsrfToken).toHaveBeenCalledTimes(5)
    expect(mocks.api.post).toHaveBeenNthCalledWith(1, '/admin/institutions', institution, {
      signal: undefined,
      headers: { 'X-CSRF-Token': 'csrf-one' },
    })
    expect(mocks.api.post).toHaveBeenNthCalledWith(2, '/admin/cohorts', cohort, {
      signal: undefined,
      headers: { 'X-CSRF-Token': 'csrf-two' },
    })
    expect(mocks.api.post).toHaveBeenNthCalledWith(3, '/admin/instructors', instructor, {
      signal: undefined,
      headers: { 'X-CSRF-Token': 'csrf-three' },
    })
    expect(mocks.api.post).toHaveBeenNthCalledWith(
      4,
      '/admin/instructors/0123456789abcdef01234567/activation',
      undefined,
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-four' } },
    )
    expect(mocks.api.put).toHaveBeenCalledWith(
      '/admin/instructors/0123456789abcdef01234567/assignments',
      assignments,
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-five' } },
    )
    expect(created.activationUrl).toBe(
      `${window.location.origin}/activate-account#token=${'A'.repeat(43)}`,
    )
    expect(created.activationUrl).not.toContain('?')
  })

  it('posts administrator provisioning to its own endpoint and validates the returned link', async () => {
    const input = { email: 'boss@example.test', username: 'Example_Admin', avatarId: 'mint' }
    mocks.requestCsrfToken.mockResolvedValueOnce('csrf-admin')
    mocks.api.post.mockResolvedValueOnce({
      data: {
        administrator: { id: '0123456789abcdef01234567' },
        activationUrl: `${window.location.origin}/activate-account#token=${'D'.repeat(43)}`,
        expiresAt: '2026-10-16T00:00:00.000Z',
      },
    })
    const created = await createAdministrator(input)
    expect(mocks.api.post).toHaveBeenCalledWith('/admin/administrators', input, {
      signal: undefined,
      headers: { 'X-CSRF-Token': 'csrf-admin' },
    })
    expect(created.activationUrl).toContain('#token=')

    mocks.requestCsrfToken.mockResolvedValueOnce('csrf-admin-two')
    mocks.api.post.mockResolvedValueOnce({
      data: { activationUrl: 'https://evil.example.test/activate-account#token=x', expiresAt: 'x' },
    })
    await expect(createAdministrator(input)).rejects.toBeInstanceOf(Error)
  })

  it('lists, reissues and cancels pending administrators', async () => {
    const id = '0123456789abcdef01234567'
    mocks.api.get.mockResolvedValueOnce({ data: { administrators: [], total: 0 } })
    await listPendingAdministrators({ page: 1, limit: 20 })
    expect(mocks.api.get).toHaveBeenLastCalledWith('/admin/administrators/pending', {
      params: { page: 1, limit: 20 },
      signal: undefined,
    })

    mocks.requestCsrfToken.mockResolvedValueOnce('csrf-pa-one').mockResolvedValueOnce('csrf-pa-two')
    mocks.api.post
      .mockResolvedValueOnce({
        data: {
          activationUrl: `${window.location.origin}/activate-account#token=${'G'.repeat(43)}`,
          expiresAt: '2026-10-16T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({ data: { outcome: 'cancelled' } })
    const link = await reissueAdministratorActivation(id)
    expect(link.activationUrl).toContain('#token=')
    expect(mocks.api.post).toHaveBeenNthCalledWith(
      1,
      `/admin/administrators/${id}/activation`,
      undefined,
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-pa-one' } },
    )
    await expect(cancelPendingAdministrator(id)).resolves.toEqual({ outcome: 'cancelled' })
    expect(mocks.api.post).toHaveBeenNthCalledWith(
      2,
      `/admin/administrators/${id}/delete`,
      undefined,
      { signal: undefined, headers: { 'X-CSRF-Token': 'csrf-pa-two' } },
    )
  })

  it('uses revisioned allowlisted PATCH payloads for institutions and classes', async () => {
    const signal = new AbortController().signal
    mocks.requestCsrfToken
      .mockResolvedValueOnce('csrf-institution')
      .mockResolvedValueOnce('csrf-class')
    mocks.api.patch
      .mockResolvedValueOnce({ data: { institution: { id: 'institution-id', revision: 1 } } })
      .mockResolvedValueOnce({ data: { cohort: { id: 'cohort-id', revision: 2 } } })

    const institutionResult = await updateInstitution(
      'institution/id',
      { name: 'Renamed Academy', status: 'inactive', expectedRevision: 0 },
      signal,
    )
    const cohortResult = await updateCohort(
      'class/id',
      { name: 'Green Class', term: '2026 Term 4', status: 'active', expectedRevision: 1 },
      signal,
    )

    expect(institutionResult.institution.revision).toBe(1)
    expect(cohortResult.cohort.revision).toBe(2)
    expect(mocks.api.patch).toHaveBeenNthCalledWith(
      1,
      '/admin/institutions/institution%2Fid',
      { name: 'Renamed Academy', status: 'inactive', expectedRevision: 0 },
      { signal, headers: { 'X-CSRF-Token': 'csrf-institution' } },
    )
    expect(mocks.api.patch).toHaveBeenNthCalledWith(
      2,
      '/admin/cohorts/class%2Fid',
      { name: 'Green Class', term: '2026 Term 4', status: 'active', expectedRevision: 1 },
      { signal, headers: { 'X-CSRF-Token': 'csrf-class' } },
    )
  })

  it('maps stale institution and class responses to safe reload guidance', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf')
    mocks.api.patch
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: { code: 'ADMIN_STALE_INSTITUTION', message: 'private backend detail' } },
        },
      })
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: { code: 'ADMIN_STALE_COHORT', message: 'private backend detail' } },
        },
      })

    await expect(
      updateInstitution('institution-id', {
        name: 'Changed',
        status: 'active',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      code: 'ADMIN_STALE_INSTITUTION',
      status: 409,
      message: 'This institution changed elsewhere. Reload the list and review your changes.',
    })
    await expect(
      updateCohort('cohort-id', {
        name: 'Changed',
        term: '2026 T4',
        status: 'active',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      code: 'ADMIN_STALE_COHORT',
      status: 409,
      message: 'This class changed elsewhere. Reload the list and review your changes.',
    })
  })

  it('rejects unsafe returned activation URLs and maps server errors without raw text', async () => {
    mocks.requestCsrfToken.mockResolvedValue('csrf-one')
    for (const activationUrl of [
      'https://attacker.example/activate-account?token=private',
      `http://operator:private@${window.location.host}/activate-account#token=${'C'.repeat(43)}`,
    ]) {
      mocks.api.post.mockResolvedValueOnce({
        data: { activationUrl, expiresAt: '2026-10-16T00:00:00.000Z' },
      })
      await expect(
        createInstructor({
          email: 'teacher@example.test',
          username: 'Example_Teacher',
          avatarId: 'mint',
        }),
      ).rejects.toMatchObject({ code: 'ADMIN_UNAVAILABLE' })
    }

    mocks.api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: { code: 'ADMIN_CONFLICT', message: 'private server detail' } },
      },
    })
    await expect(
      createInstitution({ name: 'Example Academy', slug: 'example-academy' }),
    ).rejects.toMatchObject({
      name: 'AdminApiError',
      code: 'ADMIN_CONFLICT',
      message: 'This change conflicts with existing records. Review the details and try again.',
    })
    expect(mocks.api.post).toHaveBeenCalledTimes(3)
    expect(mocks.requestCsrfToken).toHaveBeenCalledTimes(3)
    expect(mocks.api.post.mock.calls[2][2].headers['X-CSRF-Token']).toBe('csrf-one')
  })
})
