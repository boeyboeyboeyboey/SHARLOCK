import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { usePhishingCase } from '../composables/usePhishingCase.js'
import { fetchCase, submitVerdict } from '../phishing.js'

vi.mock('../phishing.js', async (original) => ({
  ...(await original()),
  fetchCase: vi.fn(),
  submitVerdict: vi.fn(),
}))

afterEach(() => vi.clearAllMocks())

const caseFile = {
  gameId: 'phishing-post-mortem',
  rulesetVersion: 'phish-1',
  caseId: 'case-01',
  datasetVersion: '2026-09-21',
  title: 'Test case',
  organisation: 'Testco',
  briefing: 'Find it',
  timezoneLabel: 'SGT (UTC+8)',
  maxScore: 100,
  emails: [
    {
      id: 'a01',
      senderName: 'A',
      senderAddress: 'a@x.example',
      replyTo: 'a@x.example',
      subject: 'One',
      sentAt: '2026-09-14T00:00:00.000Z',
      bodyText: 'one',
      links: [],
    },
    {
      id: 'a02',
      senderName: 'B',
      senderAddress: 'b@x.example',
      replyTo: 'b@x.example',
      subject: 'Two',
      sentAt: '2026-09-14T01:00:00.000Z',
      bodyText: 'two',
      links: [],
    },
  ],
  timeline: [{ id: 't1', at: '2026-09-14T00:30:00.000Z', label: 'Proxy', detail: 'opened' }],
  evidenceOptions: [
    { id: 'ev-a', label: 'A' },
    { id: 'ev-b', label: 'B' },
    { id: 'ev-c', label: 'C' },
  ],
}

function harness() {
  let game
  const wrapper = mount({
    setup() {
      game = usePhishingCase()
      return () => null
    },
  })
  return { game, wrapper }
}

