import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import SavedAttemptResult from '../components/SavedAttemptResult.vue'

function setup(attempt, props = {}) {
  return mount(SavedAttemptResult, {
    props: { attempt, ...props },
    slots: { default: '<p>Game review</p>' },
    global: { stubs: { RouterLink: RouterLinkStub } },
    attachTo: document.body,
  })
}

const saved = { status: 'completed', persisted: true, score: 30, maxScore: 100 }

describe('SavedAttemptResult', () => {
  it('labels the score, confirms the save and focuses the heading', () => {
    const wrapper = setup(saved)
    expect(wrapper.text()).toContain('Score: 30 / 100')
    expect(wrapper.get('[role="status"]').text()).toBe('Result saved to your account.')
    expect(document.activeElement).toBe(wrapper.get('h2').element)
    expect(wrapper.text()).toContain('Game review')
    wrapper.unmount()
  })

  it.each([
    ['not persisted', { ...saved, persisted: false }],
    ['not completed', { ...saved, status: 'active' }],
  ])('does not claim a save when the attempt is %s', (_name, attempt) => {
    const wrapper = setup(attempt)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits replay from Play again', async () => {
    const wrapper = setup(saved)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('replay')).toHaveLength(1)
    wrapper.unmount()
  })

  it('leaves the actions to a game that places its own', () => {
    const wrapper = setup(saved, { hideActions: true })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Back to town')
    wrapper.unmount()
  })
})
