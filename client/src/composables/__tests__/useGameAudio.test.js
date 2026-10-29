import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { MUSIC_MUTED_KEY } from '../useLandingMusic.js'
import { gameThemeUrl, useGameAudio } from '../useGameAudio.js'

let api
const room = ref('clearance-tower')
const Host = defineComponent({
  setup() {
    api = useGameAudio(() => room.value)
    return () => h('div')
  },
})

let play
const gesture = (type) => document.dispatchEvent(new Event(type, { bubbles: true }))

beforeEach(() => {
  sessionStorage.clear()
  room.value = 'clearance-tower'
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useGameAudio', () => {
  it('names the theme after the room', () => {
    expect(gameThemeUrl('clearance-tower')).toBe('/audio/games/clearance-tower-theme.mp3')
    expect(gameThemeUrl('')).toBe('')
  })

  it('starts the theme on mount', async () => {
    const wrapper = mount(Host)
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(api.isMuted.value).toBe(false)
    wrapper.unmount()
  })

  it('does not auto-start after a mute and shares the session key', async () => {
    sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    const wrapper = mount(Host)
    await flushPromises()
    expect(play).not.toHaveBeenCalled()
    await api.toggle()
    expect(sessionStorage.getItem(MUSIC_MUTED_KEY)).toBeNull()
    expect(play).toHaveBeenCalledTimes(1)
    await api.toggle()
    expect(sessionStorage.getItem(MUSIC_MUTED_KEY)).toBe('1')
    wrapper.unmount()
  })

  it.each(['pointerdown', 'keydown', 'touchstart'])(
    'waits for %s when autoplay is rejected, then stops listening',
    async (type) => {
      play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
      const wrapper = mount(Host)
      await flushPromises()
      expect(api.isMuted.value).toBe(true)
      gesture(type)
      await flushPromises()
      expect(play).toHaveBeenCalledTimes(2)
      gesture(type)
      await flushPromises()
      expect(play).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    },
  )

  it('removes the gesture listeners on unmount', async () => {
    play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    const wrapper = mount(Host)
    await flushPromises()
    wrapper.unmount()
    gesture('pointerdown')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('goes quiet and stops retrying when the file is missing', async () => {
    const consoleError = vi.spyOn(console, 'error')
    const Real = window.Audio
    const made = []
    vi.stubGlobal('Audio', function () {
      const element = new Real()
      made.push(element)
      return element
    })
    play.mockRejectedValueOnce(new DOMException('no source', 'NotSupportedError'))
    const wrapper = mount(Host)
    await flushPromises()
    expect(api.isMuted.value).toBe(true)
    // the element reports the failed load
    made[0].dispatchEvent(new Event('error'))
    await flushPromises()
    expect(api.missing.value).toBe(true)
    gesture('pointerdown')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    vi.unstubAllGlobals()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('treats a room without an id as missing', async () => {
    room.value = ''
    const wrapper = mount(Host)
    await nextTick()
    expect(api.missing.value).toBe(true)
    expect(play).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
