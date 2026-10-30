import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../features/auth/store.js'
import SocialEngineeringSimulator from '../SocialEngineeringSimulator.vue'

vi.mock('../../../features/attempts/api.js', async (original) => ({
  ...(await original()),
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
}))

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

async function mountGame(dismissed) {
  stubDialog()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { howToPlayDismissed: dismissed }
  const wrapper = mount(SocialEngineeringSimulator, {
    global: { plugins: [pinia], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('social engineering how to play guide', () => {
  it('opens on the first visit', async () => {
    const wrapper = await mountGame([])
    const dialog = wrapper.get('dialog.howto-dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.text()).toContain('How to play: Help Desk Shift')
  })

  it('stays closed when dismissed and reopens from the button', async () => {
    const wrapper = await mountGame(['social-engineering-simulator'])
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'How to play')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeDefined()
  })
})
