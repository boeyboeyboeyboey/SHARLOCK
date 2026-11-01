import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import RecoveryLinkDialog from '../components/RecoveryLinkDialog.vue'

const link = {
  resetUrl: `http://localhost:5174/reset-password#token=${'R'.repeat(43)}`,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

describe('RecoveryLinkDialog', () => {
  it('shows the new copy guidance and a Close button', () => {
    const wrapper = mount(RecoveryLinkDialog, { props: { link } })

    expect(wrapper.text()).toContain(
      "Copy this link now. It won't be shown again. It works once and expires in 30 minutes.",
    )
    expect(wrapper.get('input[type="url"]').element.value).toBe(link.resetUrl)
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Close')
    expect(wrapper.text()).not.toContain('Close and clear link')
    wrapper.unmount()
  })

  const buttonNamed = (wrapper, name) =>
    wrapper.findAll('button').find((button) => button.text() === name)

  it('names the student the link is for', () => {
    const wrapper = mount(RecoveryLinkDialog, {
      props: { link: { ...link, username: 'student-a1', email: 'a1@example.test' } },
    })
    expect(wrapper.text()).toContain('Link for student-a1 (a1@example.test)')
    wrapper.unmount()
  })

  it('asks before Close or Escape loses an uncopied link', async () => {
    const wrapper = mount(RecoveryLinkDialog, { props: { link } })

    await buttonNamed(wrapper, 'Close').trigger('click')
    expect(wrapper.text()).toContain('Close without copying?')
    expect(wrapper.emitted('close')).toBeUndefined()
    await buttonNamed(wrapper, 'Keep open').trigger('click')
    expect(wrapper.text()).not.toContain('Close without copying?')

    await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeUndefined()
    await buttonNamed(wrapper, 'Yes, close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closes at once after the link was copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue() },
    })
    const wrapper = mount(RecoveryLinkDialog, { props: { link } })
    await buttonNamed(wrapper, 'Copy reset link').trigger('click')
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.resetUrl)
    await buttonNamed(wrapper, 'Close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
