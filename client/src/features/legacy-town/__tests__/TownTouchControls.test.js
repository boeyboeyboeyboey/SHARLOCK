import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TownTouchControls from '../TownTouchControls.vue'

const rect = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }

function mountControls(props = {}) {
  const wrapper = mount(TownTouchControls, { props, attachTo: document.body })
  wrapper.get('[data-testid="town-joystick"]').element.getBoundingClientRect = () => rect
  return wrapper
}
const pointer = (type, init) => new PointerEvent(type, { bubbles: true, pointerId: 1, ...init })

describe('town touch controls', () => {
  it('emits the stick vector while dragging, clamps it, and zeroes on release', async () => {
    const wrapper = mountControls()
    const pad = wrapper.get('[data-testid="town-joystick"]')
    pad.element.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 50 }))
    expect(wrapper.emitted('move').at(-1)).toEqual([1, 0])
    pad.element.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 50 }))
    expect(wrapper.emitted('move').at(-1)).toEqual([1, 0])
    pad.element.dispatchEvent(pointer('pointermove', { clientX: 50, clientY: 100 }))
    expect(wrapper.emitted('move').at(-1)).toEqual([0, 1])
    pad.element.dispatchEvent(pointer('pointerup', {}))
    expect(wrapper.emitted('move').at(-1)).toEqual([0, 0])
    wrapper.unmount()
  })

  it('treats a touch near the centre as no movement', () => {
    const wrapper = mountControls()
    wrapper
      .get('[data-testid="town-joystick"]')
      .element.dispatchEvent(pointer('pointerdown', { clientX: 55, clientY: 50 }))
    expect(wrapper.emitted('move').at(-1)).toEqual([0, 0])
    wrapper.unmount()
  })

  it('stops the walker when unmounted mid-drag', () => {
    const calls = []
    const wrapper = mountControls({ onMove: (x, y) => calls.push([x, y]) })
    wrapper
      .get('[data-testid="town-joystick"]')
      .element.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 50 }))
    expect(calls.at(-1)).toEqual([1, 0])
    wrapper.unmount()
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('emits sprint from the button and shows its state', async () => {
    const wrapper = mountControls({ sprintState: 'cooldown' })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Recharging')
    await button.trigger('click')
    expect(wrapper.emitted('sprint')).toHaveLength(1)
    wrapper.unmount()
  })
})
