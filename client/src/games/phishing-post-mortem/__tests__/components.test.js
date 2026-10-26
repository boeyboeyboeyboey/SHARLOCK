import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import PhishingPostMortem from '../PhishingPostMortem.vue'
import EmailInspector from '../components/EmailInspector.vue'
import InboxList from '../components/InboxList.vue'
import VerdictPanel from '../components/VerdictPanel.vue'
import { readAttempt, writeAttempt } from '../../../features/attempts/api.js'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn(),
  safeAttemptError: (failure) => ({
    message: failure?.response?.data?.error?.message ?? 'Could not reach saved play.',
    status: failure?.response?.status ?? 0,
  }),
}))

// jsdom has no element scrollTo
Element.prototype.scrollTo = vi.fn()

afterEach(() => vi.resetAllMocks())

const email = {
  id: 'a11',
  senderName: 'Aurora IT Service Desk',
  senderAddress: 'it-servicedesk@aurora-dynarnics.example',
  replyTo: 'sso-helpdesk@mailbox-relay.example',
  subject: 'Action required',
  sentAt: '2026-09-14T07:58:00.000Z',
  bodyText: 'Re-verify your access',
  links: [
    {
      id: 'a11-l1',
      label: 'https://sso.aurora-dynamics.example/reverify',
      destination: 'https://aurora-dynarnics-sso.example/verify',
    },
  ],
}
const options = [
  { id: 'ev-a', label: 'Clue A' },
  { id: 'ev-b', label: 'Clue B' },
  { id: 'ev-c', label: 'Clue C' },
]

async function mountPage(attemptId) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/phishing-post-mortem', component: PhishingPostMortem },
    ],
  })
  await router.push({ path: '/games/phishing-post-mortem', query: { attempt: attemptId } })
  await router.isReady()
  const wrapper = mount(PhishingPostMortem, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('inbox list', () => {
  it('shows every message with its sender and emits the opened id', async () => {
    const wrapper = mount(InboxList, {
      props: { emails: [{ ...email, read: false }], selectedEmailId: '' },
    })
    expect(wrapper.text()).toContain('Aurora IT Service Desk')
    expect(wrapper.text()).toContain('Action required')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select-email')[0]).toEqual(['a11'])
  })
})

describe('phishing case page', () => {
  it('keeps a failed verdict visible and lets the learner retry it', async () => {
    const attempt = {
      gameId: 'phishing-post-mortem',
      attemptId: 'att-1',
      revision: 0,
      status: 'active',
      score: 0,
      maxScore: 100,
      publicState: {
        verdict: null,
        case: {
          caseId: 'case-01',
          datasetVersion: '2026-09-21',
          title: 'Test case',
          organisation: 'Testco',
          briefing: 'Find it',
          timezoneLabel: 'SGT (UTC+8)',
          requiredEvidence: 2,
          emails: [email],
          timeline: [
            { id: 't1', at: '2026-09-14T00:30:00.000Z', label: 'Proxy', detail: 'opened' },
          ],
          evidenceOptions: options,
        },
      },
    }
    readAttempt.mockResolvedValue(attempt)
    let finishRetry
    writeAttempt
      .mockRejectedValueOnce({
        response: {
          status: 503,
          data: { error: { message: 'The verdict service is unavailable.' } },
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRetry = resolve
          }),
      )

    const wrapper = await mountPage('att-1')
    await wrapper.get('.sharmail-row').trigger('click')
    await wrapper.get('.sharmail-accuse').trigger('click')
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true)
    await wrapper.get('.sharmail-submit').trigger('click')
    await flushPromises()

    expect(wrapper.find('.sharmail').exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toContain('The verdict service is unavailable.')
    expect(wrapper.get('.sharmail-row').attributes('aria-current')).toBe('true')
    expect(wrapper.get('.sharmail-accuse').attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3)
    const retryButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Retry verdict')
    expect(retryButton.exists()).toBe(true)

    await retryButton.trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    const judged = {
      ...attempt,
      revision: 1,
      publicState: {
        ...attempt.publicState,
        verdict: {
          score: 100,
          result: { emailCorrect: true },
          feedback: { summary: 'The evidence supports your verdict.' },
          debrief: {
            summary: 'The message started the incident.',
            patientZero: {
              subject: email.subject,
              senderName: email.senderName,
              senderAddress: email.senderAddress,
            },
            chain: ['A link was opened.'],
            evidence: [],
            decoys: [],
          },
        },
      },
    }
    finishRetry(judged)
    writeAttempt.mockResolvedValueOnce({
      ...judged,
      revision: 2,
      status: 'completed',
      score: 100,
      persisted: true,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('100 / 100 points')
    expect(wrapper.find('.sharmail').exists()).toBe(true)
  })
})

describe('email inspector', () => {
  it('shows the real sender and reply-to addresses', () => {
    const wrapper = mount(EmailInspector, { props: { email } })
    expect(wrapper.text()).toContain('it-servicedesk@aurora-dynarnics.example')
    expect(wrapper.text()).toContain('sso-helpdesk@mailbox-relay.example')
  })

  it('hides a destination until it is inspected, renders no anchor, and can hide it again', async () => {
    const wrapper = mount(EmailInspector, { props: { email } })
    expect(wrapper.text()).not.toContain('aurora-dynarnics-sso.example/verify')
    expect(wrapper.find('a').exists()).toBe(false)
    const button = wrapper.get('.sharmail-inspect')
    await button.trigger('click')
    expect(wrapper.text()).toContain('aurora-dynarnics-sso.example/verify')
    expect(wrapper.emitted('inspect-link')[0]).toEqual(['a11-l1'])
    await button.trigger('click')
    expect(wrapper.text()).not.toContain('aurora-dynarnics-sso.example/verify')
  })
})

describe('verdict panel', () => {
  const props = {
    selectedEmailId: '',
    selectedSubject: '',
    evidenceOptions: options,
    selectedEvidenceIds: [],
    disabled: false,
  }

  it('cannot submit without an accusation and two clues', () => {
    const wrapper = mount(VerdictPanel, { props })
    expect(wrapper.get('.sharmail-submit').attributes('disabled')).toBeDefined()
  })

  it('emits the new clue selection when one is toggled', async () => {
    const wrapper = mount(VerdictPanel, { props })
    await wrapper.findAll('input[type="checkbox"]')[1].trigger('change')
    expect(wrapper.emitted('update-evidence')[0]).toEqual([['ev-b']])
  })

  it('locks the remaining clues once two are chosen and explains why', () => {
    const wrapper = mount(VerdictPanel, {
      props: { ...props, selectedEvidenceIds: ['ev-a', 'ev-b'] },
    })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes[2].attributes('disabled')).toBeDefined()
    expect(boxes[0].attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Clear one to pick a different clue')
  })

  it('submits once an accusation and two clues are in place', async () => {
    const wrapper = mount(VerdictPanel, {
      props: {
        ...props,
        selectedEmailId: 'a11',
        selectedSubject: 'Action required',
        selectedEvidenceIds: ['ev-a', 'ev-b'],
      },
    })
    expect(wrapper.text()).toContain('Action required')
    await wrapper.get('.sharmail-submit').trigger('click')
    expect(wrapper.emitted('submit-verdict')).toHaveLength(1)
  })
})
