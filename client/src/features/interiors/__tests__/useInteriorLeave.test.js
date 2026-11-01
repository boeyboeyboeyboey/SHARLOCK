import { describe, expect, it, vi } from 'vitest'
import { h, provide } from 'vue'
import { mount } from '@vue/test-utils'
import { INTERIOR_LEAVE, useInteriorLeave } from '../useInteriorLeave.js'

describe('useInteriorLeave', () => {
  it('registers with the layout and lets go on unmount', () => {
    const unregister = vi.fn()
    const register = vi.fn(() => unregister)
    const hooks = { onOpen() {}, onClose() {} }
    const Game = {
      setup() {
        useInteriorLeave(hooks)
        return () => h('p')
      },
    }
    const wrapper = mount({
      setup() {
        provide(INTERIOR_LEAVE, register)
        return () => h(Game)
      },
    })
    expect(register).toHaveBeenCalledWith(hooks)
    wrapper.unmount()
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('does nothing outside the layout', () => {
    const wrapper = mount({
      setup() {
        useInteriorLeave({})
        return () => h('p')
      },
    })
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
