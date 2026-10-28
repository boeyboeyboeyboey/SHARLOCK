import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { MUSIC_MUTED_KEY, MUSIC_VOLUME, useLandingMusic } from '../useLandingMusic.js'

let api
const hold = ref(false)
const Host = defineComponent({
  setup() {
    const audio = ref(null)
    api = useLandingMusic(audio, () => hold.value)
    return () => h('audio', { ref: audio })
  },
})

beforeEach(() => {
  sessionStorage.clear()
  hold.value = false
})
afterEach(() => vi.restoreAllMocks())

const gesture = (type) => document.dispatchEvent(new Event(type, { bubbles: true }))

describe('useLandingMusic', () => {
  it('starts on mount when playback is allowed', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(api.isMuted.value).toBe(false)
    expect(wrapper.get('audio').element.muted).toBe(false)
    wrapper.unmount()
  })

  it('caps the music at half volume', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await flushPromises()
    expect(MUSIC_VOLUME).toBeLessThanOrEqual(0.5)
    expect(wrapper.get('audio').element.volume).toBe(MUSIC_VOLUME)
    wrapper.unmount()
  })

  it.each(['pointerdown', 'keydown', 'touchstart'])(
    'waits for %s when autoplay is rejected, then stops listening',
    async (type) => {
      const play = vi
        .spyOn(HTMLMediaElement.prototype, 'play')
        .mockRejectedValueOnce(new Error('blocked'))
        .mockResolvedValue()
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
      const remove = vi.spyOn(document, 'removeEventListener')
      const wrapper = mount(Host)
      await flushPromises()
      expect(api.isMuted.value).toBe(true)
      expect(api.errorMessage.value).toBe('')
      gesture(type)
      await flushPromises()
      expect(play).toHaveBeenCalledTimes(2)
      expect(api.isMuted.value).toBe(false)
      expect(remove.mock.calls.map((call) => call[0])).toEqual(
        expect.arrayContaining(['pointerdown', 'keydown', 'touchstart']),
      )
      gesture('pointerdown')
      expect(play).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    },
  )

  it('does not auto-start after a session mute and clears it on unmute', async () => {
    sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await flushPromises()
    gesture('pointerdown')
    expect(play).not.toHaveBeenCalled()
    await api.toggle()
    expect(play).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(MUSIC_MUTED_KEY)).toBeNull()
    await api.toggle()
    expect(sessionStorage.getItem(MUSIC_MUTED_KEY)).toBe('1')
    wrapper.unmount()
  })

  it('removes its gesture listeners and pauses on unmount', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('blocked'))
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await flushPromises()
    wrapper.unmount()
    expect(pause).toHaveBeenCalled()
    play.mockClear()
    gesture('keydown')
    expect(play).not.toHaveBeenCalled()
  })

  it('pauses while suspended and resumes afterwards unless muted', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await flushPromises()
    hold.value = true
    await nextTick()
    expect(wrapper.get('audio').element.muted).toBe(true)
    hold.value = false
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(api.isMuted.value).toBe(false)
    wrapper.unmount()
  })

  it('reports a rejected manual start', async () => {
    sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('blocked'))
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(Host)
    await api.toggle()
    expect(api.errorMessage.value).toContain('Tap to try again')
    wrapper.unmount()
  })
})
