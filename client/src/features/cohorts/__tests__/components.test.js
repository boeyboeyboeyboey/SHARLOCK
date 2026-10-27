import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EnrollmentCodePanel from '../components/EnrollmentCodePanel.vue'
import EnrollmentQueue from '../components/EnrollmentQueue.vue'
import JoinCohortForm from '../components/JoinCohortForm.vue'
import MembershipList from '../components/MembershipList.vue'

describe('cohort components', () => {
  it('validates and emits a normalized class code only after user submission', async () => {
    const wrapper = mount(JoinCohortForm)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Enter the 16-character class code.')
    await wrapper.get('#cohort-code').setValue('abcd-efgh-jklm-pqrs')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')[0]).toEqual(['ABCDEFGHJKLMPQRS'])
  })

  it('keeps membership statuses explicit and offers paging for long lists', async () => {
    const wrapper = mount(MembershipList, {
      props: {
        memberships: [
          { id: 'one', cohortName: 'Blue Class', institutionName: 'Academy', status: 'pending' },
        ],
        total: 41,
      },
    })
    expect(wrapper.text()).toContain('Request pending')
    expect(wrapper.text()).toContain('Page 1 of 3')
    await wrapper.setProps({
      memberships: [
        {
          id: 'two',
          cohortName: 'Green Class',
          institutionName: 'Academy',
          status: 'removed',
          decision: 'declined',
        },
      ],
      total: 1,
    })
    expect(wrapper.text()).toContain('Request declined')
    await wrapper.setProps({
      memberships: [
        {
          id: 'three',
          cohortName: 'Blue Class',
          institutionName: 'Academy',
          status: 'pending',
          cohortStatus: 'inactive',
          institutionStatus: 'active',
        },
      ],
    })
    expect(wrapper.text()).toContain('Request pending')
    expect(wrapper.text()).toContain('Class unavailable')
  })

  it('shows only permitted queue actions for each member state', async () => {
    const wrapper = mount(EnrollmentQueue, {
      props: {
        status: 'pending',
        memberships: [{ id: 'one', username: 'Casey', email: 'casey@example.test', revision: 1 }],
      },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('approve')[0][0].id).toBe('one')
    await wrapper.setProps({ status: 'removed' })
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('clears a one-time code when its dialog control closes', async () => {
    const wrapper = mount(EnrollmentCodePanel, {
      props: { invitationUrl: 'http://localhost:5174/join-class#code=ABCDEFGHJKLMNPQR' },
    })
    wrapper.vm.receiveCode('ABCDEFGHJKLMNPQR')
    await flushPromises()
    expect(wrapper.text()).toContain('ABCD-EFGH-JKLM-NPQR')
    expect(wrapper.get('input[aria-label="Invitation link"]').element.value).toContain(
      '/join-class#code=',
    )
    await wrapper.get('button:last-of-type').trigger('click')
    expect(wrapper.text()).not.toContain('ABCD-EFGH-JKLM-NPQR')
  })

  it('disables code actions while the class code is loading', async () => {
    const wrapper = mount(EnrollmentCodePanel, { props: { loading: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: false })
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })
})
