import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import HubMinimap from '../HubMinimap.vue'

const mountMap = (peers) =>
  mount(HubMinimap, {
    props: { games: [], player: { x: 0, z: 0, heading: 0 }, peers },
  })

describe('HubMinimap peers', () => {
  it('draws one unnamed dot per classmate and marks staff', async () => {
    const wrapper = mountMap([
      { sid: 'a', x: 5, z: 10, staff: false },
      { sid: 'b', x: -5, z: 20, staff: true },
    ])
    await vi.waitFor(() => expect(wrapper.find('svg').exists()).toBe(true))
    const dots = wrapper.findAll('circle.m-peer')
    expect(dots).toHaveLength(2)
    expect(dots[0].classes()).not.toContain('is-staff')
    expect(dots[1].classes()).toContain('is-staff')
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('draws none by default', async () => {
    const wrapper = mountMap(undefined)
    await vi.waitFor(() => expect(wrapper.find('svg').exists()).toBe(true))
    expect(wrapper.findAll('circle.m-peer')).toHaveLength(0)
  })
})

describe('HubMinimap full-screen map', () => {
  const games = [{ id: 'cli-cyber-defender', name: 'CLI Cyber Defender' }]
  async function openMap(listeners = {}) {
    const wrapper = mount(HubMinimap, {
      props: { games, player: { x: 0, z: 0, heading: 0 }, ...listeners },
      attachTo: document.body,
    })
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="hub-map-cli-cyber-defender"]').exists()).toBe(true),
    )
    await wrapper.get('[data-testid="hub-map-toggle"]').trigger('click')
    await nextTick()
    return wrapper
  }

  it('opens, moves focus inside and returns it to the toggle on Escape', async () => {
    const wrapper = await openMap()
    const toggle = wrapper.get('[data-testid="hub-map-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="hub-map-close"]').element)
    await wrapper.get('[data-testid="hub-minimap"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)
    wrapper.unmount()
  })

  it('wraps Tab inside the open map', async () => {
    const wrapper = await openMap()
    const buttons = wrapper.get('[data-testid="hub-minimap"]').findAll('button')
    buttons.at(-1).element.focus()
    await buttons.at(-1).trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0].element)
    wrapper.unmount()
  })

  it('reports the place and leaves focus where the hub moved it after a pick', async () => {
    const enter = document.createElement('button')
    document.body.append(enter)
    // the hub moves focus on the tick after the pick
    const wrapper = await openMap({ onChoose: () => nextTick(() => enter.focus()) })
    const toggle = wrapper.get('[data-testid="hub-map-toggle"]')
    const pin = wrapper.get('[data-testid="hub-map-cli-cyber-defender"]')
    pin.element.focus()
    await pin.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('choose')).toEqual([['cli-cyber-defender']])
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(enter)
    wrapper.unmount()
    enter.remove()
  })

  it('returns focus to the toggle when the hub does not take it after a pick', async () => {
    const wrapper = await openMap()
    const toggle = wrapper.get('[data-testid="hub-map-toggle"]')
    const pin = wrapper.get('[data-testid="hub-map-cli-cyber-defender"]')
    pin.element.focus()
    await pin.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)
    wrapper.unmount()
  })
})
