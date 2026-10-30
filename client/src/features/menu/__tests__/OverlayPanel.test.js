import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OverlayPanel from '../OverlayPanel.vue'

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
})
