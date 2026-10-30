import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmDialog from '../ConfirmDialog.vue'

const props = {
  open: false,
  title: 'Leave the game?',
  message: "An unfinished round won't be saved.",
  confirmLabel: 'Leave game',
  cancelLabel: 'Keep playing',
}
const wrappers = []

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function mountDialog(extra = {}) {
  const wrapper = mount(ConfirmDialog, { props: { ...props, ...extra }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}

describe('ConfirmDialog', () => {
  it('opens as a labelled modal with the given copy', async () => {
    const wrapper = mountDialog()
    const dialog = wrapper.get('dialog')
    expect(dialog.attributes('open')).toBeUndefined()
    await wrapper.setProps({ open: true })
    expect(dialog.attributes('open')).toBeDefined()
    const labelId = dialog.attributes('aria-labelledby')
    expect(wrapper.get(`#${labelId}`).text()).toBe('Leave the game?')
    expect(wrapper.text()).toContain("An unfinished round won't be saved.")
    expect(wrapper.get('[data-testid="confirm-accept"]').text()).toBe('Leave game')
    expect(wrapper.get('[data-testid="confirm-cancel"]').text()).toBe('Keep playing')
  })

  it('emits confirm and cancel from the two buttons', async () => {
    const wrapper = mountDialog({ open: true })
    await wrapper.get('[data-testid="confirm-accept"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.get('[data-testid="confirm-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('treats Escape as cancel and keeps the dialog for the parent to close', async () => {
    const wrapper = mountDialog({ open: true })
    const event = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('returns focus to the opener when it closes', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await nextTick()
    wrapper.get('[data-testid="confirm-cancel"]').element.focus()
    expect(document.activeElement).not.toBe(opener)
    await wrapper.setProps({ open: false })
    expect(document.activeElement).toBe(opener)
  })
})
