import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NewsAudio from '../components/NewsAudio.vue'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})
function render(play = vi.fn().mockResolvedValue()) {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  wrapper = mount(NewsAudio)
  return wrapper.get('audio').element
}
describe('newspaper sound lifecycle', () => {
  it('starts a quiet loop on opening, allows mute/retry and stops on departure', async () => {
    const play = vi.fn().mockResolvedValue()
    const audio = render(play)
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    const source = new URL(audio.src)
    expect(decodeURIComponent(source.pathname)).toBe(
      '/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3',
    )
    expect(source.hash).toBe('')
    expect(audio.loop).toBe(true)
    expect(audio.volume).toBe(0.2)
    expect(audio.muted).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(audio.muted).toBe(true)
    expect(wrapper.get('button').attributes('aria-label')).toBe('Play newspaper sound')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(audio.muted).toBe(false)
    wrapper.unmount()
    wrapper = undefined
    expect(audio.muted).toBe(true)
  })
  it('retries through the sound button after autoplay rejection', async () => {
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
      .mockResolvedValue()
    const audio = render(play)
    await flushPromises()
    expect(audio.muted).toBe(true)
    expect(wrapper.emitted('status')?.at(-1)?.[0] ?? '').toBe('')
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('status')?.at(-1)?.[0] ?? '').toBe('')
    expect(audio.muted).toBe(false)
  })
  it('reports unavailable media and keeps the retry control usable', async () => {
    const audio = render()
    await flushPromises()
    await wrapper.get('audio').trigger('error')
    expect(audio.muted).toBe(true)
    expect(wrapper.emitted('status').at(-1)[0]).toContain('try again')
    expect(wrapper.get('button').element.disabled).toBe(false)
  })
  it.each(['mute', 'departure'])('silences a pending play promise after %s', async (action) => {
    let resolvePlay
    const audio = render(
      () =>
        new Promise((resolve) => {
          resolvePlay = resolve
        }),
    )
    expect(wrapper.get('button').element.disabled).toBe(false)
    if (action === 'mute') await wrapper.get('button').trigger('click')
    else {
      wrapper.unmount()
      wrapper = undefined
    }
    resolvePlay()
    await flushPromises()
    expect(audio.muted).toBe(true)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    if (wrapper) expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
  })
})
