import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TrophyCase from '../TrophyCase.vue'

const stubs = { global: { stubs: { PixelIcon: true } } }
const earned = [{ id: 'a', name: 'Alpha', description: 'First.', icon: 'trophy' }]

describe('trophy case locked badges', () => {
  it('renders no locked list without the locked prop', () => {
    const wrapper = mount(TrophyCase, { props: { achievements: earned }, ...stubs })
    expect(wrapper.text()).not.toContain('Locked')
    expect(wrapper.text()).not.toContain('Still to find')
  })

  it('renders locked badges after the earned ones', () => {
    const locked = [{ id: 'b', name: 'Beta', description: 'Second.' }]
    const wrapper = mount(TrophyCase, { props: { achievements: earned, locked }, ...stubs })
    expect(wrapper.text()).toContain('Still to find')
    expect(wrapper.get('.achievement-badge--locked').text()).toContain('Locked')
  })
})
