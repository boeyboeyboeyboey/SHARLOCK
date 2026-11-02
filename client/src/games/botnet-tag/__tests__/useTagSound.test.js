import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useTagSound } from '../audio/useTagSound.js'

function fakeContext() {
  const context = {
    currentTime: 0,
    destination: {},
    started: 0,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (node) => node,
    }),
    createOscillator: () => ({
      frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect: (node) => node,
      start: () => context.started++,
      stop() {},
    }),
  }
  return context
}

// one shared harness component keeps the single-component-per-file rule satisfied
const Harness = defineComponent({
  props: {
    createContext: { type: Function, required: true },
    onApi: { type: Function, required: true },
  },
  setup(props) {
    props.onApi(useTagSound({ createContext: props.createContext }))
    return () => h('div')
  },
})

function mountSound(context) {
  return mountWith(() => context)
}

function mountWith(createContext) {
  let api
  const wrapper = mount(Harness, { props: { createContext, onApi: (value) => (api = value) } })
  return { api, wrapper }
}

afterEach(() => sessionStorage.clear())

describe('useTagSound', () => {
  it('stays silent until a user gesture creates the context', () => {
    const context = fakeContext()
    const { api, wrapper } = mountSound(context)
    api.play('horn')
    expect(context.started).toBe(0)
    document.dispatchEvent(new Event('pointerdown'))
    api.play('horn')
    expect(context.started).toBe(2)
    wrapper.unmount()
  })

  it('makes no sound while the shared mute is on', () => {
    const context = fakeContext()
    const { api, wrapper } = mountSound(context)
    api.unlock()
    sessionStorage.setItem('sharlock.musicMuted', '1')
    api.play('win')
    expect(context.started).toBe(0)
    sessionStorage.removeItem('sharlock.musicMuted')
    api.play('win')
    expect(context.started).toBe(4)
    wrapper.unmount()
  })

  it('ignores unknown cues and a missing audio api', () => {
    const { api, wrapper } = mountSound(null)
    expect(() => {
      api.unlock()
      api.play('horn')
      api.play('nope')
    }).not.toThrow()
    wrapper.unmount()
  })

  it('closes the context and removes the gesture listeners on unmount', () => {
    const context = fakeContext()
    const create = vi.fn(() => context)
    const { wrapper } = mountWith(create)
    document.dispatchEvent(new Event('keydown'))
    expect(create).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(context.close).toHaveBeenCalled()
    document.dispatchEvent(new Event('keydown'))
    expect(create).toHaveBeenCalledTimes(1)
  })
})
