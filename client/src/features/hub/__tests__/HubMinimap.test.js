import { mount } from '@vue/test-utils'
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
