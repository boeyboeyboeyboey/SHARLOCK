import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import CliDefenderGame from '../CliDefenderGame.vue'

const leaveGuard = vi.hoisted(() => ({ current: null }))
const game = vi.hoisted(() => ({ current: null }))

vi.mock('vue-router', async (original) => ({
  ...(await original()),
  onBeforeRouteLeave: (guard) => {
    leaveGuard.current = guard
  },
}))
vi.mock('../composables/useCliDefender.js', () => ({
  useCliDefender: () => game.current,
}))
vi.mock('../../../features/attempts/api.js', () => ({
  listAttemptContexts: vi.fn().mockResolvedValue({
    cohorts: [{ cohortId: 'c1', institutionName: 'SMU', cohortName: 'IS216 G7' }],
    total: 1,
  }),
  safeAttemptError: () => ({ message: 'error' }),
}))

const INCIDENT = {
  incidentId: 'incident-01',
  index: 0,
  alert: {
    title: 'First alert',
    severity: 'high',
    source: 'Firewall log',
    lines: ['sources seen: 192.0.2.1'],
    segments: [[{ text: 'sources seen: ' }, { target: '192.0.2.1', kind: 'ip' }]],
  },
  lookups: { used: 0, limit: 6, results: [] },
  hintTier: 0,
}

const RESULT = {
  mode: 'practice',
  saved: true,
  score: 100,
  maxScore: 2700,
  result: { bestStreak: 1, correct: 1 },
  feedback: { summary: 'You contained 1 of 2 incidents.' },
  topicOutcomes: [],
  debrief: [],
}

function fakeGame(overrides = {}) {
  const phase = ref(overrides.phase ?? 'running')
  const current = ref(overrides.phase === 'briefing' ? null : INCIDENT)
  return {
    phase,
    mode: ref(overrides.mode ?? 'practice'),
    snapshot: ref({ score: 0, streak: 0, multiplier: 1, incidentCount: 8, history: [] }),
    result: ref(overrides.result ?? null),
    lines: ref([]),
    commandHistory: ref([]),
    draft: ref(''),
    pending: ref(false),
    error: ref(''),
    current: computed(() => current.value),
    remainingMs: ref(null),
    paused: ref(false),
    resuming: ref(false),
    canPause: ref(overrides.canPause ?? true),
    pauseBudget: ref(null),
    pauseSecondsLeft: ref(null),
    lastReview: ref(null),
    penalty: ref(null),
    hinting: ref(false),
    saving: ref(false),
    runContext: ref({ kind: 'cohort', cohortId: 'c1' }),
    start: vi.fn(),
    hint: vi.fn(),
    resume: vi.fn(),
    submit: vi.fn(),
    finish: vi.fn(),
    endPractice: vi.fn(),
    replay: vi.fn(() => {
      phase.value = 'briefing'
    }),
    retrySave: vi.fn(),
    pause: vi.fn().mockResolvedValue(false),
  }
}

function setPointer(coarse) {
  globalThis.matchMedia = vi.fn((query) => ({
    matches: coarse && query === '(pointer: coarse)',
  }))
}

function mountGame() {
  return mount(CliDefenderGame, {
    global: { plugins: [createPinia()], stubs: { RouterLink: RouterLinkStub } },
    attachTo: document.body,
  })
}

const buttonNamed = (wrapper, name) =>
  wrapper.findAll('button').find((item) => item.text().includes(name))

async function chooseLeave(wrapper) {
  await wrapper.get('[aria-haspopup="menu"]').trigger('click')
  await flushPromises()
  await buttonNamed(wrapper, 'Quit to briefing').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
  setPointer(false)
})
afterEach(() => {
  delete globalThis.matchMedia
  document.body.innerHTML = ''
})

describe('cli defender game page', () => {
  it('opens the leave dialog on Keep playing, then refocuses the prompt on stay', async () => {
    game.current = fakeGame()
    const wrapper = mountGame()
    await chooseLeave(wrapper)
    expect(document.activeElement.textContent.trim()).toBe('Keep playing')
    await buttonNamed(wrapper, 'Keep playing').trigger('click')
    await flushPromises()
    expect(document.activeElement.id).toBe('cli-command')
    expect(game.current.replay).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('returns to the briefing when the player confirms leaving', async () => {
    game.current = fakeGame()
    const wrapper = mountGame()
    await chooseLeave(wrapper)
    await buttonNamed(wrapper, 'Leave game').trigger('click')
    await flushPromises()
    expect(game.current.replay).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('passes the chosen context when playing again and returns to the menu', async () => {
    game.current = fakeGame({ phase: 'debrief', result: RESULT })
    const wrapper = mountGame()
    await flushPromises()
    await buttonNamed(wrapper, 'Play again').trigger('click')
    expect(game.current.start).toHaveBeenCalledWith('practice', { kind: 'cohort', cohortId: 'c1' })
    await buttonNamed(wrapper, 'Main menu').trigger('click')
    expect(game.current.replay).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not raise a touch keyboard for a template or an alert name', async () => {
    setPointer(true)
    game.current = fakeGame()
    const wrapper = mountGame()
    await nextTick()
    await wrapper.get('button[aria-label^="Insert block ip"]').trigger('click')
    expect(game.current.draft.value).toBe('block ip ')
    expect(document.activeElement.id).not.toBe('cli-command')
    await wrapper.get('button[aria-label^="Use 192.0.2.1"]').trigger('click')
    expect(game.current.draft.value).toBe('block ip 192.0.2.1')
    expect(document.activeElement.id).not.toBe('cli-command')
    wrapper.unmount()
  })

  it('focuses the prompt for a template on a mouse and keyboard', async () => {
    game.current = fakeGame()
    const wrapper = mountGame()
    await nextTick()
    await wrapper.get('button[aria-label^="Insert block ip"]').trigger('click')
    expect(document.activeElement.id).toBe('cli-command')
    wrapper.unmount()
  })

  it('warns before a reload only while a game is running', async () => {
    game.current = fakeGame()
    const wrapper = mountGame()
    const running = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(running)
    expect(running.defaultPrevented).toBe(true)
    game.current.phase.value = 'debrief'
    game.current.result.value = RESULT
    await nextTick()
    const finished = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(finished)
    expect(finished.defaultPrevented).toBe(false)
    wrapper.unmount()
    const gone = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(gone)
    expect(gone.defaultPrevented).toBe(false)
  })

  it('asks on browser back but leaves our own chrome to its own dialog', async () => {
    game.current = fakeGame()
    const wrapper = mountGame()
    window.history.replaceState({ current: '/' }, '')
    const decision = leaveGuard.current({ fullPath: '/' })
    await flushPromises()
    expect(wrapper.get('#cli-leave-confirm-title').text()).toBe('Leave this game?')
    await buttonNamed(wrapper, 'Keep playing').trigger('click')
    await expect(decision).resolves.toBe(false)
    // a top bar push has not touched history yet, so the current entry is not the target
    window.history.replaceState({ current: '/games/cli-cyber-defender' }, '')
    expect(leaveGuard.current({ fullPath: '/' })).toBe(true)
    wrapper.unmount()
  })
})
