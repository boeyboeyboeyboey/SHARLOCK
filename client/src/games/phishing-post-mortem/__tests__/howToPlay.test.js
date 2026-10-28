import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '../../../features/auth/store.js'
import PhishingPostMortem from '../PhishingPostMortem.vue'
import { HOW_TO_PLAY } from '../howToPlay.js'
import HowToPlayScene from '../components/HowToPlayScene.vue'
import { listAttemptContexts } from '../../../features/attempts/api.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
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
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { howToPlayDismissed: dismissed }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/phishing-post-mortem', component: PhishingPostMortem },
    ],
  })
  await router.push('/games/phishing-post-mortem')
  await router.isReady()
  const wrapper = mount(PhishingPostMortem, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.resetAllMocks()
  document.body.innerHTML = ''
})

describe('phishing how to play guide', () => {
  it('renders a decorative scene with both buttons', () => {
    const wrapper = mount(HowToPlayScene, { props: { reducedMotion: true } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.text()).toContain('Trust')
    expect(wrapper.text()).toContain('Report')
    expect(wrapper.text()).toContain('Reported')
    expect(wrapper.findAll('button, a, input')).toHaveLength(0)
  })

  it('opens on the first visit', async () => {
    stubDialog()
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const wrapper = await mountGame([])
    const dialog = wrapper.get('dialog.howto-dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.text()).toContain('How to play: The Phishing Post-Mortem')
    expect(dialog.text()).toContain('Read the email, then Trust it or Report it')
    expect(dialog.text()).not.toContain('Streaks multiply')
  })

  it('keeps the guide to two short steps', () => {
    expect(HOW_TO_PLAY.steps.map((step) => step.text)).toEqual([
      'Read the email, then Trust it or Report it and tap what gave it away.',
      'Class: 3 minutes, 3 mistakes. Personal: 12 emails, no timer.',
    ])
    expect(HOW_TO_PLAY.rules).toBeUndefined()
    expect(HOW_TO_PLAY.controls).toBeUndefined()
  })

  it('stays closed when dismissed and reopens from the button', async () => {
    stubDialog()
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const wrapper = await mountGame(['phishing-post-mortem'])
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'How to play')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog.howto-dialog').attributes('open')).toBeDefined()
  })
})
