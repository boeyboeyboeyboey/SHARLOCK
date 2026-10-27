import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AttemptContextChooser from '../components/AttemptContextChooser.vue'
import { listAttemptContexts } from '../api.js'

vi.mock('../api.js', () => ({
  listAttemptContexts: vi.fn(),
  safeAttemptError: () => ({ message: 'Retry request', status: 0 }),
}))

let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.resetAllMocks()
})

async function setup(props = {}) {
  listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
  wrapper = mount(AttemptContextChooser, { props })
  await flushPromises()
  return wrapper
}

describe('AttemptContextChooser', () => {
  it('uses the default label and submit text when no props are given', async () => {
    await setup()
    expect(wrapper.find('label').text()).toBe('Save this case to')
    expect(wrapper.find('button').text()).toBe('Open the case')
  })

  it('renders the custom label and submit text', async () => {
    await setup({ label: 'Save this run to', submitLabel: 'Start the run' })
    expect(wrapper.find('label').text()).toBe('Save this run to')
    expect(wrapper.find('button').text()).toBe('Start the run')
    expect(wrapper.text()).not.toContain('Open the case')
  })

  it('emits start with personal context when submitted with the default selection', async () => {
    await setup({ submitLabel: 'Start the call' })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('start')).toEqual([[{ kind: 'personal' }]])
  })
})
