import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Hub3dWarning from '../Hub3dWarning.vue'

let opener
function open() {
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  return mount(Hub3dWarning, { attachTo: document.body })
}
afterEach(() => {
  opener?.remove()
  document.body.innerHTML = ''
})

describe('3D warning', () => {
  it('is a labelled native dialog, so it stacks over an open Settings dialog', async () => {
    const wrapper = open()
    await flushPromises()
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.element.tagName).toBe('DIALOG')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.attributes('aria-labelledby')).toBe('hub-3d-warning-title')
    wrapper.unmount()
  })

  it('starts on Cancel, the safe choice', async () => {
    const wrapper = open()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="hub-3d-cancel"]').element)
    wrapper.unmount()
  })

  it('cancels on Escape and hands focus back to the opener', async () => {
    const wrapper = open()
    await flushPromises()
    await wrapper.get('dialog').trigger('cancel')
    await flushPromises()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
  })

  it('reports the choice to try 3D', async () => {
    const wrapper = open()
    await flushPromises()
    await wrapper.get('[data-testid="hub-3d-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cancels on a backdrop click', async () => {
    const wrapper = open()
    await flushPromises()
    await wrapper.get('dialog').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