describe('phishing case state', () => {
  it('loads a case and starts with nothing read, opened or accused', async () => {
    fetchCase.mockResolvedValue(caseFile)
    const { game } = harness()
    await game.load()
    await flushPromises()
    expect(game.caseFile.value.caseId).toBe('case-01')
    expect(game.emails.value.every((email) => !email.read)).toBe(true)
    expect(game.selectedEmailId.value).toBe('')
    expect(game.accusedEmailId.value).toBe('')
    expect(game.canSubmit.value).toBe(false)
  })

  it('opening a message marks it read without accusing it', async () => {
    fetchCase.mockResolvedValue(caseFile)
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.selectEmail('a02')
    expect(game.selectedEmail.value.subject).toBe('Two')
    expect(game.emails.value.find((email) => email.id === 'a02').read).toBe(true)
    expect(game.pane.value).toBe('message')
    expect(game.accusedEmailId.value).toBe('')
  })

  it('keeps at most two clues and only submits with an accusation', async () => {
    fetchCase.mockResolvedValue(caseFile)
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.setEvidence(['ev-a', 'ev-b', 'ev-c'])
    expect(game.selectedEvidenceIds.value).toEqual(['ev-a', 'ev-b'])
    expect(game.canSubmit.value).toBe(false)
    game.accuse('a01')
    expect(game.canSubmit.value).toBe(true)
  })

  it('submits the accused message with a stable action id and stores the result', async () => {
    fetchCase.mockResolvedValue(caseFile)
    submitVerdict.mockResolvedValue({ score: 100, maxScore: 100 })
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.selectEmail('a01')
    game.accuse('a02')
    game.setEvidence(['ev-a', 'ev-b'])
    await game.submit()
    await flushPromises()
    const [payload] = submitVerdict.mock.calls[0]
    expect(payload.selectedEmailId).toBe('a02')
    expect(payload.caseId).toBe('case-01')
    expect(payload.datasetVersion).toBe('2026-09-21')
    expect(payload.evidenceIds).toEqual(['ev-a', 'ev-b'])
    expect(payload.actionId).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(game.result.value.score).toBe(100)
    expect(game.canSubmit.value).toBe(false)
  })

  it('reopens a message for review after the verdict and returns to the debrief', async () => {
    fetchCase.mockResolvedValue(caseFile)
    submitVerdict.mockResolvedValue({ score: 100, maxScore: 100 })
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.selectEmail('a01')
    expect(game.reviewing.value).toBe(false)
    game.accuse('a02')
    game.setEvidence(['ev-a', 'ev-b'])
    await game.submit()
    await flushPromises()
    expect(game.reviewing.value).toBe(false)
    game.selectEmail('a02')
    expect(game.reviewing.value).toBe(true)
    expect(game.selectedEmail.value.id).toBe('a02')
    expect(game.result.value.score).toBe(100)
    game.backToDebrief()
    expect(game.reviewing.value).toBe(false)
  })

  it('starts the next case outside review mode', async () => {
    fetchCase.mockResolvedValue(caseFile)
    submitVerdict.mockResolvedValue({ score: 60, maxScore: 100 })
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.accuse('a01')
    game.setEvidence(['ev-a', 'ev-b'])
    await game.submit()
    await flushPromises()
    game.selectEmail('a02')
    await game.replay()
    await flushPromises()
    expect(game.reviewing.value).toBe(false)
  })

  it('asks for the other case on replay and clears the previous attempt', async () => {
    fetchCase.mockResolvedValue(caseFile)
    submitVerdict.mockResolvedValue({ score: 60, maxScore: 100 })
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.accuse('a01')
    game.setEvidence(['ev-a', 'ev-b'])
    await game.submit()
    await flushPromises()
    await game.replay()
    await flushPromises()
    expect(fetchCase).toHaveBeenLastCalledWith('case-01', expect.anything())
    expect(game.result.value).toBeNull()
    expect(game.selectedEvidenceIds.value).toEqual([])
  })

  it('retries a failed case load and clears its load error', async () => {
    fetchCase
      .mockRejectedValueOnce({
        response: { data: { error: { message: 'The case file could not be found.' } } },
      })
      .mockResolvedValueOnce(caseFile)
    const { game } = harness()
    await game.load()
    await flushPromises()
    expect(game.loadError.value).toBe('The case file could not be found.')
    expect(game.caseFile.value).toBeNull()

    await game.load()
    await flushPromises()
    expect(game.loadError.value).toBe('')
    expect(game.caseFile.value.caseId).toBe('case-01')
  })

  it('keeps a failed verdict ready to retry with its original request ID', async () => {
    fetchCase.mockResolvedValue(caseFile)
    submitVerdict
      .mockRejectedValueOnce({
        response: { data: { error: { message: 'The verdict service is unavailable.' } } },
      })
      .mockResolvedValueOnce({ score: 100, maxScore: 100 })
    const { game } = harness()
    await game.load()
    await flushPromises()
    game.selectEmail('a01')
    game.accuse('a02')
    game.setEvidence(['ev-a', 'ev-b'])
    game.showInbox()

    await game.submit()
    await flushPromises()

    expect(game.submissionError.value).toBe('The verdict service is unavailable.')
    expect(game.loadError.value).toBe('')
    expect(game.caseFile.value.caseId).toBe('case-01')
    expect(game.selectedEmailId.value).toBe('a01')
    expect(game.emails.value.find((email) => email.id === 'a01').read).toBe(true)
    expect(game.accusedEmailId.value).toBe('a02')
    expect(game.selectedEvidenceIds.value).toEqual(['ev-a', 'ev-b'])
    expect(game.pane.value).toBe('inbox')

    await game.submit()
    await flushPromises()

    const firstPayload = submitVerdict.mock.calls[0][0]
    const retryPayload = submitVerdict.mock.calls[1][0]
    expect(retryPayload).toEqual(firstPayload)
    expect(game.submissionError.value).toBe('')
    expect(game.result.value.score).toBe(100)
  })
})
