import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HowToPlayScene from '../components/HowToPlayScene.vue'
import { HOW_TO_PLAY } from '../howToPlay.js'

describe('botnet tag how to play', () => {
  it('has the fields the dialog needs', () => {
    expect(HOW_TO_PLAY.title).toBe('Botnet Tag')
    expect(HOW_TO_PLAY.steps.length).toBeGreaterThanOrEqual(3)
    for (const step of HOW_TO_PLAY.steps) {
      expect(step.title).toBeTruthy()
      expect(step.text.length).toBeLessThan(120)
    }
    expect(HOW_TO_PLAY.learn).toBeTruthy()
    const keys = HOW_TO_PLAY.controls.map((item) => item.keys).join(' ')
    expect(keys).toMatch(/W A S D/)
    expect(keys).toMatch(/Shift/)
    expect(keys).toMatch(/Space/)
  })

  it('renders a caption per step', () => {
    for (let step = 0; step < HOW_TO_PLAY.steps.length; step++) {
      const wrapper = mount(HowToPlayScene, { props: { step } })
      expect(wrapper.get('.tag-howto-caption').text().length).toBeGreaterThan(0)
    }
  })

  it('shows a still frame under reduced motion', () => {
    const wrapper = mount(HowToPlayScene, { props: { step: 1, reducedMotion: true } })
    expect(wrapper.get('[data-testid="tag-howto-scene"]').classes()).toContain('is-static')
    const live = mount(HowToPlayScene, { props: { step: 1 } })
    expect(live.get('[data-testid="tag-howto-scene"]').classes()).not.toContain('is-static')
  })
})
