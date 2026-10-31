import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HintPanel from '../components/HintPanel.vue'
import RoundFeedback from '../components/RoundFeedback.vue'

describe('HintPanel', () => {
  it('offers a first hint and emits when pressed', async () => {
    const wrapper = mount(HintPanel, { props: { tier: 0, maxTier: 2 } })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Hint')
    await button.trigger('click')
    expect(wrapper.emitted('hint')).toHaveLength(1)
  })

  it('shows the hint lines and offers another hint after tier 1', () => {
    const wrapper = mount(HintPanel, { props: { tier: 1, maxTier: 2, lines: ['Look here.'] } })
    expect(wrapper.text()).toContain('Look here.')
    expect(wrapper.get('button').text()).toBe('Another hint')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('is disabled with a clear label when no hints remain', () => {
    const wrapper = mount(HintPanel, {
      props: { tier: 2, maxTier: 2, lines: ['One.', 'Two.'] },
    })
    expect(wrapper.get('button').text()).toBe('No more hints')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled while the game is busy', () => {
    const wrapper = mount(HintPanel, { props: { tier: 0, maxTier: 2, disabled: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})

describe('RoundFeedback hint note', () => {
  const last = {
    roundId: 'abcdef',
    call: 'trust',
    correct: true,
    tellHit: false,
    points: 10,
    verdict: 'legit',
    type: 'legit',
    tellPartIds: [],
    explanation: 'Fine.',
  }
  it('says when a hint was used', () => {
    const used = mount(RoundFeedback, { props: { last: { ...last, hintTier: 1 } } })
    expect(used.text()).toContain('Hint used')
    const unused = mount(RoundFeedback, { props: { last: { ...last, hintTier: 0 } } })
    expect(unused.text()).not.toContain('Hint used')
  })
})
