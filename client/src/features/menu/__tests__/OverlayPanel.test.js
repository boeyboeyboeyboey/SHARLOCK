import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OverlayPanel from '../OverlayPanel.vue'
import { useAuthStore } from '../../auth/store.js'

let wrapper
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => wrapper?.unmount())

describe('OverlayPanel', () => {
  it('names the dialog with a plain heading and a labelled close button', () => {
    wrapper = mount(OverlayPanel, {
      props: { title: 'Profile', teleport: false },
      global: { plugins: [createPinia()] },
    })
    const heading = wrapper.get('h2')
    expect(heading.text()).toBe('Profile')
    expect(wrapper.get('dialog').attributes('aria-labelledby')).toBe(heading.attributes('id'))
    expect(wrapper.get('[aria-label="Close Profile"]').exists()).toBe(true)
  })

  const open = (props = {}) => {
    wrapper = mount(OverlayPanel, {
      props: { title: 'Profile', teleport: false, ...props },
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    return wrapper
  }

  it('opens as a modal and starts on the heading', () => {
    open()
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(document.activeElement).toBe(wrapper.get('h2').element)
  })

  it('asks to close on Escape, on the close button and on the backdrop only', async () => {
    open()
    await wrapper.get('dialog').trigger('cancel')
    await wrapper.get('[aria-label="Close Profile"]').trigger('click')
    await wrapper.get('dialog').trigger('click')
    expect(wrapper.emitted('request-close')).toHaveLength(3)
    await wrapper.get('p').trigger('click')
    expect(wrapper.emitted('request-close')).toHaveLength(3)
  })

  it('lets a keyboard user scroll a body with no link or button in it', () => {
    open()
    const body = wrapper.get('[role="region"]')
    expect(body.attributes('tabindex')).toBe('0')
    expect(body.attributes('aria-label')).toBe('Profile')
  })

  it('shows the session notice unless the page inside has its own', async () => {
    open()
    const auth = useAuthStore()
    auth.status = 'unknown'
    auth.requestError = { message: 'The account service is busy.' }
    await nextTick()
    expect(wrapper.text()).toContain('The account service is busy.')
    wrapper.unmount()
    setActivePinia(createPinia())
    open({ sessionNotice: false })
    const second = useAuthStore()
    second.status = 'unknown'
    second.requestError = { message: 'The account service is busy.' }
    await nextTick()
    expect(wrapper.text()).not.toContain('The account service is busy.')
  })
})
