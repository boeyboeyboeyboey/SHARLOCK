import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HubAmbience from '../HubAmbience.vue'
import { MUSIC_MUTED_KEY } from '../../../composables/useLandingMusic.js'

afterEach(() => vi.restoreAllMocks())

describe('hub ambience', () => {
  beforeEach(() => sessionStorage.clear())

  it('loops the hub ambience file and starts it on mount', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(HubAmbience)
    const audio = wrapper.get('audio').element
    expect(audio.getAttribute('src')).toBe('/audio/hub-ambience.mp3')
    expect(audio.loop).toBe(true)
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Mute hub sound')
    expect(wrapper.get('button').text()).toBe('Sound on')
    wrapper.unmount()
  })

  it('mutes on request, remembers the mute for the session, and pauses on unmount', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(HubAmbience)
    const audio = wrapper.get('audio').element
    await flushPromises()
    await wrapper.get('button').trigger('click')
    expect(audio.muted).toBe(true)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Turn on hub sound')
    expect(wrapper.get('button').text()).toBe('Sound off')
    expect(sessionStorage.getItem(MUSIC_MUTED_KEY)).toBe('1')
    wrapper.unmount()
    expect(pause).toHaveBeenCalledTimes(2)
  })

  it('does not autoplay when the session is already muted', async () => {
    sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(HubAmbience)
    await flushPromises()
    expect(play).not.toHaveBeenCalled()
    expect(wrapper.get('button').text()).toBe('Sound off')
    wrapper.unmount()
  })

  it('pauses and disables the control while suspended, then resumes', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const wrapper = mount(HubAmbience)
    const audio = wrapper.get('audio').element
    await flushPromises()
    await wrapper.setProps({ suspended: true })
    expect(audio.muted).toBe(true)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').element.disabled).toBe(true)
    await wrapper.setProps({ suspended: false })
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(audio.muted).toBe(false)
    expect(wrapper.get('button').element.disabled).toBe(false)
    wrapper.unmount()
  })
})
