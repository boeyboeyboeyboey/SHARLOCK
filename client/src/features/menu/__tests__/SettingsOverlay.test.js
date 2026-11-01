import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})
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
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.85')
  })
})

describe('SettingsOverlay rows', () => {
  it('switches the view through the town controls', () => {
    const toggle = vi.spyOn(controls.townMode, 'toggle')
    wrapper = mount(Host, { attachTo: document.body })
    const view = document.querySelector('[data-testid="settings-view"]')
    expect(view.textContent).toContain('2D (switch to 3D)')
    view.click()
    expect(toggle).toHaveBeenCalledTimes(1)
    toggle.mockRestore()
  })

  it('offers no sound toggle until a sound source has registered', () => {
    wrapper = mount(Host, { attachTo: document.body })
    const sound = document.querySelector('[data-testid="settings-sound"]')
    expect(sound.disabled).toBe(true)
    expect(sound.textContent).toContain('Off')
  })

  it('shows the Graphics row only in 3D', async () => {
    wrapper = mount(Host, { attachTo: document.body })
    expect(document.querySelector('[data-testid="hub-graphics"]')).toBeNull()
    controls.townMode.mode.value = '3d'
    await nextTick()
    expect(document.querySelector('[data-testid="hub-graphics"]')).not.toBeNull()
    controls.townMode.mode.value = '2d'
  })
})
