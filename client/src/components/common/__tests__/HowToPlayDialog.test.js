import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HowToPlayDialog from '../HowToPlayDialog.vue'
import { useAuthStore } from '../../../features/auth/store.js'

const steps = [
  { title: 'Look', text: 'Look at the board.' },
  { title: 'Act', text: 'Make your move.' },
  { title: 'Score', text: 'See the score.' },
]
const props = {
  gameId: 'demo-game',
  title: 'Demo',
  steps,
  learn: 'Access control (CS440 07).',
  rules: ['Up to 100 points'],
  controls: [{ keys: 'Tab', action: 'move on' }],
  open: false,
}

function stubMatchMedia(reduced) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced })
}

function mountDialog(extra = {}, user = { howToPlayDismissed: [] }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = user
  auth.status = 'authenticated'
  auth.setHowToPlayDismissed = vi.fn().mockResolvedValue()
  const wrapper = mount(HowToPlayDialog, {
    props: { ...props, ...extra },
    global: { plugins: [pinia] },
    slots: {
      scene: '<template #scene="{ step }"><i data-testid="scene">{{ step }}</i></template>',
    },
    attachTo: document.body,
  })
  return { wrapper, auth }
}

beforeEach(() => {
  vi.useFakeTimers()
  stubMatchMedia(false)
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('how to play dialog', () => {
  it('renders the steps, learn line, rules and controls', () => {
    const { wrapper } = mountDialog({ open: true })
    expect(wrapper.get('dialog').attributes('aria-labelledby')).toBeTruthy()
    expect(wrapper.text()).toContain('How to play: Demo')
    expect(wrapper.text()).toContain('Look at the board.')
    expect(wrapper.text()).toContain('Access control (CS440 07).')
    expect(wrapper.text()).toContain('Up to 100 points')
    expect(wrapper.text()).toContain('Tab')
    expect(wrapper.findAll('.howto-dot')).toHaveLength(3)
    expect(wrapper.get('[data-testid="scene"]').text()).toBe('0')
  })

  it('moves with Previous, Next and the step dots', async () => {
    const { wrapper } = mountDialog({ open: true })
    const button = (name) => wrapper.findAll('button').find((item) => item.text() === name)
    await button('Next').trigger('click')
    expect(wrapper.text()).toContain('Make your move.')
    await button('Previous').trigger('click')
    await button('Previous').trigger('click')
    expect(wrapper.text()).toContain('See the score.')
    await wrapper.get('[aria-label="Step 2: Act"]').trigger('click')
    expect(wrapper.get('[aria-current="step"]').attributes('aria-label')).toBe('Step 2: Act')
  })

  it('auto-advances and stops when paused', async () => {
    const { wrapper } = mountDialog({ open: true })
    const pause = wrapper.get('[aria-pressed]')
    expect(pause.attributes('aria-pressed')).toBe('false')
    vi.advanceTimersByTime(4000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Make your move.')
    await pause.trigger('click')
    expect(pause.attributes('aria-pressed')).toBe('true')
    vi.advanceTimersByTime(9000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Make your move.')
  })

  it('starts paused without auto-advance under reduced motion', async () => {
    stubMatchMedia(true)
    const { wrapper } = mountDialog({ open: true })
    expect(wrapper.get('[aria-pressed]').attributes('aria-pressed')).toBe('true')
    vi.advanceTimersByTime(9000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Look at the board.')
  })

  it('saves the dismissal checkbox through the store', async () => {
    const { wrapper, auth } = mountDialog({ open: true })
    const box = wrapper.get('input[type="checkbox"]')
    expect(box.element.checked).toBe(false)
    await box.setValue(true)
    expect(auth.setHowToPlayDismissed).toHaveBeenCalledWith('demo-game', true)
  })

  it('reflects a dismissed user and shows an alert when saving fails', async () => {
    const { wrapper, auth } = mountDialog({ open: true }, { howToPlayDismissed: ['demo-game'] })
    const box = wrapper.get('input[type="checkbox"]')
    expect(box.element.checked).toBe(true)
    auth.setHowToPlayDismissed.mockRejectedValue(new Error('offline'))
    await box.setValue(false)
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    expect(box.element.checked).toBe(true)
  })

  it('emits update:open false from Start playing, the close button and the native close', async () => {
    const { wrapper } = mountDialog({ open: true })
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'Start playing')
      .trigger('click')
    expect(wrapper.emitted('update:open')[0]).toEqual([false])
    await wrapper.get('[aria-label="Close how to play"]').trigger('click')
    expect(wrapper.emitted('update:open').length).toBeGreaterThan(0)
  })

  it('closes the native dialog when open turns false', async () => {
    const { wrapper } = mountDialog({ open: true })
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    await wrapper.setProps({ open: false })
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
  })
})
