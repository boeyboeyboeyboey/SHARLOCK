import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AttemptContextChooser from '../components/AttemptContextChooser.vue'
import { useAuthStore } from '../../auth/store.js'
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

const blue = { cohortId: 'c1', institutionName: 'SMU', cohortName: 'Blue' }
const red = { cohortId: 'c2', institutionName: 'SMU', cohortName: 'Red' }

async function setup(props = {}, { cohorts = [], roles = ['student'] } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { id: 'u1', globalRoles: roles }
  listAttemptContexts.mockResolvedValue({ cohorts, total: cohorts.length })
  wrapper = mount(AttemptContextChooser, { props, global: { plugins: [pinia] } })
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

  it('preselects the only class of a student, with personal practice one choice away', async () => {
    await setup({}, { cohorts: [blue] })
    expect(wrapper.get('select').element.value).toBe('c1')
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'Personal practice',
      'SMU · Blue',
    ])
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('start')).toEqual([[{ kind: 'cohort', cohortId: 'c1' }]])
    await wrapper.get('select').setValue('personal')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('start')[1]).toEqual([{ kind: 'personal' }])
  })

  it('keeps personal practice as the default with several classes', async () => {
    await setup({}, { cohorts: [blue, red] })
    expect(wrapper.get('select').element.value).toBe('personal')
  })

  it.each([['instructor'], ['admin']])(
    'tells %s that staff runs are not ranked and never preselects a class',
    async (role) => {
      await setup({}, { cohorts: [blue], roles: [role] })
      expect(wrapper.get('select').element.value).toBe('personal')
      expect(wrapper.text()).toContain('not ranked or shown in class results')
    },
  )

  it('says nothing about staff runs to a student', async () => {
    await setup({}, { cohorts: [blue] })
    expect(wrapper.text()).not.toContain('Staff runs')
  })

  it('reads every page of classes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().user = { id: 'u1', globalRoles: ['student'] }
    listAttemptContexts
      .mockResolvedValueOnce({ cohorts: [blue], total: 2 })
      .mockResolvedValueOnce({ cohorts: [red], total: 2 })
    wrapper = mount(AttemptContextChooser, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(listAttemptContexts).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('option')).toHaveLength(3)
  })

  it('shows the failure, keeps personal practice usable and retries the class list', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().user = { id: 'u1', globalRoles: ['student'] }
    listAttemptContexts.mockRejectedValueOnce(new Error('lost'))
    wrapper = mount(AttemptContextChooser, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Retry request')
    expect(wrapper.get('select').element.value).toBe('personal')
    listAttemptContexts.mockResolvedValueOnce({ cohorts: [blue], total: 1 })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('option')).toHaveLength(2)
  })

  it('disables the controls while the parent says so', async () => {
    await setup({ disabled: true })
    expect(wrapper.get('select').attributes('disabled')).toBeDefined()
    expect(wrapper.find('form > button').attributes('disabled')).toBeDefined()
  })
})
