import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../features/auth/store.js'
import CliDefenderGame from '../CliDefenderGame.vue'

vi.mock('../../../features/attempts/api.js', () => ({
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
  safeAttemptError: () => ({ message: 'error' }),
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
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { howToPlayDismissed: dismissed }
  auth.status = 'authenticated'
  const wrapper = mount(CliDefenderGame, {
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cli cyber defender how to play guide', () => {
  it('opens on the first visit', async () => {
    stubDialog()
    const wrapper = await mountGame([])
    const dialog = wrapper.get('dialog.howto-dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.text()).toContain('How to play: CLI Cyber Defender')
  })

  it('stays closed when dismissed and reopens from the button', async () => {
    stubDialog()
    const wrapper = await mountGame(['cli-cyber-defender'])
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'How to play')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeDefined()
  })
})
