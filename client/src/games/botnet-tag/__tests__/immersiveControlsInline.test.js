import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ImmersiveControls from '../../../features/menu/ImmersiveControls.vue'

const global = { stubs: { SiteMenu: true } }

describe('inline immersive controls', () => {
  it('shows the sound and end slots a game passes, with no view switch', () => {
    const wrapper = mount(ImmersiveControls, {
      props: { inline: true },
      slots: { sound: '<button>Sound</button>', end: '<button>How to play</button>' },
      global,
    })
    expect(wrapper.text()).toContain('Sound')
    expect(wrapper.text()).toContain('How to play')
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
  })

  it('stays just the Menu button for a page that passes nothing, such as the navbar', () => {
    const wrapper = mount(ImmersiveControls, { props: { inline: true }, global })
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('[data-testid="menu-button"]').text()).toContain('Menu')
    expect(wrapper.find('[data-testid="sound-slot"]').exists()).toBe(false)
  })

  it('keeps the switch and the sound slot on the town', () => {
    const wrapper = mount(ImmersiveControls, { global })
    expect(wrapper.find('[role="group"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sound-slot"]').exists()).toBe(true)
  })
})
