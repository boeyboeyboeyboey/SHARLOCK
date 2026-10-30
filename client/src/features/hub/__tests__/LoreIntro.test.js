import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LoreIntro from '../intro/LoreIntro.vue'
import { FADE_MS, LORE_CARDS, holdFor } from '../intro/loreCards.js'

const EXIT_MS = 800
const SKIP_MS = 300
const card = (wrapper) => wrapper.get('[aria-live="polite"]').text()
const cardGap = (index) => FADE_MS + holdFor(LORE_CARDS[index].text) + FADE_MS

// teleport is stubbed so the overlay renders inside the wrapper
function mountIntro(props = {}) {
  return mount(LoreIntro, {
    props: { ready: true, ...props },
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  })
}

let play
let pause
beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  sessionStorage.clear()
  document.body.innerHTML = ''
})

describe('lore intro', () => {
  it('shows the first card in the live region', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    expect(card(wrapper)).toBe(LORE_CARDS[0].text)
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Introduction')
    wrapper.unmount()
  })

  it('moves to the next card after the fade and hold time', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(cardGap(0) - 1)
    expect(card(wrapper)).toBe(LORE_CARDS[0].text)
    await vi.advanceTimersByTimeAsync(1)
    expect(card(wrapper)).toBe(LORE_CARDS[1].text)
    wrapper.unmount()
  })

  it('advances one card on Enter', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Enter' })
    await vi.advanceTimersByTimeAsync(FADE_MS)
    expect(card(wrapper)).toBe(LORE_CARDS[1].text)
    wrapper.unmount()
  })

  it('renders the detective name as a gold span on card 4 only', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('.lore-name').exists()).toBe(false)
    for (let i = 0; i < 3; i += 1) await vi.advanceTimersByTimeAsync(cardGap(i))
    expect(card(wrapper)).toBe(LORE_CARDS[3].text)
    expect(wrapper.get('.lore-name').text()).toBe('Sharlock Holmes')
    wrapper.unmount()
  })

  it('skips the whole intro on Space and Escape', async () => {
    for (const key of [' ', 'Escape']) {
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      await wrapper.get('[role="dialog"]').trigger('keydown', { key })
      await vi.advanceTimersByTimeAsync(SKIP_MS)
      expect(wrapper.emitted('done')).toHaveLength(1)
      wrapper.unmount()
    }
  })

  it('labels the skip button for the pointer type and skips on click', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    const skip = wrapper.get('[data-testid="lore-intro-skip"]')
    expect(skip.text()).toBe('Press Space to skip')
    expect(skip.attributes('aria-label')).toBe('Skip intro')
    await skip.trigger('click')
    await vi.advanceTimersByTimeAsync(SKIP_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the touch label on coarse pointers', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.get('[data-testid="lore-intro-skip"]').text()).toBe('Tap to skip')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('fades the sound before done when skipped while playing', async () => {
    const wrapper = mountIntro()
    await vi.advanceTimersByTimeAsync(0)
    expect(play).toHaveBeenCalledTimes(1)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('done')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(SKIP_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(pause).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('finishes after the last card once the scene is ready', async () => {
    const wrapper = mountIntro()
    for (let i = 0; i < LORE_CARDS.length; i += 1) await vi.advanceTimersByTimeAsync(cardGap(i))
    expect(wrapper.emitted('done')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(EXIT_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(pause).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('waits on a loading message until the scene is ready', async () => {
    const wrapper = mountIntro({ ready: false })
    for (let i = 0; i < LORE_CARDS.length; i += 1) await vi.advanceTimersByTimeAsync(cardGap(i))
    expect(card(wrapper)).toBe('Loading the town…')
    await vi.advanceTimersByTimeAsync(10000)
    expect(wrapper.emitted('done')).toBeUndefined()
    await wrapper.setProps({ ready: true })
    await vi.advanceTimersByTimeAsync(EXIT_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
    wrapper.unmount()
  })

  describe('sound', () => {
    it('does not play when muted for the session', async () => {
      sessionStorage.setItem('sharlock.musicMuted', '1')
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      expect(play).not.toHaveBeenCalled()
      expect(card(wrapper)).toBe(LORE_CARDS[0].text)
      const toggle = wrapper.get('[data-testid="lore-intro-sound"]')
      expect(toggle.attributes('aria-pressed')).toBe('true')
      expect(toggle.attributes('aria-label')).toBe('Turn on intro sound')
      wrapper.unmount()
    })

    it('stores a mute but never an unmuted choice', async () => {
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      const toggle = wrapper.get('[data-testid="lore-intro-sound"]')
      expect(toggle.attributes('aria-label')).toBe('Mute intro sound')
      await toggle.trigger('click')
      expect(sessionStorage.getItem('sharlock.musicMuted')).toBe('1')
      await toggle.trigger('click')
      expect(sessionStorage.getItem('sharlock.musicMuted')).toBeNull()
      wrapper.unmount()
    })

    it('shows a gate when autoplay is blocked and starts on Enter', async () => {
      play.mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      expect(card(wrapper)).toBe('Click or press Enter to begin')
      await vi.advanceTimersByTimeAsync(60000)
      expect(card(wrapper)).toBe('Click or press Enter to begin')
      await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Enter' })
      expect(play).toHaveBeenCalledTimes(2)
      expect(card(wrapper)).toBe(LORE_CARDS[0].text)
      wrapper.unmount()
    })

    it('starts on click from the gate and still skips on Space', async () => {
      play.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      await wrapper.get('[role="dialog"]').trigger('click')
      expect(card(wrapper)).toBe(LORE_CARDS[0].text)
      wrapper.unmount()
      const second = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      await second.get('[role="dialog"]').trigger('keydown', { key: ' ' })
      expect(second.emitted('done')).toHaveLength(1)
      second.unmount()
    })

    it('continues silently when the file fails to play', async () => {
      play.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NotSupportedError' }))
      const wrapper = mountIntro()
      await vi.advanceTimersByTimeAsync(0)
      expect(card(wrapper)).toBe(LORE_CARDS[0].text)
      wrapper.unmount()
    })
  })

  describe('with reduced motion', () => {
    it('does not advance on its own and moves on with Continue', async () => {
      const wrapper = mountIntro({ reducedMotion: true })
      await vi.advanceTimersByTimeAsync(60000)
      expect(card(wrapper)).toBe(LORE_CARDS[0].text)
      await wrapper.get('[data-testid="lore-intro-continue"]').trigger('click')
      expect(card(wrapper)).toBe(LORE_CARDS[1].text)
      wrapper.unmount()
    })

    it('finishes straight after the last Continue when ready', async () => {
      const wrapper = mountIntro({ reducedMotion: true })
      await vi.advanceTimersByTimeAsync(0)
      for (let i = 0; i < LORE_CARDS.length; i += 1)
        await wrapper.get('[data-testid="lore-intro-continue"]').trigger('click')
      expect(wrapper.emitted('done')).toHaveLength(1)
      wrapper.unmount()
    })
  })
})
