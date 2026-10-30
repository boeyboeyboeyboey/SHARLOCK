import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GlobalProgressBar from '../components/portal/GlobalProgressBar.vue'
import TrophyCase from '../components/portal/TrophyCase.vue'

describe('portal learning states', () => {
  it.each([
    [1, 5, '20'],
    [10, 5, '100'],
    [-1, 5, '0'],
    [0, 0, '0'],
  ])('announces bounded progress for %s of %s activities', (completed, total, expected) => {
    const wrapper = mount(GlobalProgressBar, { props: { completed, total } })
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe(expected)
    wrapper.unmount()
  })

  it('shows an encouraging empty trophy case without inventing badges', () => {
    const wrapper = mount(TrophyCase)
    expect(wrapper.text()).toContain('No badges yet')
    expect(wrapper.findAll('li')).toHaveLength(0)
    wrapper.unmount()
  })
})
