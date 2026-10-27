import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeleteAccountDialog from '../components/DeleteAccountDialog.vue'

const mocks = vi.hoisted(() => {
  class TestAdminApiError extends Error {
    constructor(message, fieldErrors) {
      super(message)
      this.name = 'AdminApiError'
      this.fieldErrors = fieldErrors
    }
  }
  return { AdminApiError: TestAdminApiError, deleteAdminUser: vi.fn() }
})

vi.mock('../api.js', () => mocks)

const account = { id: 'student-id', username: 'Casey_Student', revision: 4 }

function mountDialog() {
  return mount(DeleteAccountDialog, { props: { account } })
}

async function fill(
  wrapper,
  { username = 'casey_student', reason = 'wrong-name', password = 'pw' } = {},
) {
  await wrapper.get('#delete-account-confirm').setValue(username)
  await wrapper.get('#delete-account-reason').setValue(reason)
  await wrapper.get('#delete-account-password').setValue(password)
}

const submitButton = (wrapper) => wrapper.get('button[type="submit"]')

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warns about irreversibility and explains anonymisation', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('This cannot be undone')
    expect(wrapper.text()).toContain('anonymised')
    expect(wrapper.text()).toContain('removed completely')
    expect(wrapper.get('#delete-account-password').attributes('autocomplete')).toBe(
      'current-password',
    )
    wrapper.unmount()
  })

  it('enables Delete only after a case-insensitive username match, a reason and a password', async () => {
    const wrapper = mountDialog()
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await fill(wrapper, { username: 'someone-else' })
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('#delete-account-confirm').setValue('CASEY_student')
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('requires a 10 to 500 character note only for Other', async () => {
    const wrapper = mountDialog()
    await fill(wrapper)
    expect(wrapper.find('#delete-account-note').exists()).toBe(false)

    await wrapper.get('#delete-account-reason').setValue('other')
    expect(wrapper.text()).toContain("Don't include names or emails.")
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('#delete-account-note').setValue('too short')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('#delete-account-note').setValue('Created by mistake')
    expect(wrapper.text()).toContain('18/500')
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('sends the exact body and emits the outcome', async () => {
    mocks.deleteAdminUser.mockResolvedValue({ outcome: 'deleted' })
    const wrapper = mountDialog()
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.deleteAdminUser).toHaveBeenCalledWith(
      'student-id',
      {
        confirmUsername: 'casey_student',
        password: 'pw',
        reasonCategory: 'wrong-name',
        expectedRevision: 4,
      },
      expect.any(AbortSignal),
    )
    expect(wrapper.emitted('deleted')).toEqual([['deleted']])
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('stays open on errors, shows them and clears the password', async () => {
    mocks.deleteAdminUser.mockRejectedValue(
      new mocks.AdminApiError('Check your password and try again.', {
        password: 'Enter your password.',
      }),
    )
    const wrapper = mountDialog()
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alerts = wrapper.findAll('[role="alert"]').map((node) => node.text())
    expect(alerts).toContain('Check your password and try again.')
    expect(alerts).toContain('Enter your password.')
    expect(wrapper.get('#delete-account-password').element.value).toBe('')
    expect(wrapper.emitted('deleted')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits close from Cancel', async () => {
    const wrapper = mountDialog()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')
      .trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
