import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ActivationLinkDialog from '../components/ActivationLinkDialog.vue'

const link = {
  activationUrl: `http://localhost:5174/activate-account#token=${'D'.repeat(43)}`,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

describe('ActivationLinkDialog', () => {
  it('shows the new copy guidance and a Close button', () => {
    const wrapper = mount(ActivationLinkDialog, { props: { link } })

    expect(wrapper.text()).toContain(
      "Copy this link now. It won't be shown again. It works once and expires in 24 hours.",
    )
    expect(wrapper.get('input[type="url"]').element.value).toBe(link.activationUrl)
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Close')
    expect(wrapper.text()).not.toContain('Close and clear link')
    wrapper.unmount()
  })

  const press = (wrapper, label) =>
    wrapper
      .findAll('button')
      .find((button) => button.text() === label)
      .trigger('click')

  it('asks before closing an uncopied link, and stays open if told to', async () => {
    const wrapper = mount(ActivationLinkDialog, { props: { link } })

    await press(wrapper, 'Close')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.text()).toContain('Close without copying?')
    await press(wrapper, 'Keep open')
    expect(wrapper.text()).not.toContain('Close without copying?')

    await press(wrapper, 'Close')
    await press(wrapper, 'Yes, close')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closes straight away once the link is copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue() },
    })
    const wrapper = mount(ActivationLinkDialog, { props: { link } })
    await press(wrapper, 'Copy activation link')
    await flushPromises()
    await press(wrapper, 'Close')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('treats escape like Close when the link is uncopied', async () => {
    const wrapper = mount(ActivationLinkDialog, { props: { link } })
    const cancel = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(cancel)
    await flushPromises()
    expect(cancel.defaultPrevented).toBe(true)
    expect(wrapper.text()).toContain('Close without copying?')
    wrapper.unmount()
  })

  it('names the account the link belongs to', () => {
    const wrapper = mount(ActivationLinkDialog, {
      props: { link: { ...link, username: 'Taylor', email: 'taylor@example.test' } },
    })
    expect(wrapper.text()).toContain('Link for Taylor (taylor@example.test)')
    wrapper.unmount()
  })
})
