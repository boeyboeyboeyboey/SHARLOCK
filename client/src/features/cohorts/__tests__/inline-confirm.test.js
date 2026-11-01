import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import InlineConfirm from '../components/InlineConfirm.vue'

describe('InlineConfirm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const props = { message: 'Remove Casey?', confirmLabel: 'Yes, remove' }

  it('takes focus on the safe choice and reports each choice', async () => {
    const wrapper = mount(InlineConfirm, { props, attachTo: document.body })
    expect(document.activeElement?.textContent.trim()).toBe('Cancel')
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Remove Casey?')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Yes, remove')
      .trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('backs out on escape and hands focus back to its opener', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mount(InlineConfirm, { props, attachTo: document.body })
    await wrapper.get('[role="group"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
  })
})
