import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import DemoTerminal from '../components/DemoTerminal.vue'
import { DEMO_SCENES } from '../cliDefender.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  delete globalThis.matchMedia
})

describe('briefing demo terminal', () => {
  it('looks something up, then types the command and moves to the next alert', async () => {
    const wrapper = mount(DemoTerminal, { props: { typeMs: 10 } })
    const [first, second] = DEMO_SCENES
    expect(wrapper.text()).toContain(first.alert)
    expect(wrapper.find('.cli-demo-ok').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(900 + first.lookup.length * 10 + 300)
    expect(wrapper.get('.cli-demo-lookup').text()).toBe(first.lookup)
    expect(wrapper.get('.cli-demo-found').text()).toContain(first.found)
    expect(wrapper.get('.cli-demo-typed').text()).toBe('')
    await vi.advanceTimersByTimeAsync(1000 + first.command.length * 10 + 300)
    expect(wrapper.get('.cli-demo-typed').text()).toBe(first.command)
    expect(wrapper.get('.cli-demo-ok').text()).toContain(first.result)
    await vi.advanceTimersByTimeAsync(1700)
    expect(wrapper.text()).toContain(second.alert)
    expect(wrapper.get('.cli-demo-typed').text()).toBe('')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows a still, finished frame for reduced motion', async () => {
    globalThis.matchMedia = vi.fn(() => ({ matches: true }))
    const wrapper = mount(DemoTerminal)
    await nextTick()
    expect(wrapper.get('.cli-demo-lookup').text()).toBe(DEMO_SCENES[0].lookup)
    expect(wrapper.get('.cli-demo-typed').text()).toBe(DEMO_SCENES[0].command)
    expect(wrapper.find('.cli-demo-ok').exists()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('hides the animation from assistive technology but keeps a caption', () => {
    const wrapper = mount(DemoTerminal)
    expect(wrapper.get('.cli-demo-window').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('figcaption').text()).toContain('incident is resolved')
    wrapper.unmount()
  })
})
