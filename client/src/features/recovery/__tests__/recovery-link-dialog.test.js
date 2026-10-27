import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecoveryLinkDialog from '../components/RecoveryLinkDialog.vue'

const link = {
  resetUrl: `http://localhost:5174/reset-password#token=${'R'.repeat(43)}`,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

describe('RecoveryLinkDialog', () => {
  it('shows the new copy guidance and a Close button', () => {
    const wrapper = mount(RecoveryLinkDialog, { props: { link } })

    expect(wrapper.text()).toContain(
      "Copy this link now. It won't be shown again; it still works once and expires in 30 minutes.",
    )
    expect(wrapper.get('input[type="url"]').element.value).toBe(link.resetUrl)
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Close')
    expect(wrapper.text()).not.toContain('Close and clear link')
    wrapper.unmount()
  })

  it('emits close when the Close button is clicked', async () => {
    const wrapper = mount(RecoveryLinkDialog, { props: { link } })

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Close')
      .trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
