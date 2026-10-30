import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import SettingsOverlay from '../overlays/SettingsOverlay.vue'
import { provideTownControls } from '../townControls.js'

const controls = {
  townMode: { mode: ref('2d'), locked: ref(false), toggle() {} },
  sound: { current: ref(null) },
  graphics: ref('auto'),
  setGraphics() {},
}
const Host = defineComponent({
  setup() {
    provideTownControls(controls)
    return () => h(SettingsOverlay)
  },
})
let wrapper

beforeEach(() => localStorage.clear())
afterEach(() => wrapper?.unmount())

describe('SettingsOverlay interface size', () => {
  it('offers a labelled Small, Medium, Large group with Medium selected', () => {
    wrapper = mount(Host, { attachTo: document.body })
    const group = document.body.querySelector('fieldset')
    expect(group.querySelector('legend').textContent).toBe('Interface size')
    const radios = [...group.querySelectorAll('input[type="radio"]')]
    expect(radios.map((r) => r.value)).toEqual(['small', 'medium', 'large'])
    expect(radios.find((r) => r.checked).value).toBe('medium')
  })

  it('persists the choice and updates the scale property', async () => {
    wrapper = mount(Host, { attachTo: document.body })
    const small = document.body.querySelector('input[value="small"]')
    small.checked = true
    small.dispatchEvent(new Event('change', { bubbles: true }))
    expect(localStorage.getItem('sharlock.uiScale')).toBe('small')
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.75')
  })
})
