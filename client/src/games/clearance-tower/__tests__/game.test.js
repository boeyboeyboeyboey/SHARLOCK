import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../features/auth/store.js'
import { createMemoryHistory, createRouter } from 'vue-router'
import ClearanceTowerGame from '../ClearanceTowerGame.vue'
import { listAttemptContexts, readAttempt, writeAttempt } from '../../../features/attempts/api.js'
import {
  LEVELS,
  publicLevel,
} from '../../../../../server/src/modules/games/clearance-tower/levels.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: () => ({ message: 'Could not reach saved play.', status: 0 }),
}))

const levels = LEVELS.map((level) => ({ ...publicLevel(level), submitted: false }))
const active = {
  gameId: 'clearance-tower',
  attemptId: 'climb-1',
  revision: 0,
  status: 'active',
  score: 0,
  maxScore: 600,
  publicState: { totalLevels: 6, submittedCount: 0, readyToComplete: false, levels },
}

async function mountGame(query = {}, dismissed = ['clearance-tower']) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { howToPlayDismissed: dismissed }
  auth.status = 'authenticated'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/clearance-tower', component: ClearanceTowerGame },
    ],
  })
  await router.push({ path: '/games/clearance-tower', query })
  await router.isReady()
  const wrapper = mount(ClearanceTowerGame, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.resetAllMocks()
  document.body.innerHTML = ''
})

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

describe('clearance tower game', () => {
  it('starts a climb from the chooser and resumes it from the route', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    writeAttempt.mockResolvedValue(active)
    const { wrapper, router } = await mountGame()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writeAttempt).toHaveBeenCalledWith(
      '/games/clearance-tower/attempts',
      { context: { kind: 'personal' } },
      expect.any(AbortSignal),
    )
    expect(router.currentRoute.value.query.attempt).toBe('climb-1')
    expect(wrapper.text()).toContain('Choose a case')
    expect(wrapper.text()).toContain('0 of 6 cases run')
  })

  it('resumes an attempt from the route query', async () => {
    readAttempt.mockResolvedValue(active)
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    expect(readAttempt).toHaveBeenCalledWith('climb-1', expect.any(AbortSignal))
    expect(wrapper.text()).toContain('Choose a case')
  })

  it('shows the saved score of 600 with a summary per case after finishing', async () => {
    const done = levels.map((level, index) =>
      index === 0 ? { ...level, submitted: true, result: { score: 90, stars: 3 } } : level,
    )
    readAttempt.mockResolvedValue({
      ...active,
      status: 'completed',
      score: 90,
      persisted: true,
      publicState: { totalLevels: 6, submittedCount: 1, readyToComplete: true, levels: done },
    })
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    expect(wrapper.text()).toContain('90 / 600')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).toContain(`${levels[0].title}: 90 / 100`)
    expect(wrapper.text()).toContain('not played, 0 / 100')
    expect(wrapper.text()).not.toContain('not saved')
  })
})

describe('clearance tower how to play guide', () => {
  it('opens on the first visit before the save chooser', async () => {
    stubDialog()
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame({}, [])
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('dialog').text()).toContain('How to play: Clearance Tower')
  })

  it('stays closed when dismissed and reopens from the button', async () => {
    stubDialog()
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame()
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'How to play')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
  })
})
