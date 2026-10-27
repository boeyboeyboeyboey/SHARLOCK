import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import AdminPage from '../pages/AdminPage.vue'
import AccountStatusPanel from '../components/AccountStatusPanel.vue'
import AuditEventsPanel from '../components/AuditEventsPanel.vue'
import AssignmentEditor from '../components/AssignmentEditor.vue'
import InstitutionCohortForm from '../components/InstitutionCohortForm.vue'
import InstructorProvisionForm from '../components/InstructorProvisionForm.vue'

const mocks = vi.hoisted(() => {
  class TestAdminApiError extends Error {
    constructor(code, message, status = 0) {
      super(message)
      this.name = 'AdminApiError'
      this.code = code
      this.status = status
    }
  }
  return {
    AdminApiError: TestAdminApiError,
    listInstitutions: vi.fn(),
    listCohorts: vi.fn(),
    listInstructors: vi.fn(),
    listAdminUsers: vi.fn(),
    listAuditEvents: vi.fn(),
    createInstitution: vi.fn(),
    createCohort: vi.fn(),
    createInstructor: vi.fn(),
    reissueInstructorActivation: vi.fn(),
    updateInstructorAssignments: vi.fn(),
    updateAdminUser: vi.fn(),
    updateInstitution: vi.fn(),
    updateCohort: vi.fn(),
  }
})

vi.mock('../api.js', () => mocks)

const routerMocks = vi.hoisted(() => ({ route: null, replace: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => routerMocks.route,
  useRouter: () => ({ replace: routerMocks.replace }),
}))

const recoveryMocks = vi.hoisted(() => ({
  issueAdminRecovery: vi.fn(),
  lookupStudent: vi.fn(),
  safeRecoveryError: (error) => error,
}))
vi.mock('../../recovery/api.js', () => recoveryMocks)

const institution = {
  id: '111111111111111111111111',
  name: 'Synthetic Academy',
  slug: 'synthetic-academy',
  status: 'active',
  revision: 4,
}
const cohort = {
  id: '222222222222222222222222',
  institutionId: institution.id,
  institutionName: institution.name,
  name: 'Blue Class',
  term: '2026 Term 3',
  status: 'active',
  revision: 2,
  institutionStatus: 'active',
}
const instructor = {
  id: '333333333333333333333333',
  email: 'teacher@example.test',
  username: 'Synthetic_Teacher',
  avatarId: 'mint',
  accountStatus: 'active',
  assignmentRevision: 1,
  cohortIds: [],
}

function setDefaultLists({ instructorRows = [], institutionRows = [institution] } = {}) {
  mocks.listInstitutions.mockResolvedValue({
    institutions: institutionRows,
    page: 1,
    total: institutionRows.length,
  })
  mocks.listCohorts.mockImplementation(async ({ limit }) => ({
    cohorts: limit === 50 ? [cohort] : [cohort],
    page: 1,
    total: 1,
  }))
  mocks.listInstructors.mockResolvedValue({
    instructors: instructorRows,
    page: 1,
    total: instructorRows.length,
  })
  mocks.listAuditEvents.mockResolvedValue({ events: [], page: 1, total: 0 })
  mocks.listAdminUsers.mockResolvedValue({ users: [], page: 1, total: 0 })
}

