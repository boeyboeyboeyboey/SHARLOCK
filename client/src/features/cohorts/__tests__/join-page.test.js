import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearClassInvitation: vi.fn(),
  completeOnboarding: vi.fn(),
  getEnrollment: vi.fn(),
  joinClass: vi.fn(),
  listMemberships: vi.fn(),
  safeError: (error) => error,
  replace: vi.fn(),
  push: vi.fn(),
  restoreSession: vi.fn(),
  route: { query: { carry: '1' } },
  consumeAutomaticJoin: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))
vi.mock('../../auth/store.js', () => ({
  useAuthStore: () => ({ status: 'authenticated', restoreSession: mocks.restoreSession }),
}))
vi.mock('../api.js', () => ({
  clearClassInvitation: mocks.clearClassInvitation,
  completeOnboarding: mocks.completeOnboarding,
  getEnrollment: mocks.getEnrollment,
  joinClass: mocks.joinClass,
  listMemberships: mocks.listMemberships,
  safeError: mocks.safeError,
}))
vi.mock('../journey.js', () => ({
  captureInvitationCodeFromLocation: vi.fn(),
  captureInvitationCode: vi.fn(),
  clearHeldInvitation: vi.fn(),
  clearPendingInvitation: vi.fn(),
  consumeAutomaticJoin: mocks.consumeAutomaticJoin,
  getInvitationJoinInput: () => ({ invitation: true }),
  prepareInvitation: vi.fn().mockResolvedValue(false),
}))

import JoinClassPage from '../pages/JoinClassPage.vue'
import JoinCohortForm from '../components/JoinCohortForm.vue'

describe('join class page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.query = { carry: '1' }
    mocks.consumeAutomaticJoin.mockReturnValue(true)
    mocks.getEnrollment.mockResolvedValue({ hasInvitation: true })
    mocks.restoreSession.mockResolvedValue(undefined)
    mocks.listMemberships.mockResolvedValue({ memberships: [] })
    mocks.joinClass.mockRejectedValue(new Error('The class invitation has expired.'))
    mocks.clearClassInvitation.mockResolvedValue(undefined)
    mocks.completeOnboarding.mockResolvedValue(undefined)
  })

  it('keeps Skip available after a carried invitation fails and clears it before onboarding', async () => {
    const wrapper = mount(JoinClassPage)
    await flushPromises()

    const skip = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Skip and explore Sharlock'))
    expect(skip).toBeDefined()
    await skip.trigger('click')
    await flushPromises()

    expect(mocks.clearClassInvitation).toHaveBeenCalledOnce()
    expect(mocks.completeOnboarding).toHaveBeenCalledOnce()
    expect(mocks.clearClassInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.completeOnboarding.mock.invocationCallOrder[0],
    )
    expect(mocks.replace).toHaveBeenLastCalledWith('/')
  })

  it('shows the already-in-a-class state and hides the join form', async () => {
    mocks.route.query = {}
    mocks.getEnrollment.mockResolvedValue({ hasInvitation: false })
    mocks.listMemberships.mockResolvedValue({
      memberships: [
        { cohortName: 'Old Class', status: 'removed' },
        { cohortName: 'Blue Class', status: 'pending' },
      ],
    })
    const wrapper = mount(JoinClassPage, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    await flushPromises()

    const notice = wrapper.get('[data-testid="already-in-class"]')
    expect(notice.text()).toContain("You're already in Blue Class.")
    expect(notice.text()).toContain('Leave it first to join another.')
    expect(notice.get('a').attributes('href')).toBe('/classes')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('switches to the already-in-a-class state when the server answers 409', async () => {
    mocks.route.query = {}
    mocks.getEnrollment.mockResolvedValue({ hasInvitation: false })
    mocks.safeError = (error) => error
    const wrapper = mount(JoinClassPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="already-in-class"]').exists()).toBe(false)

    mocks.joinClass.mockRejectedValue({ code: 'COHORT_ALREADY_IN_CLASS', message: 'busy' })
    mocks.listMemberships.mockResolvedValue({
      memberships: [{ cohortName: 'Green Class', status: 'active' }],
    })
    wrapper.findComponent(JoinCohortForm).vm.$emit('submit', 'ABCDEFGHJKLMNPQR')
    await flushPromises()

    expect(wrapper.get('[data-testid="already-in-class"]').text()).toContain('Green Class')
  })
})
