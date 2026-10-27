import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '../../../features/auth/store.js'
import SqlInjectionArcade from '../SqlInjectionArcade.vue'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
  safeAttemptError: () => ({ message: 'error', status: 0 }),
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
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/sql-injection-arcade', component: SqlInjectionArcade },
    ],
  })
  await router.push('/games/sql-injection-arcade')
  await router.isReady()
  const wrapper = mount(SqlInjectionArcade, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('sql injection how to play guide', () => {
  it('opens on the first visit', async () => {
    const wrapper = await mountGame([])
    const dialog = wrapper.get('dialog.howto-dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.text()).toContain('How to play: SQL Injection Arcade')
  })

  it('stays closed when dismissed and reopens from the button', async () => {
    const wrapper = await mountGame(['sql-injection-arcade'])
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'How to play')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeDefined()
  })
})
