import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ImmersiveControls from '../ImmersiveControls.vue'

const user = { username: 'detective_boey', avatarId: 'capybara', globalRoles: ['student'] }
const wrappers = []

function mountControls(props = {}) {
  const wrapper = mount(ImmersiveControls, {
    props: { mode: '3d', user, ...props },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  wrappers.push(wrapper)
  return wrapper
}
function press(key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('3D | 2D switch', () => {
  it('marks the current mode pressed and puts the toggle testid on the other option', () => {
    const wrapper = mountControls({ mode: '3d' })
    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('View mode')
    const [three, two] = group.findAll('button')
    expect(three.attributes('aria-pressed')).toBe('true')
    expect(two.attributes('aria-pressed')).toBe('false')
    expect(wrapper.findAll('[data-testid="town-mode-toggle"]')).toHaveLength(1)
    expect(two.attributes('data-testid')).toBe('town-mode-toggle')
  })

  it('asks to switch only when the other option is chosen', async () => {
    const wrapper = mountControls({ mode: '3d' })
    const [three, two] = wrapper.get('[role="group"]').findAll('button')
    await three.trigger('click')
    expect(wrapper.emitted('toggle-mode')).toBeUndefined()
    await two.trigger('click')
    expect(wrapper.emitted('toggle-mode')).toHaveLength(1)
  })

  it('disables 3D when the wharf cannot start', () => {
    const wrapper = mountControls({ mode: '2d', locked: true })
    expect(wrapper.get('[aria-label="3D town"]').attributes('disabled')).toBeDefined()
  })
})

describe('menu button and Escape', () => {
  it('opens the menu from the button and reports the expanded state', async () => {
    const wrapper = mountControls()
    await wrapper.get('[data-testid="menu-button"]').trigger('click')
    expect(wrapper.emitted('update:menuOpen')[0]).toEqual([true])
    await wrapper.setProps({ menuOpen: true })
    expect(wrapper.get('[data-testid="menu-button"]').attributes('aria-expanded')).toBe('true')
  })

  it('opens the menu on an unhandled Escape', () => {
    vi.useFakeTimers()
    const wrapper = mountControls()
    press('Escape')
    vi.runAllTimers()
    expect(wrapper.emitted('update:menuOpen')?.[0]).toEqual([true])
  })

  it('leaves Escape to a scene that already handled it, or to an open overlay', () => {
    vi.useFakeTimers()
    const wrapper = mountControls()
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    vi.runAllTimers()
    expect(wrapper.emitted('update:menuOpen')).toBeUndefined()
    return wrapper.setProps({ suppressed: true }).then(() => {
      press('Escape')
      vi.runAllTimers()
      expect(wrapper.emitted('update:menuOpen')).toBeUndefined()
    })
  })

  it('closes from the menu and returns focus to the Menu button', async () => {
    const wrapper = mountControls({ menuOpen: true })
    wrapper.getComponent({ name: 'SharlockSiteMenu' }).vm.$emit('close')
    expect(wrapper.emitted('update:menuOpen')[0]).toEqual([false])
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="menu-button"]').element)
  })
})

describe('pixel skin', () => {
  it('keeps the same controls, names and test ids as the glass skin', () => {
    const glass = mountControls({ mode: '2d' })
    const pixel = mountControls({ mode: '2d', skin: 'pixel' })
    const ids = (wrapper) =>
      wrapper.findAll('[data-testid]').map((node) => node.attributes('data-testid'))
    const names = (wrapper) => wrapper.findAll('button').map((node) => node.text())
    expect(ids(pixel)).toEqual(ids(glass))
    expect(names(pixel)).toEqual(names(glass))
    expect(pixel.get('[data-testid="menu-button"]').text()).toContain('Menu')
    expect(pixel.get('[data-testid="mode-2d"]').attributes('aria-pressed')).toBe('true')
    expect(pixel.find('[data-testid="sound-slot"]').exists()).toBe(true)
  })

  it('rejects an unknown skin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountControls({ skin: 'neon' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
