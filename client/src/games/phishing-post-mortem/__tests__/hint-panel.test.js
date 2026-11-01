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
    expect(wrapper.get('button').attributes('aria-disabled')).toBe('false')
  })

  it('says so when no hints remain, stays focusable and ignores a press', async () => {
    const wrapper = mount(HintPanel, {
      props: { tier: 2, maxTier: 2, lines: ['One.', 'Two.'] },
    })
    const button = wrapper.get('button')
    expect(button.text()).toBe('No more hints')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('hint')).toBeUndefined()
  })

  it('stays focusable and ignores a press while the game is busy', async () => {
    const wrapper = mount(HintPanel, { props: { tier: 0, maxTier: 2, disabled: true } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('hint')).toBeUndefined()
  })

  it('keeps its live region rendered before the first hint, so the hint is announced', async () => {
    const wrapper = mount(HintPanel, { props: { tier: 0, maxTier: 2 } })
    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toBe('')
    await wrapper.setProps({ tier: 1, lines: ['Look closely at who really sent this.'] })
    expect(wrapper.get('[aria-live="polite"]').element).toBe(live.element)
    expect(live.text()).toContain('Look closely')
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
