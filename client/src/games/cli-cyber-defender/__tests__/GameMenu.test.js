import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GameMenu from '../components/GameMenu.vue'

const items = (wrapper) => wrapper.findAll('[role^="menuitem"]')
const itemNamed = (wrapper, name) => items(wrapper).find((item) => item.text().includes(name))

async function openMenu(props = {}) {
  const wrapper = mount(GameMenu, {
    props: { canPause: true, ...props },
    attachTo: document.body,
  })
  await wrapper.get('[aria-haspopup="menu"]').trigger('click')
  await flushPromises()
  return wrapper
}

describe('cli game menu', () => {
  it('uses a name that differs from the shared top bar menu', () => {
    const wrapper = mount(GameMenu)
    expect(wrapper.get('[aria-haspopup="menu"]').text()).toBe('Options')
    expect(wrapper.get('[role="menu"]').attributes('aria-label')).toBe('Game options')
  })

  it('emits one event per item', async () => {
    const wrapper = await openMenu({ canEnd: true })
    await itemNamed(wrapper, 'Pause').trigger('click')
    await itemNamed(wrapper, 'End practice').trigger('click')
    await itemNamed(wrapper, 'Quit to briefing').trigger('click')
    await itemNamed(wrapper, 'Sound').trigger('click')
    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.emitted('end')).toHaveLength(1)
    expect(wrapper.emitted('leave')).toHaveLength(1)
    expect(wrapper.emitted('toggle-sound')).toHaveLength(1)
    wrapper.unmount()
  })

  it('offers Resume while paused and explains when no pauses are left', async () => {
    const paused = await openMenu({ paused: true })
    await itemNamed(paused, 'Resume').trigger('click')
    expect(paused.emitted('resume')).toHaveLength(1)
    paused.unmount()
    const spent = await openMenu({ canPause: false, pauseNote: 'No pauses left in this game.' })
    expect(itemNamed(spent, 'Pause')).toBeUndefined()
    expect(spent.text()).toContain('No pauses left in this game.')
    spent.unmount()
  })

  it('moves with the arrow keys and returns focus to the button on Escape', async () => {
    const wrapper = await openMenu()
    expect(document.activeElement).toBe(items(wrapper)[0].element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items(wrapper)[1].element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items(wrapper)[0].element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(wrapper.get('[aria-haspopup="menu"]').element)
    expect(wrapper.get('[aria-haspopup="menu"]').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('reports the sound state to assistive technology', async () => {
    const wrapper = await openMenu({ soundOn: true })
    expect(wrapper.get('[role="menuitemcheckbox"]').attributes('aria-checked')).toBe('true')
    await wrapper.setProps({ soundOn: false })
    expect(wrapper.get('[role="menuitemcheckbox"]').attributes('aria-checked')).toBe('false')
    wrapper.unmount()
  })
})
