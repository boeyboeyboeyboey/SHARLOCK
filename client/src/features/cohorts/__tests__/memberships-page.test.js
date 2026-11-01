import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  joinClass: vi.fn(),
  listMemberships: vi.fn(),
  safeError: (error) => error,
}))
vi.mock('../api.js', () => mocks)

import MembershipsPage from '../pages/MembershipsPage.vue'

const row = {
  id: 'one',
  cohortName: 'Blue Class',
  institutionName: 'Academy',
  status: 'pending',
  cohortStatus: 'active',
  institutionStatus: 'active',
}

async function submit(wrapper) {
  await wrapper.get('#cohort-code').setValue('ABCD-EFGH-JKLM-PQRS')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('your classes page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listMemberships.mockResolvedValue({ memberships: [], total: 0 })
  })

  it('leaves the heading to the overlay it opens in', async () => {
    const wrapper = mount(MembershipsPage)
    await flushPromises()
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  it('sends a code, says what happens next and lists the new request', async () => {
    mocks.joinClass.mockResolvedValue({})
    const wrapper = mount(MembershipsPage)
    await flushPromises()
    mocks.listMemberships.mockResolvedValue({ memberships: [row], total: 1 })
    await submit(wrapper)
    expect(wrapper.get('[role="status"]').text()).toContain('Class access begins after staff')
    expect(wrapper.text()).toContain('Blue Class')
    expect(wrapper.text()).toContain('Waiting for your instructor to approve.')
  })

  it('shows a refused code once', async () => {
    mocks.joinClass.mockRejectedValue({ message: 'That class code is not valid.' })
    const wrapper = mount(MembershipsPage)
    await flushPromises()
    await submit(wrapper)
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text()).toBe('That class code is not valid.')
  })

  it('keeps a failed list load apart from the join form, with a retry', async () => {
    mocks.listMemberships.mockRejectedValueOnce({ message: 'List unavailable.' })
    const wrapper = mount(MembershipsPage)
    await flushPromises()
    expect(wrapper.get('#cohort-code').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('[role="alert"]').text()).toContain('List unavailable.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