describe('admin workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMocks.route = reactive({ query: {} })
    routerMocks.replace.mockImplementation(({ query }) => {
      routerMocks.route.query = query
    })
    setDefaultLists()
    mocks.createInstitution.mockResolvedValue({ id: institution.id })
    mocks.createCohort.mockResolvedValue({ id: cohort.id })
    mocks.updateInstitution.mockResolvedValue({ institution })
    mocks.updateCohort.mockResolvedValue({ cohort })
    mocks.updateAdminUser.mockResolvedValue({ user: {} })
    mocks.createInstructor.mockResolvedValue({ instructor })
    recoveryMocks.lookupStudent.mockResolvedValue({ student: null })
    recoveryMocks.issueAdminRecovery.mockResolvedValue({
      resetUrl: `http://localhost:5174/reset-password#token=${'R'.repeat(43)}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
  })

  it('filters audit events, expands identifiers, and pages through results', async () => {
    const event = {
      eventType: 'admin.cohort.create',
      actorKind: 'user',
      actorId: '111111111111111111111111',
      targetId: '222222222222222222222222',
      scopeCohortId: null,
      outcome: 'success',
      occurredAt: '2026-10-17T12:00:00.000Z',
      requestId: '33333333-3333-4333-8333-333333333333',
    }
    mocks.listAuditEvents.mockResolvedValue({ events: [event], page: 1, total: 30 })
    const wrapper = mount(AuditEventsPanel)
    await flushPromises()

    expect(wrapper.get('#admin-audit-event-type').text()).toContain('Institution updated')
    expect(wrapper.get('#admin-audit-event-type').text()).toContain('Account disabled')
    expect(wrapper.get('#admin-audit-event-type').text()).toContain('Account enabled')
    expect(wrapper.get('#admin-audit-event-type').text()).toContain('Class updated')

    const initialRequest = mocks.listAuditEvents.mock.calls[0][0]
    expect(initialRequest).toEqual(
      expect.objectContaining({ page: 1, limit: 25, signal: expect.any(AbortSignal) }),
    )
    expect(initialRequest).not.toHaveProperty('from')
    expect(initialRequest).not.toHaveProperty('to')
    expect(wrapper.text()).toContain('Class created')
    expect(wrapper.text()).toContain('success')
    await wrapper.get('.admin-workspace__audit-details summary').trigger('click')
    expect(wrapper.get('.admin-workspace__audit-details').element.open).toBe(true)
    expect(wrapper.text()).toContain(event.actorId)
    expect(wrapper.text()).toContain(event.requestId)

    await wrapper.get('#admin-audit-event-type').setValue('admin.cohort.create')
    await wrapper.get('.admin-workspace__audit-filters').trigger('submit')
    await flushPromises()
    const eventOnlyRequest = mocks.listAuditEvents.mock.calls.at(-1)[0]
    expect(eventOnlyRequest.eventType).toBe('admin.cohort.create')
    expect(eventOnlyRequest).not.toHaveProperty('from')
    expect(eventOnlyRequest).not.toHaveProperty('to')

    await wrapper.get('#admin-audit-from').setValue('2026-10-10T09:30')
    await wrapper.get('#admin-audit-to').setValue('2026-10-16T12:00')
    await wrapper.get('.admin-workspace__audit-filters').trigger('submit')
    await flushPromises()
    const filteredRequest = mocks.listAuditEvents.mock.calls.at(-1)[0]
    expect(filteredRequest.eventType).toBe('admin.cohort.create')
    expect(filteredRequest.from).toMatch(/Z$/)
    expect(filteredRequest.to).toMatch(/Z$/)
    expect(filteredRequest.page).toBe(1)

    await wrapper.get('[aria-label="Audit event pages"] button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.listAuditEvents.mock.calls.at(-1)[0].page).toBe(2)
    wrapper.unmount()
  })

  it('shows retry for temporary failures and a sign-in/access message for expired access', async () => {
    mocks.listAuditEvents
      .mockRejectedValueOnce(
        new mocks.AdminApiError(
          'REQUEST_FAILED',
          'Sharlock is temporarily unavailable. Try again shortly.',
          500,
        ),
      )
      .mockResolvedValueOnce({ events: [], page: 1, total: 0 })
    const wrapper = mount(AuditEventsPanel)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Try again')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No audit events match these filters.')
    wrapper.unmount()

    mocks.listAuditEvents.mockRejectedValueOnce(
      new mocks.AdminApiError('AUTHENTICATION_REQUIRED', 'Session expired.', 401),
    )
    const expired = mount(AuditEventsPanel)
    await flushPromises()
    expect(expired.get('[role="alert"]').text()).toContain('Sign in again')
    expect(expired.find('[role="alert"] button').exists()).toBe(false)
    expired.unmount()
  })

  it('clears previously loaded audit rows when administrator access expires', async () => {
    const event = {
      eventType: 'admin.cohort.create',
      actorKind: 'user',
      actorId: null,
      targetId: '888888888888888888888888',
      scopeCohortId: null,
      outcome: 'success',
      occurredAt: '2026-10-17T12:00:00.000Z',
      requestId: '99999999-9999-4999-8999-999999999999',
    }
    mocks.listAuditEvents
      .mockResolvedValueOnce({ events: [event], page: 1, total: 1 })
      .mockRejectedValueOnce(
        new mocks.AdminApiError('AUTHENTICATION_REQUIRED', 'Your session ended.', 401),
      )
    const wrapper = mount(AuditEventsPanel)
    await flushPromises()
    expect(wrapper.get('.admin-workspace__audit-list').text()).toContain(event.targetId)

    await wrapper.get('.admin-workspace__section-heading button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Sign in again')
    expect(wrapper.find('.admin-workspace__audit-list').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Audit event pages"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(event.targetId)
    wrapper.unmount()
  })

  it('keeps the displayed page and rows aligned when a next-page request fails', async () => {
    const firstPageEvent = {
      eventType: 'admin.institution.create',
      actorKind: 'user',
      actorId: null,
      targetId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      scopeCohortId: null,
      outcome: 'success',
      occurredAt: '2026-10-17T12:00:00.000Z',
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }
    const secondPageEvent = {
      ...firstPageEvent,
      targetId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }
    mocks.listAuditEvents
      .mockResolvedValueOnce({ events: [firstPageEvent], page: 1, total: 50 })
      .mockRejectedValueOnce(
        new mocks.AdminApiError(
          'REQUEST_FAILED',
          'Sharlock is temporarily unavailable. Try again shortly.',
          500,
        ),
      )
      .mockResolvedValueOnce({ events: [secondPageEvent], page: 2, total: 50 })
    const wrapper = mount(AuditEventsPanel)
    await flushPromises()

    await wrapper.get('[aria-label="Audit event pages"] button:last-child').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Audit event pages"]').text()).toContain('Page 1 of 2')
    expect(wrapper.get('.admin-workspace__audit-list').text()).toContain(firstPageEvent.targetId)
    expect(wrapper.get('[role="alert"]').text()).toContain('Try again')

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(mocks.listAuditEvents.mock.calls.at(-1)[0].page).toBe(2)
    expect(wrapper.get('[aria-label="Audit event pages"]').text()).toContain('Page 2 of 2')
    expect(wrapper.get('.admin-workspace__audit-list').text()).toContain(secondPageEvent.targetId)
    wrapper.unmount()
  })

  it('cancels an outdated audit request when filters are reapplied', async () => {
    let resolveFirst
    mocks.listAuditEvents.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    mocks.listAuditEvents.mockResolvedValueOnce({
      events: [
        {
          eventType: 'admin.institution.create',
          actorKind: 'user',
          actorId: null,
          targetId: '444444444444444444444444',
          scopeCohortId: null,
          outcome: 'success',
          occurredAt: '2026-10-17T12:00:00.000Z',
          requestId: '55555555-5555-4555-8555-555555555555',
        },
      ],
      page: 1,
      total: 1,
    })
    const wrapper = mount(AuditEventsPanel)
    const firstSignal = mocks.listAuditEvents.mock.calls[0][0].signal
    await wrapper.get('.admin-workspace__audit-filters').trigger('submit')
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    resolveFirst({
      events: [
        {
          eventType: 'admin.cohort.create',
          actorKind: 'user',
          actorId: null,
          targetId: '666666666666666666666666',
          scopeCohortId: null,
          outcome: 'success',
          occurredAt: '2026-10-17T11:00:00.000Z',
          requestId: '77777777-7777-4777-8777-777777777777',
        },
      ],
      page: 1,
      total: 1,
    })
    await flushPromises()
    const resultRows = wrapper.get('.admin-workspace__audit-list').text()
    expect(resultRows).toContain('Institution created')
    expect(resultRows).not.toContain('Class created')
    wrapper.unmount()
  })

  it('emits only the approved institution and class fields', async () => {
    const wrapper = mount(InstitutionCohortForm, {
      props: {
        institutions: [institution],
        selectedInstitutionId: institution.id,
      },
    })
    await wrapper.get('#admin-institution-name').setValue('Synthetic Academy')
    await wrapper.get('#admin-institution-slug').setValue('synthetic-academy')
    await wrapper.findAll('form')[0].trigger('submit')

    await wrapper.get('#admin-cohort-institution').setValue(institution.id)
    await wrapper.get('#admin-cohort-name').setValue('Blue Class')
    await wrapper.get('#admin-cohort-term').setValue('2026 Term 3')
    await wrapper.findAll('form')[1].trigger('submit')

    expect(wrapper.emitted('create-institution')[0][0]).toEqual({
      name: 'Synthetic Academy',
      slug: 'synthetic-academy',
    })
    expect(wrapper.emitted('create-cohort')[0][0]).toEqual({
      institutionId: institution.id,
      name: 'Blue Class',
      term: '2026 Term 3',
    })
    wrapper.unmount()
  })

  it('emits revisioned institution and class edits while leaving institution identity fixed', async () => {
    const inactiveInstitution = {
      ...institution,
      id: '444444444444444444444444',
      status: 'inactive',
    }
    const wrapper = mount(InstitutionCohortForm, {
      props: {
        institutions: [institution, inactiveInstitution],
        cohorts: [cohort],
        selectedInstitutionId: institution.id,
      },
    })

    expect(
      wrapper.findAll('#admin-cohort-institution option').map((option) => option.element.value),
    ).toEqual(['', institution.id])
    await wrapper.get('[aria-label="Edit Synthetic Academy"]').trigger('click')
    expect(wrapper.get('.admin-workspace__edit-form').find('input[name="slug"]').exists()).toBe(
      false,
    )
    await wrapper
      .get('#admin-institution-edit-name-111111111111111111111111')
      .setValue('Updated Academy')
    await wrapper
      .get('#admin-institution-edit-status-111111111111111111111111')
      .setValue('inactive')
    await wrapper.get('.admin-workspace__edit-form').trigger('submit')
    expect(wrapper.emitted('update-institution')[0][0]).toEqual({
      id: institution.id,
      name: 'Updated Academy',
      status: 'inactive',
      expectedRevision: institution.revision,
    })

    await wrapper.get('[aria-label="Edit Blue Class"]').trigger('click')
    expect(
      wrapper.get('.admin-workspace__edit-form').find('#admin-cohort-institution').exists(),
    ).toBe(false)
    await wrapper.get('#admin-cohort-edit-name-222222222222222222222222').setValue('Green Class')
    await wrapper.get('#admin-cohort-edit-term-222222222222222222222222').setValue('2026 Term 4')
    await wrapper.get('#admin-cohort-edit-status-222222222222222222222222').setValue('inactive')
    await wrapper.get('.admin-workspace__edit-form').trigger('submit')
    expect(wrapper.emitted('update-cohort')[0][0]).toEqual({
      id: cohort.id,
      name: 'Green Class',
      term: '2026 Term 4',
      status: 'inactive',
      expectedRevision: cohort.revision,
    })
    wrapper.unmount()
  })

  it('keeps assigned inactive classes visible, read-only, and in the replacement payload', async () => {
    const inactive = {
      ...cohort,
      id: '555555555555555555555555',
      name: 'Retained Class',
      status: 'inactive',
      institutionStatus: 'active',
    }
    const inactiveParentClass = {
      ...cohort,
      id: '666666666666666666666666',
      name: 'Closed Institution Class',
      institutionStatus: 'inactive',
    }
    const wrapper = mount(AssignmentEditor, {
      props: {
        instructor: { ...instructor, cohortIds: [inactive.id], assignedCohorts: [inactive] },
        cohorts: [cohort, inactiveParentClass],
      },
    })
    expect(wrapper.text()).toContain('Retained Class')
    expect(wrapper.text()).toContain('Inactive; retained assignment')
    expect(wrapper.text()).not.toContain('Closed Institution Class')
    expect(
      wrapper.find('input[aria-label="Retained Class, Synthetic Academy, 2026 Term 3"]').exists(),
    ).toBe(false)
    await wrapper
      .get('input[aria-label="Blue Class, Synthetic Academy, 2026 Term 3"]')
      .setValue(true)
    await wrapper.get('.admin-workspace__button').trigger('click')
    expect(wrapper.emitted('save')[0][0].input.cohortIds).toEqual([inactive.id, cohort.id])
    wrapper.unmount()
  })

  it('submits allowlisted institution edits with the listed revision and reloads current records', async () => {
    const wrapper = mount(AdminPage)
    await flushPromises()

    await wrapper.get('[aria-label="Edit Synthetic Academy"]').trigger('click')
    await wrapper
      .get('#admin-institution-edit-name-111111111111111111111111')
      .setValue('Updated Academy')
    await wrapper
      .get('#admin-institution-edit-status-111111111111111111111111')
      .setValue('inactive')
    await wrapper.get('.admin-workspace__edit-form').trigger('submit')
    await flushPromises()

    expect(mocks.updateInstitution).toHaveBeenCalledWith(
      institution.id,
      { name: 'Updated Academy', status: 'inactive', expectedRevision: institution.revision },
      expect.any(AbortSignal),
    )
    expect(mocks.listInstitutions).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#admin-institution-edit-name-111111111111111111111111').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })

  it('reloads a stale class revision and asks the administrator to review the latest record', async () => {
    mocks.updateCohort.mockRejectedValueOnce(
      new mocks.AdminApiError(
        'ADMIN_STALE_COHORT',
        'This class changed elsewhere. Reload the list and review your changes.',
        409,
      ),
    )
    const wrapper = mount(AdminPage)
    await flushPromises()

    await wrapper.get('[aria-label="Edit Blue Class"]').trigger('click')
    await wrapper.get('#admin-cohort-edit-name-222222222222222222222222').setValue('Green Class')
    await wrapper.get('.admin-workspace__edit-form').trigger('submit')
    await flushPromises()

    expect(mocks.updateCohort).toHaveBeenCalledWith(
      cohort.id,
      {
        name: 'Green Class',
        term: cohort.term,
        status: cohort.status,
        expectedRevision: cohort.revision,
      },
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain(
      'This class changed elsewhere. Reload the list and review your changes.',
    )
    expect(mocks.listInstructors).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#admin-cohort-edit-name-222222222222222222222222').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the shared 32-character username limit for instructor setup', async () => {
    const wrapper = mount(InstructorProvisionForm)
    const username = wrapper.get('#admin-instructor-username')
    expect(username.attributes('maxlength')).toBe('32')
    expect(wrapper.get('#admin-instructor-username-hint').text()).toContain('3–32')

    await wrapper.get('#admin-instructor-email').setValue('teacher@example.test')
    await username.setValue('A'.repeat(32))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('provision')[0][0]).toEqual({
      email: 'teacher@example.test',
      username: 'A'.repeat(32),
      avatarId: 'mint',
    })
    wrapper.unmount()
  })

  it('shows the one-time link after provisioning and clears it when the dialog closes', async () => {
    const activationUrl = `http://localhost:5174/activate-account#token=${'C'.repeat(43)}`
    mocks.createInstructor.mockResolvedValueOnce({
      instructor,
      activationUrl,
      expiresAt: '2026-10-16T00:00:00.000Z',
    })
    const wrapper = mount(AdminPage)
    await flushPromises()

    await wrapper.get('#admin-instructor-email').setValue('teacher@example.test')
    await wrapper.get('#admin-instructor-username').setValue('Synthetic_Teacher')
    await wrapper
      .findAll('form')
      .find((form) => form.text().includes('Instructor email'))
      .trigger('submit')
    await flushPromises()

    expect(mocks.createInstructor).toHaveBeenCalledWith(
      { email: 'teacher@example.test', username: 'Synthetic_Teacher', avatarId: 'mint' },
      expect.any(AbortSignal),
    )
    expect(wrapper.get('#admin-activation-link').element.value).toBe(activationUrl)
    await wrapper
      .get('dialog')
      .findAll('button')
      .find((button) => button.text() === 'Close')
      .trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('C'.repeat(43))
    wrapper.unmount()
  })

  it('preserves a stale assignment draft until the administrator reloads it manually', async () => {
    setDefaultLists({ instructorRows: [instructor] })
    mocks.updateInstructorAssignments.mockRejectedValue(
      new mocks.AdminApiError('ADMIN_STALE_ASSIGNMENTS', 'private backend detail'),
    )
    const wrapper = mount(AdminPage)
    await flushPromises()

    const checkbox = wrapper.get('.admin-workspace__assignment input')
    await checkbox.setValue(true)
    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save assignments'))
    await saveButton.trigger('click')
    await flushPromises()

    expect(mocks.updateInstructorAssignments).toHaveBeenCalledWith(
      instructor.id,
      { cohortIds: [cohort.id], expectedRevision: 1 },
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('Your draft is preserved.')
    expect(checkbox.element.checked).toBe(true)
    expect(mocks.listInstructors).toHaveBeenCalledTimes(1)

    mocks.listInstructors.mockResolvedValueOnce({
      instructors: [{ ...instructor, assignmentRevision: 2, cohortIds: [] }],
      page: 1,
      total: 1,
    })
    const reloadButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reload assignments')
    await reloadButton.trigger('click')
    await flushPromises()

    expect(checkbox.element.checked).toBe(false)
    expect(mocks.listInstructors).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('looks up the exact student, requires attestation, and clears the issued link on close', async () => {
    const target = {
      id: '444444444444444444444444',
      username: 'Casey_Student',
      email: 'casey@example.test',
      avatarId: 'mint',
    }
    recoveryMocks.lookupStudent.mockResolvedValueOnce({ student: target })
    const wrapper = mount(AdminPage)
    await flushPromises()

    await wrapper.get('#recovery-student-email').setValue(target.email)
    await wrapper.get('.recovery-lookup').trigger('submit')
    await flushPromises()
    expect(recoveryMocks.lookupStudent).toHaveBeenCalledWith(target.email, expect.any(AbortSignal))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Select student')
      .trigger('click')
    const checkbox = wrapper.get('input[type="checkbox"]')
    expect(wrapper.get('.recovery-issue-form button[type="submit"]').element.disabled).toBe(true)
    await checkbox.setValue(true)
    await wrapper.get('.recovery-issue-form').trigger('submit')
    await flushPromises()

    expect(recoveryMocks.issueAdminRecovery).toHaveBeenCalledWith(
      target.id,
      expect.any(AbortSignal),
    )
    expect(wrapper.get('dialog').text()).toContain('Deliver this reset link privately')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Close')
      .trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.find('input#recovery-link-value').exists()).toBe(false)
    expect(wrapper.find('.recovery-issue-form').exists()).toBe(true)
    expect(wrapper.find('.recovery-issue-form input[type="checkbox"]').element.checked).toBe(true)
    wrapper.unmount()
  })

  it('filters the minimal student and instructor account list', async () => {
    mocks.listAdminUsers.mockResolvedValue({ users: [], page: 1, total: 0 })
    const wrapper = mount(AccountStatusPanel)
    await flushPromises()

    expect(mocks.listAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 25, signal: expect.any(AbortSignal) }),
    )
    await wrapper.get('select').setValue('student')
    await wrapper.findAll('select')[1].setValue('active')
    await wrapper.get('.admin-workspace__account-filters').trigger('submit')
    await flushPromises()

    expect(mocks.listAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        role: 'student',
        accountStatus: 'active',
        signal: expect.any(AbortSignal),
      }),
    )
    wrapper.unmount()
  })

  it('labels the status buttons by the action they perform', async () => {
    const make = (id, role, accountStatus) => ({
      id,
      username: `User_${id}`,
      avatarId: 'mint',
      globalRoles: [role],
      accountStatus,
      revision: 1,
    })
    mocks.listAdminUsers.mockResolvedValue({
      users: [
        make('a', 'student', 'active'),
        make('b', 'student', 'disabled'),
        make('c', 'instructor', 'disabled'),
      ],
      page: 1,
      total: 3,
    })
    const wrapper = mount(AccountStatusPanel)
    await flushPromises()

    expect(wrapper.findAll('tbody button').map((button) => button.text())).toEqual([
      'Disable account',
      'Enable account',
      'Reissue activation link',
    ])
    wrapper.unmount()
  })

  it('confirms student disable, sends the revision, and uses activation for disabled instructors', async () => {
    const student = {
      id: 'student-id',
      username: 'Casey_Student',
      avatarId: 'mint',
      globalRoles: ['student'],
      accountStatus: 'active',
      revision: 4,
    }
    const disabledInstructor = {
      id: 'instructor-id',
      username: 'Taylor_Teacher',
      avatarId: 'blue',
      globalRoles: ['instructor'],
      accountStatus: 'disabled',
      revision: 9,
    }
    mocks.listAdminUsers.mockResolvedValue({
      users: [student, disabledInstructor],
      page: 1,
      total: 2,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(AccountStatusPanel)
    await flushPromises()

    await wrapper.findAll('tbody button')[0].trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Their class memberships and instructor assignments remain.'),
    )
    expect(mocks.updateAdminUser).toHaveBeenCalledWith(
      student.id,
      { accountStatus: 'disabled', expectedRevision: 4 },
      expect.any(AbortSignal),
    )

    await wrapper.findAll('tbody button')[1].trigger('click')
    expect(wrapper.emitted('reissue-activation')).toEqual([[disabledInstructor.id]])
    expect(mocks.updateAdminUser).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    confirm.mockRestore()
  })

  it('reloads after a stale account revision and displays only safe guidance', async () => {
    const student = {
      id: 'student-id',
      username: 'Casey_Student',
      avatarId: 'mint',
      globalRoles: ['student'],
      accountStatus: 'active',
      revision: 4,
    }
    mocks.listAdminUsers.mockResolvedValue({ users: [student], page: 1, total: 1 })
    mocks.updateAdminUser.mockRejectedValue(
      new mocks.AdminApiError(
        'ADMIN_STALE_ACCOUNT',
        'This account changed elsewhere. The list was refreshed; review its latest status.',
        409,
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(AccountStatusPanel)
    await flushPromises()

    await wrapper.get('tbody button').trigger('click')
    await flushPromises()

    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="alert"]').text()).toContain('review its latest status')
    expect(wrapper.text()).not.toContain('private backend detail')
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('clears loaded account rows when a status change loses administrator access', async () => {
    const student = {
      id: 'student-id',
      username: 'Casey_Student',
      avatarId: 'mint',
      globalRoles: ['student'],
      accountStatus: 'active',
      revision: 4,
    }
    mocks.listAdminUsers.mockResolvedValue({ users: [student], page: 1, total: 1 })
    mocks.updateAdminUser.mockRejectedValue(
      new mocks.AdminApiError('AUTHENTICATION_REQUIRED', 'Your session ended. Sign in again.', 401),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(AccountStatusPanel)
    await flushPromises()

    expect(wrapper.text()).toContain(student.username)
    await wrapper.get('tbody button').trigger('click')
    await flushPromises()

    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('Your session ended. Sign in again.')
    expect(wrapper.text()).not.toContain(student.username)
    expect(wrapper.text()).not.toContain('Page 1 of 1')
    wrapper.unmount()
    confirm.mockRestore()
  })

  it('clears loaded account rows when instructor activation reissue loses access', async () => {
    mocks.listAdminUsers.mockResolvedValue({
      users: [
        {
          id: instructor.id,
          username: instructor.username,
          avatarId: instructor.avatarId,
          globalRoles: ['instructor'],
          accountStatus: 'disabled',
          revision: 5,
        },
      ],
      page: 1,
      total: 1,
    })
    mocks.reissueInstructorActivation.mockRejectedValue(
      new mocks.AdminApiError('AUTHENTICATION_REQUIRED', 'Your session ended. Sign in again.', 401),
    )
    const wrapper = mount(AdminPage)
    await flushPromises()

    expect(wrapper.text()).toContain(instructor.username)
    await wrapper.get('tbody button').trigger('click')
    await flushPromises()

    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('Your session ended. Sign in again.')
    expect(wrapper.text()).not.toContain(instructor.username)
    wrapper.unmount()
  })
  describe('tabs', () => {
    async function mountTabs(query = {}) {
      routerMocks.route.query = query
      const wrapper = mount(AdminPage, { attachTo: document.body })
      await flushPromises()
      return wrapper
    }

    it('renders four tabs with tab semantics and defaults to institutions', async () => {
      const wrapper = await mountTabs()
      const tabs = wrapper.findAll('[role="tab"]')
      expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Admin sections')
      expect(tabs.map((item) => item.text())).toEqual([
        'Institutions & classes',
        'Instructors',
        'Accounts',
        'Audit log',
      ])
      expect(tabs.map((item) => item.attributes('aria-selected'))).toEqual([
        'true',
        'false',
        'false',
        'false',
      ])
      expect(tabs.map((item) => item.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
      tabs.forEach((item) => {
        const panel = wrapper.get(`#${item.attributes('aria-controls')}`)
        expect(panel.attributes('role')).toBe('tabpanel')
        expect(panel.attributes('aria-labelledby')).toBe(item.attributes('id'))
      })
      wrapper.unmount()
    })

    it('shows only the selected panel and keeps the others mounted', async () => {
      const wrapper = await mountTabs({ tab: 'audit' })
      expect(wrapper.get('#admin-panel-audit').isVisible()).toBe(true)
      expect(wrapper.get('#admin-panel-institutions').isVisible()).toBe(false)
      expect(wrapper.get('#admin-panel-accounts').isVisible()).toBe(false)
      expect(wrapper.find('#admin-panel-institutions form').exists()).toBe(true)
      wrapper.unmount()
    })

    it('falls back to institutions for an invalid tab value', async () => {
      const wrapper = await mountTabs({ tab: 'nope' })
      expect(wrapper.get('#admin-tab-institutions').attributes('aria-selected')).toBe('true')
      wrapper.unmount()
    })

    it('writes the chosen tab to the query and keeps other query values', async () => {
      const wrapper = await mountTabs({ page: '2' })
      await wrapper.get('#admin-tab-accounts').trigger('click')
      expect(routerMocks.replace).toHaveBeenCalledWith({ query: { page: '2', tab: 'accounts' } })
      expect(wrapper.get('#admin-tab-accounts').attributes('aria-selected')).toBe('true')
      wrapper.unmount()
    })

    it('moves selection and focus with arrow, Home and End keys', async () => {
      const wrapper = await mountTabs()
      const tablist = wrapper.get('[role="tablist"]')
      await tablist.trigger('keydown', { key: 'ArrowLeft' })
      expect(wrapper.get('#admin-tab-audit').attributes('aria-selected')).toBe('true')
      expect(document.activeElement.id).toBe('admin-tab-audit')
      await tablist.trigger('keydown', { key: 'ArrowRight' })
      expect(wrapper.get('#admin-tab-institutions').attributes('aria-selected')).toBe('true')
      await tablist.trigger('keydown', { key: 'End' })
      expect(wrapper.get('#admin-tab-audit').attributes('aria-selected')).toBe('true')
      await tablist.trigger('keydown', { key: 'Home' })
      expect(wrapper.get('#admin-tab-institutions').attributes('aria-selected')).toBe('true')
      wrapper.unmount()
    })
  })
})
