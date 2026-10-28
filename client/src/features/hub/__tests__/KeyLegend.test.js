import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeyLegend from '../KeyLegend.vue'

describe('key legend', () => {
  it('is closed by default and reports its state on the button', () => {
    const wrapper = mount(KeyLegend)
    const button = wrapper.get('button')
    expect(button.text()).toBe('Keys')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('ul').isVisible()).toBe(false)
  })

  it('asks its parent to toggle and lists every key when open', async () => {
    const wrapper = mount(KeyLegend)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')[0]).toEqual([true])
    await wrapper.setProps({ open: true })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    const text = wrapper.get('ul').text()
    for (const part of ['WASD / arrows', 'Space', 'Q / E', 'reset camera', 'Enter', 'Esc']) {
      expect(text).toContain(part)
    }
  })
})
