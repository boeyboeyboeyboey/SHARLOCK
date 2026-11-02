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

  it('marks the field invalid and shows one message when the server refuses a code', async () => {
    const wrapper = mount(JoinCohortForm, { props: { error: 'That class code is not valid.' } })
    expect(wrapper.get('#cohort-code').attributes('aria-invalid')).toBe('true')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toBe('That class code is not valid.')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toBe('Enter the 16-character class code.')
  })

  it('keeps membership statuses explicit and offers paging for long lists', async () => {
    const wrapper = mount(MembershipList, {
      props: {
        memberships: [
          {
            id: 'one',
            cohortName: 'Blue Class',
            institutionName: 'Academy',
            status: 'pending',
            cohortStatus: 'active',
            institutionStatus: 'active',
          },
        ],
        total: 41,
      },
    })
    expect(wrapper.text()).toContain('Request pending')
    expect(wrapper.text()).toContain('Waiting for your instructor to approve.')
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

  it('labels a member with their own status and asks before declining', async () => {
    const member = {
      id: 'one',
      username: 'Casey',
      email: 'casey@example.test',
      status: 'pending',
      revision: 1,
    }
    const wrapper = mount(EnrollmentQueue, { props: { status: 'removed', memberships: [member] } })
    expect(wrapper.text()).toContain('casey@example.test · pending')

    await wrapper.setProps({ status: 'pending' })
    await wrapper.get('[aria-label="Decline Casey"]').trigger('click')
    expect(wrapper.emitted('reject')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Yes, decline')
      .trigger('click')
    expect(wrapper.emitted('reject')[0][0].id).toBe('one')
  })

  it('disables queue actions while busy', () => {
    const wrapper = mount(EnrollmentQueue, {
      props: {
        status: 'active',
        busy: true,
        recoveryAllowed: true,
        memberships: [{ id: 'one', username: 'Casey', email: 'c@example.test', status: 'active' }],
      },
    })
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
  })

  it('asks before revoking or replacing a live code, and neither is the primary action', async () => {
    const wrapper = mount(EnrollmentCodePanel, {
      props: {
        code: { id: 'code-a', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null },
        revision: 3,
      },
    })
    const press = (label) =>
      wrapper
        .findAll('button')
        .find((button) => button.text() === label)
        .trigger('click')
    expect(wrapper.find('.btn-primary').exists()).toBe(false)

    await press('Replace code')
    expect(wrapper.emitted('generate')).toBeUndefined()
    expect(wrapper.text()).toContain('Students using the old code will be refused')
    await press('Yes, replace it')
    expect(wrapper.emitted('generate')[0]).toEqual([3])

    await press('Revoke code')
    await press('Keep this code')
    expect(wrapper.emitted('revoke')).toBeUndefined()
    await press('Revoke code')
    await press('Yes, revoke it')
    expect(wrapper.emitted('revoke')[0]).toEqual([{ id: 'code-a', revision: 3 }])
  })

  it('moves focus to the section heading once a revoke is confirmed', async () => {
    const wrapper = mount(EnrollmentCodePanel, {
      attachTo: document.body,
      props: {
        code: { id: 'code-a', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null },
        revision: 3,
      },
    })
    const press = (label) =>
      wrapper
        .findAll('button')
        .find((button) => button.text() === label)
        .trigger('click')
    await press('Revoke code')
    await press('Yes, revoke it')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('h2').element)
    wrapper.unmount()
  })

  it('offers a new code rather than a dead one once a code has expired', () => {
    const wrapper = mount(EnrollmentCodePanel, {
      props: { code: { id: 'code-a', expiresAt: '2000-01-01T00:00:00.000Z', revokedAt: null } },
    })
    expect(wrapper.text()).toContain('No active class code')
    expect(wrapper.text()).not.toContain('Code active until')
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
