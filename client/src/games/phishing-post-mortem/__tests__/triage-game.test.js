import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../features/auth/store.js'
import PhishingPostMortem from '../PhishingPostMortem.vue'
import { listAttemptContexts, readAttempt, writeAttempt } from '../../../features/attempts/api.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: () => ({ message: 'Could not reach saved play.', status: 0 }),
}))

const email = (id, subject) => ({
  roundId: id,
  tier: 1,
  senderName: 'Aurora IT',
  senderAddress: 'it@aurora.example',
  replyTo: null,
  subject,
  receivedLabel: 'Mon 09:14',
  parts: [
    { id: `${id}-sender`, kind: 'sender', name: 'Aurora IT', address: 'it@aurora.example' },
    { id: `${id}-body`, kind: 'body', text: 'Please review the attached notice.' },
  ],
})

function snap(overrides = {}, state = {}) {
  return {
    gameId: 'phishing-post-mortem',
    rulesetVersion: 'phish-3',
    attemptId: 'att-1',
    revision: 0,
    status: 'active',
    mode: 'practice',
    deadlineAt: null,
    score: 0,
    maxScore: 1000,
    persisted: true,
    publicState: {
      mode: 'practice',
      totalRounds: 12,
      maxMistakes: null,
      roundsPlayed: 0,
      score: 0,
      streak: 0,
      mistakes: 0,
      current: email('r1', 'First subject'),
      last: null,
      ...state,
    },
    ...overrides,
  }
}

const timedSnap = (state = {}) =>
  snap(
    { mode: 'standard', deadlineAt: new Date(Date.now() + 180000).toISOString() },
    { mode: 'standard', totalRounds: null, maxMistakes: 3, ...state },
  )

const lastCall = {
  roundId: 'r1',
  call: 'trust',
  verdict: 'legit',
  correct: true,
  tellHit: false,
  type: 'legit',
  explanation: 'It was a genuine notice.',
  points: 10,
  tellPartIds: [],
}

const review = [
  {
    subject: 'First subject',
    senderAddress: 'it@aurora.example',
    call: 'trust',
    correct: true,
    type: 'legit',
    explanation: 'It was a genuine notice.',
    points: 10,
  },
]

const completedSnap = () =>
  snap(
    { status: 'completed', score: 10 },
    { current: null, last: lastCall, review, roundsPlayed: 12, score: 10 },
  )

async function mountGame(query = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { howToPlayDismissed: ['phishing-post-mortem'] }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/phishing-post-mortem', component: PhishingPostMortem },
    ],
  })
  await router.push({ path: '/games/phishing-post-mortem', query })
  await router.isReady()
  const wrapper = mount(PhishingPostMortem, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

const button = (wrapper, label) => wrapper.findAll('button').find((item) => item.text() === label)

async function startPersonal(wrapper, snapshot = snap()) {
  writeAttempt.mockResolvedValueOnce(snapshot)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

Element.prototype.scrollTo = vi.fn()

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  document.body.innerHTML = ''
})

