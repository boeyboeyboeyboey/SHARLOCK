import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import PhishingPostMortem from '../PhishingPostMortem.vue'
import { listAttemptContexts, readAttempt, writeAttempt } from '../../../features/attempts/api.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: () => ({ message: 'Could not reach saved play.', status: 0 }),
}))

const email = {
  id: 'a01',
  senderName: 'Aurora IT',
  senderAddress: 'it@aurora.example',
  replyTo: 'it@aurora.example',
  subject: 'Action required',
  sentAt: '2026-09-14T07:58:00.000Z',
  bodyText: 'Re-verify your access',
  links: [],
}
const publicCase = {
  caseId: 'case-01',
  datasetVersion: '2026-09-21',
  title: 'The Aurora breach',
  organisation: 'Aurora',
  briefing: 'Find the message that caused it.',
  timezoneLabel: 'SGT (UTC+8)',
  requiredEvidence: 2,
  emails: [email],
  timeline: [{ id: 't1', at: '2026-09-14T00:30:00.000Z', label: 'Proxy', detail: 'opened' }],
  evidenceOptions: [
    { id: 'ev-a', label: 'Clue A' },
    { id: 'ev-b', label: 'Clue B' },
  ],
}
const active = {
  gameId: 'phishing-post-mortem',
  attemptId: 'att-1',
  revision: 0,
  status: 'active',
  score: 0,
  maxScore: 100,
  publicState: { case: publicCase, verdict: null },
}
const saved = {
  ...active,
  revision: 2,
  status: 'completed',
  score: 100,
  persisted: true,
  publicState: {
    case: publicCase,
    verdict: {
      score: 100,
      result: { emailCorrect: true, selectedEmailId: 'a01' },
      feedback: { summary: 'You found it.' },
      debrief: {
        summary: 'The first message started it.',
        patientZero: {
          id: 'a01',
          subject: 'Action required',
          senderName: 'Aurora IT',
          senderAddress: 'it@aurora.example',
        },
        chain: ['A link was opened.'],
        evidence: [],
        decoys: [],
      },
    },
  },
}

async function mountGame(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/phishing-post-mortem', component: PhishingPostMortem },
    ],
  })
  await router.push({ path: '/games/phishing-post-mortem', query })
  await router.isReady()
  const wrapper = mount(PhishingPostMortem, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

// jsdom has no element scrollTo
Element.prototype.scrollTo = vi.fn()

afterEach(() => vi.resetAllMocks())

describe('phishing game', () => {
  it('starts a case from the chooser and keeps the attempt in the route', async () => {
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    writeAttempt.mockResolvedValue(active)
    const { wrapper, router } = await mountGame()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writeAttempt).toHaveBeenCalledWith(
      '/games/phishing-post-mortem/attempts',
      { context: { kind: 'personal' } },
      expect.any(AbortSignal),
    )
    expect(router.currentRoute.value.query.attempt).toBe('att-1')
    expect(wrapper.text()).toContain('The Aurora breach')
    expect(wrapper.text()).not.toContain('Not saved')
  })

  it('shows the saved result with the debrief when a finished attempt is resumed', async () => {
    readAttempt.mockResolvedValue(saved)
    const { wrapper } = await mountGame({ attempt: 'att-1' })
    expect(readAttempt).toHaveBeenCalledWith('att-1', expect.any(AbortSignal))
    expect(wrapper.text()).toContain('100 / 100')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).toContain('The first message started it.')
    expect(wrapper.text()).not.toContain('Not saved')
  })

  it('returns to the chooser on play again', async () => {
    readAttempt.mockResolvedValue(saved)
    listAttemptContexts.mockResolvedValue({ cohorts: [], total: 0 })
    const { wrapper, router } = await mountGame({ attempt: 'att-1' })
    await wrapper.get('button.btn-primary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.attempt).toBeUndefined()
    expect(wrapper.find('form').exists()).toBe(true)
  })
})
