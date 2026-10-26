import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClassManagementPage from '../pages/ClassManagementPage.vue'

const mocks = vi.hoisted(() => ({
  getEnrollmentCode: vi.fn(),
  issueValidatedEnrollmentCode: vi.fn(),
  listCohortMemberships: vi.fn(),
  listManagedCohorts: vi.fn(),
  revokeEnrollmentCode: vi.fn(),
  safeError: (error) => error,
  updateMembership: vi.fn(),
}))
vi.mock('../api.js', () => mocks)

const authMocks = vi.hoisted(() => ({
  auth: { user: { globalRoles: ['instructor'] } },
}))
vi.mock('../../auth/store.js', () => ({ useAuthStore: () => authMocks.auth }))

const recoveryMocks = vi.hoisted(() => ({
  issueInstructorRecovery: vi.fn(),
  safeRecoveryError: (error) => error,
}))
vi.mock('../../recovery/api.js', () => recoveryMocks)

const activeStudent = {
  id: 'membership-1',
  studentId: '111111111111111111111111',
  username: 'Casey_Student',
  email: 'casey@example.test',
  revision: 1,
}

describe('instructor class management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/instructor')
    authMocks.auth.user.globalRoles = ['instructor']
    mocks.listManagedCohorts.mockResolvedValue({
      cohorts: [
        { cohortId: 'class-a', cohortName: 'Blue Class', institutionName: 'Academy' },
        { cohortId: 'class-b', cohortName: 'Green Class', institutionName: 'Academy' },
      ],
      total: 2,
    })
    mocks.listCohortMemberships.mockImplementation(async (_cohortId, { status }) => ({
      memberships: status === 'active' ? [activeStudent] : [],
      total: status === 'active' ? 1 : 0,
    }))
    mocks.getEnrollmentCode.mockResolvedValue({ code: null, revision: 0 })
    mocks.issueValidatedEnrollmentCode.mockResolvedValue({
      id: 'code-a',
      revision: 1,
      expiresAt: '2099-01-01T00:00:00.000Z',
      rawCode: 'ABCDEFGHJKLMPQRS',
      code: { id: 'code-a', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null },
    })
    recoveryMocks.issueInstructorRecovery.mockResolvedValue({
      resetUrl: `http://localhost:5174/reset-password#token=${'R'.repeat(43)}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
  })

  it('clears a one-time code on class change and locks switching during a code mutation', async () => {
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('ABCD-EFGH-JKLM-PQRS')
    await wrapper.get('#managed-class').setValue('class-b')
    await flushPromises()
    expect(wrapper.text()).not.toContain('ABCD-EFGH-JKLM-PQRS')
    expect(mocks.getEnrollmentCode).toHaveBeenLastCalledWith('class-b', expect.any(AbortSignal))
    wrapper.unmount()
  })

  it('disables class switching while a code issue request is unresolved', async () => {
    let resolveIssue
    mocks.issueValidatedEnrollmentCode.mockReturnValue(
      new Promise((resolve) => {
        resolveIssue = resolve
      }),
    )
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Generate code'))
      .trigger('click')
    expect(wrapper.get('#managed-class').element.disabled).toBe(true)
    resolveIssue({
      id: 'code-a',
      revision: 1,
      expiresAt: '2099-01-01T00:00:00.000Z',
      rawCode: 'ABCDEFGHJKLMPQRS',
      code: { id: 'code-a', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('ABCD-EFGH-JKLM-PQRS')
    wrapper.unmount()
  })

  it('allows a pure instructor to issue a link for an active student in the selected class', async () => {
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Active')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get(`button[aria-label="Prepare password reset link for ${activeStudent.username}"]`)
      .trigger('click')
    await wrapper.get('.recovery-issue-form input[type="checkbox"]').setValue(true)
    await wrapper.get('.recovery-issue-form').trigger('submit')
    await flushPromises()

    expect(recoveryMocks.issueInstructorRecovery).toHaveBeenCalledWith(
      'class-a',
      activeStudent.studentId,
      expect.any(AbortSignal),
    )
    expect(wrapper.get('dialog').text()).toContain('Deliver this reset link privately')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Close and clear link')
      .trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the selected class in the address across a reload', async () => {
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    expect(new URLSearchParams(window.location.search).get('class')).toBe('class-a')
    await wrapper.get('#managed-class').setValue('class-b')
    await flushPromises()
    expect(new URLSearchParams(window.location.search).get('class')).toBe('class-b')
    wrapper.unmount()

    const reloaded = mount(ClassManagementPage)
    await flushPromises()
    expect(reloaded.get('#managed-class').element.value).toBe('class-b')
    expect(mocks.listCohortMemberships).toHaveBeenLastCalledWith('class-b', expect.any(Object))
    reloaded.unmount()
  })

  it('falls back to the first assigned class for an unknown class in the address', async () => {
    window.history.replaceState(null, '', '/instructor?class=class-z')
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    expect(wrapper.get('#managed-class').element.value).toBe('class-a')
    expect(new URLSearchParams(window.location.search).get('class')).toBe('class-a')
    expect(mocks.listCohortMemberships).not.toHaveBeenCalledWith('class-z', expect.anything())
    wrapper.unmount()
  })

  it('hides roster recovery actions from any admin-role account', async () => {
    authMocks.auth.user.globalRoles = ['instructor', 'admin']
    const wrapper = mount(ClassManagementPage)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Active')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('button[aria-label^="Prepare password reset link"]').exists()).toBe(false)
    expect(recoveryMocks.issueInstructorRecovery).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
