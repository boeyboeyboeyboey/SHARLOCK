import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../features/auth/store.js'
import { createMemoryHistory, createRouter } from 'vue-router'
import ClearanceTowerGame from '../ClearanceTowerGame.vue'
import { howToPlayFor } from '../howToPlay.js'
import { listAttemptContexts, readAttempt, writeAttempt } from '../../../features/attempts/api.js'
import {
  LEVELS,
  publicLevel,
} from '../../../../../server/src/modules/games/clearance-tower/levels.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: (error) => ({
    message: error?.message || 'Could not reach saved play.',
    status: error?.status || 0,
  }),
}))

const levels = LEVELS.map((level) => ({
  ...publicLevel(level),
  submitted: false,
  hints: { used: 0, max: 2, cost: 10, texts: [] },
}))
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
      { path: '/login', component: { template: '<div />' } },
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
  vi.unstubAllGlobals()
  sessionStorage.clear()
  document.body.innerHTML = ''
})

const buttonNamed = (wrapper, name) =>
  wrapper.findAll('button').find((button) => button.text().includes(name))

async function openDeskFor(wrapper, levelTitle) {
  await buttonNamed(wrapper, levelTitle).trigger('click')
  await flushPromises()
  await buttonNamed(wrapper, 'Open the policy desk').trigger('click')
  await flushPromises()
}

async function reachPredictions(wrapper, level) {
  await buttonNamed(wrapper, 'Next: predict').trigger('click')
  await flushPromises()
  for (const prompt of level.predictions)
    await wrapper.get(`input[name="prediction-${prompt.id}"][value="deny"]`).setValue(true)
}

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

describe('clearance tower recovery', () => {
  it('offers Sign in only once signed out, and carries the climb to come back to', async () => {
    readAttempt.mockResolvedValue(active)
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(wrapper, levels[0].title)
    useAuthStore().user = null
    writeAttempt.mockRejectedValueOnce(Object.assign(new Error('Sign in again.'), { status: 401 }))
    await buttonNamed(wrapper, 'Hint').trigger('click')
    await flushPromises()
    const link = wrapper.get('[role="alert"] a[href^="/login"]')
    expect(link.text()).toBe('Sign in')
    expect(decodeURIComponent(link.attributes('href'))).toContain(
      'returnTo=/games/clearance-tower?attempt=climb-1',
    )
  })

  it('notes the older scoring in the guide for an older climb only', () => {
    expect(howToPlayFor('clear-4').rules.join(' ')).not.toContain('older scoring')
    expect(howToPlayFor('clear-3').rules.join(' ')).toContain('older scoring')
  })

  it('offers Reload climb and Sign in after a non-retryable error, and reloads', async () => {
    readAttempt.mockResolvedValue(active)
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(wrapper, levels[0].title)
    writeAttempt.mockRejectedValueOnce(
      Object.assign(new Error('This case changed in another tab.'), { status: 409 }),
    )
    await buttonNamed(wrapper, 'Hint').trigger('click')
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('This case changed in another tab.')
    expect(alert.text()).not.toContain('Retry same request')
    expect(alert.find('a[href^="/login"]').exists()).toBe(false)

    readAttempt.mockClear()
    await buttonNamed(wrapper, 'Reload climb').trigger('click')
    await flushPromises()
    expect(readAttempt).toHaveBeenCalledWith('climb-1', expect.any(AbortSignal))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Policy desk')
  })

  it('keeps the retry offer for a lost response', async () => {
    readAttempt.mockResolvedValue(active)
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(wrapper, levels[0].title)
    writeAttempt.mockRejectedValueOnce(new Error('Network lost'))
    await buttonNamed(wrapper, 'Hint').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Retry same request')
    expect(buttonNamed(wrapper, 'Reload climb')).toBeUndefined()
  })

  it('shows an abandoned climb as ended and lets the player start again', async () => {
    readAttempt.mockResolvedValue({ ...active, status: 'abandoned' })
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper, router } = await mountGame({ attempt: 'climb-1' })
    expect(wrapper.text()).toContain('This climb has ended')
    expect(wrapper.text()).not.toContain('Choose a case')
    await buttonNamed(wrapper, 'Start another climb').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.attempt).toBeUndefined()
    expect(wrapper.text()).toContain('Start a climb')
  })

  it('keeps Run the day focusable while the request runs', async () => {
    readAttempt.mockResolvedValue(active)
    const { wrapper } = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(wrapper, levels[0].title)
    await reachPredictions(wrapper, levels[0])
    let release
    writeAttempt.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const run = buttonNamed(wrapper, 'Run the day')
    await run.trigger('click')
    await flushPromises()
    const running = buttonNamed(wrapper, 'Running')
    expect(running.attributes('disabled')).toBeUndefined()
    expect(running.attributes('aria-disabled')).toBe('true')
    await running.trigger('click')
    expect(writeAttempt).toHaveBeenCalledTimes(1)
    release(active)
    await flushPromises()
  })

  it('restores an unsaved policy after a reload and says so', async () => {
    readAttempt.mockResolvedValue(active)
    const first = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(first.wrapper, levels[0].title)
    await first.wrapper.get('[aria-label="Director Hale may read Ops Plan"]').trigger('click')
    await flushPromises()
    first.wrapper.unmount()

    const second = await mountGame({ attempt: 'climb-1' })
    await openDeskFor(second.wrapper, levels[0].title)
    expect(second.wrapper.text()).toContain('Your unsaved policy and calls for this case were')
    expect(
      second.wrapper
        .get('[aria-label="Director Hale may read Ops Plan"]')
        .attributes('aria-pressed'),
    ).toBe('true')
  })
})

describe('clearance tower reduced motion', () => {
  function stubMotionQuery(matches) {
    const query = { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    return query
  }

  const ranMatrix = (revision) => ({
    ...active,
    revision,
    publicState: {
      ...active.publicState,
      submittedCount: 1,
      readyToComplete: true,
      levels: levels.map((level, index) =>
        index === 0
          ? {
              ...level,
              submitted: true,
              result: {
                score: 15,
                stars: 0,
                policy: { grants: [] },
                events: [
                  { id: 'w1', kind: 'work', outcome: 'blocked', story: 'One.', steps: [] },
                  { id: 'w2', kind: 'work', outcome: 'blocked', story: 'Two.', steps: [] },
                  { id: 'w3', kind: 'work', outcome: 'blocked', story: 'Three.', steps: [] },
                ],
              },
            }
          : level,
      ),
    },
  })

  const pauseButton = (wrapper) => wrapper.findAll('button').find((item) => item.text() === 'Pause')

  async function reachDay(query) {
    readAttempt.mockResolvedValue(ranMatrix(1))
    const mounted = await mountGame({ attempt: 'climb-1' })
    await buttonNamed(mounted.wrapper, levels[0].title).trigger('click')
    await flushPromises()
    expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    return mounted
  }

  it('does not autoplay the day under reduced motion', async () => {
    const query = stubMotionQuery(true)
    const { wrapper } = await reachDay(query)
    expect(wrapper.text()).toContain('Event 0 of 3')
    expect(pauseButton(wrapper)).toBeUndefined()
  })

  it('stops a running day when the setting turns on, and drops its listener on leaving', async () => {
    const query = stubMotionQuery(false)
    const { wrapper } = await reachDay(query)
    expect(pauseButton(wrapper)).toBeDefined()
    const [, onChange] = query.addEventListener.mock.calls[0]
    onChange({ matches: true })
    await flushPromises()
    expect(pauseButton(wrapper)).toBeUndefined()
    wrapper.unmount()
    expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange)
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
