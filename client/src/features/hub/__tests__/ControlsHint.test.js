import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ControlsHint from '../ControlsHint.vue'
import {
  HINT_SEEN_KEY,
  HUB_KEYS,
  isEnterKey,
  isInteractKey,
  isSprintKey,
  keyboardHint,
} from '../controls.js'

function stubMedia({ reduce = false, coarse = false } = {}) {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: query.includes('reduce') ? reduce : query.includes('coarse') ? coarse : false,
    addEventListener() {},
    removeEventListener() {},
  }))
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  stubMedia()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ControlsHint', () => {
  it('shows the keys on a visit and counts it', async () => {
    const wrapper = mount(ControlsHint)
    await nextTick()
    expect(wrapper.get('[data-testid="controls-hint"]').text()).toBe(keyboardHint())
    expect(wrapper.text()).toContain('Z/C rotate')
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBe('1')
    wrapper.unmount()
  })

  it('shows the touch text on a coarse pointer', async () => {
    stubMedia({ coarse: true })
    const wrapper = mount(ControlsHint)
    await nextTick()
    expect(wrapper.text()).toContain('Drag to move')
    wrapper.unmount()
  })

  it('fades out after about six seconds', async () => {
    const wrapper = mount(ControlsHint)
    await nextTick()
    vi.advanceTimersByTime(5900)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(true)
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides on any key or click', async () => {
    const wrapper = mount(ControlsHint)
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(false)
    wrapper.unmount()
    const again = mount(ControlsHint)
    await nextTick()
    window.dispatchEvent(new Event('pointerdown'))
    await again.vm.$nextTick()
    expect(again.find('[data-testid="controls-hint"]').exists()).toBe(false)
    again.unmount()
  })

  it('stops after three visits but still reopens on request', async () => {
    localStorage.setItem(HINT_SEEN_KEY, '3')
    const wrapper = mount(ControlsHint)
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(false)
    wrapper.vm.show()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(true)
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBe('3')
    wrapper.unmount()
  })

  it('waits for the lore intro to finish', async () => {
    const wrapper = mount(ControlsHint, { props: { held: true } })
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(false)
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBeNull()
    await wrapper.setProps({ held: false })
    await nextTick()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('appears instantly under reduced motion', async () => {
    stubMedia({ reduce: true })
    const wrapper = mount(ControlsHint)
    await nextTick()
    expect(wrapper.get('[data-testid="controls-hint"]').attributes('data-motion')).toBe('reduced')
    wrapper.unmount()
  })
})

describe('hub keys', () => {
  it('lists the new rotate and talk keys once', () => {
    const keys = HUB_KEYS.map(([key]) => key)
    expect(keys).toContain('Z / C')
    expect(keys).toContain('E')
    expect(keys).not.toContain('Q / E')
  })

  it('treats a plain E press as interact and ignores repeats, modifiers and text fields', () => {
    expect(isInteractKey(new KeyboardEvent('keydown', { code: 'KeyE' }))).toBe(true)
    expect(isInteractKey(new KeyboardEvent('keydown', { code: 'KeyQ' }))).toBe(false)
    expect(isInteractKey(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }))).toBe(false)
    expect(isInteractKey(new KeyboardEvent('keydown', { code: 'KeyE', ctrlKey: true }))).toBe(false)
    const input = document.createElement('input')
    document.body.append(input)
    let seen = null
    input.addEventListener('keydown', (event) => (seen = isInteractKey(event)))
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    expect(seen).toBe(false)
    input.remove()
  })
})

describe('isSprintKey', () => {
  const press = (init = {}, target = document.body) => {
    let result
    target.addEventListener('keydown', (e) => (result = isSprintKey(e)), { once: true })
    target.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true, ...init }),
    )
    return result
  }

  it('lists Shift in the key legend and hint', () => {
    expect(HUB_KEYS).toContainEqual(['Shift', 'sprint'])
    expect(keyboardHint()).toContain('Shift sprint')
  })
  it('accepts a first Shift press only', () => {
    expect(press()).toBe(true)
    expect(press({ code: 'ShiftRight' })).toBe(true)
    expect(press({ repeat: true })).toBe(false)
    expect(press({ code: 'KeyA' })).toBe(false)
  })
  it('ignores fields and dialogs', () => {
    const input = document.createElement('input')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(input, dialog)
    expect(press({}, input)).toBe(false)
    expect(press({}, dialog)).toBe(false)
    input.remove()
    dialog.remove()
  })
})

describe('isEnterKey', () => {
  const press = (init = {}, target) => {
    const event = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, ...init })
    let result
    ;(target ?? document.body).addEventListener('keydown', (e) => (result = isEnterKey(e)), {
      once: true,
    })
    ;(target ?? document.body).dispatchEvent(event)
    return result
  }

  it('accepts a plain Enter on the page', () => expect(press()).toBe(true))
  it('ignores repeats and modifiers', () => {
    expect(press({ repeat: true })).toBe(false)
    expect(press({ shiftKey: true })).toBe(false)
    expect(press({ ctrlKey: true })).toBe(false)
  })
  it('leaves fields, buttons, links and dialogs alone', () => {
    for (const html of [
      '<input>',
      '<textarea></textarea>',
      '<button>b</button>',
      '<a href="/x">l</a>',
      '<div role="dialog"><span tabindex="0">x</span></div>',
    ]) {
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.append(host)
      const el = host.firstElementChild.firstElementChild ?? host.firstElementChild
      expect(press({}, el), html).toBe(false)
      host.remove()
    }
  })
})
