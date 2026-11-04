import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TagBanner from '../components/TagBanner.vue'

describe('TagBanner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows clean at round start and hides after the hold', async () => {
    const wrapper = mount(TagBanner)
    expect(wrapper.get('[data-testid="tag-banner"]').text()).toContain('CLEAN')
    vi.advanceTimersByTime(2600)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="tag-banner"]').exists()).toBe(false)
  })

  it('shows infected for patient zero', () => {
    const wrapper = mount(TagBanner, { props: { selfInfected: true } })
    expect(wrapper.get('[data-testid="tag-banner"]').text()).toContain('Tag everyone!')
  })

  it('shows infected when tagged mid-round, then hides', async () => {
    const wrapper = mount(TagBanner)
    vi.advanceTimersByTime(2600)
    await wrapper.setProps({ selfInfected: true })
    expect(wrapper.get('[data-testid="tag-banner"]').text()).toContain('INFECTED')
    vi.advanceTimersByTime(2600)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="tag-banner"]').exists()).toBe(false)
  })

  it('stays silent for spectators', () => {
    const wrapper = mount(TagBanner, { props: { watching: true } })
    expect(wrapper.find('[data-testid="tag-banner"]').exists()).toBe(false)
  })
})