describe('triage game page', () => {
  it('offers the start control without helper copy', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame()
    expect(button(wrapper, 'Start run')).toBeDefined()
  })

  it('starts a class run with the countdown and keeps the attempt in the route', async () => {
    listAttemptContexts.mockResolvedValue({
      cohorts: [{ cohortId: 'c1', institutionName: 'SMU', cohortName: 'IS216' }],
      total: 1,
    })
    const { wrapper, router } = await mountGame()
    await wrapper.get('select').setValue('c1')
    await startPersonal(wrapper, timedSnap())
    expect(writeAttempt).toHaveBeenCalledWith(
      '/games/phishing-post-mortem/attempts',
      { context: { kind: 'cohort', cohortId: 'c1' } },
      expect.any(AbortSignal),
    )
    expect(router.currentRoute.value.query.attempt).toBe('att-1')
    expect(wrapper.get('[role="timer"]').text()).toMatch(/^[23]:\d\d$/)
    expect(wrapper.text()).toContain('Mistakes 0 of 3')
  })

  it('starts personal practice at email 1 of 12', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame()
    await startPersonal(wrapper)
    expect(wrapper.text()).toContain('Email 1 of 12')
    expect(wrapper.text()).toContain('First subject')
    expect(wrapper.find('[role="timer"]').exists()).toBe(false)
  })

  it('reports a part chosen from the card and can cancel picking', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame()
    await startPersonal(wrapper)
    expect(wrapper.findAll('button.triage-part')).toHaveLength(0)

    await button(wrapper, 'Report').trigger('click')
    expect(wrapper.text()).toContain('Tap what gave it away')
    expect(wrapper.findAll('button.triage-part').length).toBeGreaterThan(0)
    expect(button(wrapper, 'Trust')).toBeUndefined()

    await button(wrapper, 'Cancel').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button.triage-part')).toHaveLength(0)
    expect(document.activeElement).toBe(button(wrapper, 'Report').element)

    await button(wrapper, 'Report').trigger('click')
    writeAttempt.mockResolvedValueOnce(
      snap({ revision: 1 }, { last: { ...lastCall, call: 'report' }, roundsPlayed: 1 }),
    )
    await wrapper.get('button.triage-part[aria-label^="Report sender"]').trigger('click')
    await flushPromises()
    const [path, body] = writeAttempt.mock.calls.at(-1)
    expect(path).toBe('/attempts/att-1/actions')
    expect(body).toMatchObject({
      type: 'triage-call',
      payload: { roundId: 'r1', call: 'report', partId: 'r1-sender' },
    })
  })

  it('sends trust and shows the explanation before the next email in practice', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame()
    await startPersonal(wrapper)
    writeAttempt.mockResolvedValueOnce(
      snap(
        { revision: 1 },
        { current: email('r2', 'Second subject'), last: lastCall, roundsPlayed: 1, score: 10 },
      ),
    )
    await button(wrapper, 'Trust').trigger('click')
    await flushPromises()
    expect(writeAttempt.mock.calls.at(-1)[1].payload).toEqual({ roundId: 'r1', call: 'trust' })
    expect(wrapper.text()).toContain('It was a genuine notice.')
    expect(wrapper.text()).not.toContain('Second subject')

    await button(wrapper, 'Next email').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Second subject')
    expect(wrapper.text()).not.toContain('It was a genuine notice.')
    expect(button(wrapper, 'Report')).toBeDefined()
  })

  it('shows a one line result and the next email at once in a timed run', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    readAttempt.mockResolvedValue(timedSnap())
    const { wrapper } = await mountGame({ attempt: 'att-1' })
    writeAttempt.mockResolvedValueOnce(
      timedSnap({ current: email('r2', 'Second subject'), last: lastCall, roundsPlayed: 1 }),
    )
    await button(wrapper, 'Trust').trigger('click')
    await flushPromises()
    expect(wrapper.get('.triage-live').text()).toContain('Correct +10')
    expect(wrapper.text()).toContain('Second subject')
    expect(wrapper.text()).toContain('Trusted')
    expect(button(wrapper, 'Report').attributes('disabled')).toBeUndefined()
  })

  it('shows the saving status, then the error with a retry while the save is refused', async () => {
    vi.useFakeTimers()
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    readAttempt.mockResolvedValue(snap({}, { current: null, last: lastCall, roundsPlayed: 12 }))
    writeAttempt.mockRejectedValueOnce(new Error('offline'))
    const { wrapper } = await mountGame({ attempt: 'att-1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Saving your run…')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach saved play.')
    expect(button(wrapper, 'Retry')).toBeDefined()

    writeAttempt.mockResolvedValueOnce(completedSnap())
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Saving your run…')
  })

  it('opens a finished run on the debrief and returns to the chooser on play again', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    readAttempt.mockResolvedValue(completedSnap())
    const { wrapper, router } = await mountGame({ attempt: 'att-1' })
    expect(readAttempt).toHaveBeenCalledWith('att-1', expect.any(AbortSignal))
    expect(wrapper.text()).toContain('Run complete')
    expect(wrapper.findAll('button').filter((item) => item.text() === 'Play again')).toHaveLength(1)
    expect(wrapper.text()).toContain('10 / 1000')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).toContain('It was a genuine notice.')

    await wrapper.get('button.btn-primary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.attempt).toBeUndefined()
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('summarises an earlier inbox investigation without crashing', async () => {
    readAttempt.mockResolvedValue({
      gameId: 'phishing-post-mortem',
      rulesetVersion: 'phish-2',
      attemptId: 'old-1',
      revision: 2,
      status: 'completed',
      score: 80,
      maxScore: 100,
      persisted: true,
      publicState: { case: { emails: [] }, verdict: null },
    })
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper } = await mountGame({ attempt: 'old-1' })
    expect(wrapper.text()).toContain('Earlier inbox investigation')
    expect(wrapper.text()).toContain('80 / 100')
    expect(writeAttempt).not.toHaveBeenCalled()

    await button(wrapper, 'Play again').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('resumes an active run from the route', async () => {
    readAttempt.mockResolvedValue(snap())
    const { wrapper } = await mountGame({ attempt: 'att-1' })
    expect(readAttempt).toHaveBeenCalledWith('att-1', expect.any(AbortSignal))
    expect(wrapper.text()).toContain('First subject')
    expect(button(wrapper, 'Report')).toBeDefined()
  })
})
