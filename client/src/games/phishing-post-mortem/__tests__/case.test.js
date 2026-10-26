import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { usePhishingCase } from '../composables/usePhishingCase.js'
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

afterEach(() => vi.resetAllMocks())

const publicCase = {
  caseId: 'case-01',
  datasetVersion: '2026-09-21',
  title: 'Test case',
  organisation: 'Testco',
  briefing: 'Find it',
  timezoneLabel: 'SGT (UTC+8)',
  requiredEvidence: 2,
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
const verdict = { score: 100, result: { emailCorrect: true }, feedback: {}, debrief: {} }
const active = {
  gameId: 'phishing-post-mortem',
  attemptId: 'att-1',
  revision: 0,
  status: 'active',
  score: 0,
  maxScore: 100,
  publicState: { case: publicCase, verdict: null },
}
const judged = { ...active, revision: 1, publicState: { case: publicCase, verdict } }
const done = { ...judged, revision: 2, status: 'completed', score: 100, persisted: true }

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

async function started() {
  writeAttempt.mockResolvedValueOnce(active)
  const { game } = harness()
  await game.start({ kind: 'personal' })
  await flushPromises()
  return game
}

function fillVerdict(game) {
  game.selectEmail('a01')
  game.accuse('a02')
  game.setEvidence(['ev-a', 'ev-b'])
}

describe('phishing case state', () => {
  it('starts an attempt and shows its case with nothing read, opened or accused', async () => {
    const game = await started()
    expect(writeAttempt).toHaveBeenCalledWith(
      '/games/phishing-post-mortem/attempts',
      { context: { kind: 'personal' } },
      expect.any(AbortSignal),
    )
    expect(game.caseFile.value.caseId).toBe('case-01')
    expect(game.emails.value.every((email) => !email.read)).toBe(true)
    expect(game.selectedEmailId.value).toBe('')
    expect(game.accusedEmailId.value).toBe('')
    expect(game.canSubmit.value).toBe(false)
    expect(game.result.value).toBeNull()
  })

  it('opening a message marks it read without accusing it', async () => {
    const game = await started()
    game.selectEmail('a02')
    expect(game.selectedEmail.value.subject).toBe('Two')
    expect(game.emails.value.find((email) => email.id === 'a02').read).toBe(true)
    expect(game.pane.value).toBe('message')
    expect(game.accusedEmailId.value).toBe('')
  })

  it('keeps at most two clues and only submits with an accusation', async () => {
    const game = await started()
    game.setEvidence(['ev-a', 'ev-b', 'ev-c'])
    expect(game.selectedEvidenceIds.value).toEqual(['ev-a', 'ev-b'])
    expect(game.canSubmit.value).toBe(false)
    game.accuse('a01')
    expect(game.canSubmit.value).toBe(true)
  })

  it('submits the verdict as an action and then saves the attempt', async () => {
    const game = await started()
    fillVerdict(game)
    writeAttempt.mockResolvedValueOnce(judged).mockResolvedValueOnce(done)
    await game.submit()
    await flushPromises()
    const [path, body] = writeAttempt.mock.calls[1]
    expect(path).toBe('/attempts/att-1/actions')
    expect(body).toMatchObject({
      type: 'submit-verdict',
      expectedRevision: 0,
      payload: { selectedEmailId: 'a02', evidenceIds: ['ev-a', 'ev-b'] },
    })
    expect(writeAttempt.mock.calls[2][0]).toBe('/attempts/att-1/complete')
    expect(game.result.value).toMatchObject({ score: 100, maxScore: 100 })
    expect(game.completed.value).toBe(true)
    expect(game.canSubmit.value).toBe(false)
  })

  it('reopens a message for review after the verdict and returns to the debrief', async () => {
    const game = await started()
    fillVerdict(game)
    writeAttempt.mockResolvedValueOnce(judged).mockResolvedValueOnce(done)
    await game.submit()
    await flushPromises()
    expect(game.reviewing.value).toBe(false)
    game.selectEmail('a02')
    expect(game.reviewing.value).toBe(true)
    expect(game.selectedEmail.value.id).toBe('a02')
    game.backToDebrief()
    expect(game.reviewing.value).toBe(false)
  })

  it('keeps a failed verdict ready to retry and then saves', async () => {
    const game = await started()
    fillVerdict(game)
    game.showInbox()
    writeAttempt
      .mockRejectedValueOnce({
        response: {
          status: 503,
          data: { error: { message: 'The verdict service is unavailable.' } },
        },
      })
      .mockResolvedValueOnce(judged)
      .mockResolvedValueOnce(done)
    await game.submit()
    await flushPromises()
    expect(game.error.value).toBe('The verdict service is unavailable.')
    expect(game.retryable.value).toBe(true)
    expect(game.selectedEmailId.value).toBe('a01')
    expect(game.accusedEmailId.value).toBe('a02')
    expect(game.selectedEvidenceIds.value).toEqual(['ev-a', 'ev-b'])
    expect(game.pane.value).toBe('inbox')

    await game.retry()
    await flushPromises()
    expect(writeAttempt.mock.calls[2][1]).toEqual(writeAttempt.mock.calls[1][1])
    expect(game.error.value).toBe('')
    expect(game.completed.value).toBe(true)
  })

  it('leaves a judged attempt unsaved when saving fails and saves on retry', async () => {
    const game = await started()
    fillVerdict(game)
    writeAttempt
      .mockResolvedValueOnce(judged)
      .mockRejectedValueOnce({ response: { status: 503, data: { error: { message: 'Down.' } } } })
      .mockResolvedValueOnce(done)
    await game.submit()
    await flushPromises()
    expect(game.unsaved.value).toBe(true)
    expect(game.retryable.value).toBe(true)
    await game.retry()
    await flushPromises()
    expect(game.unsaved.value).toBe(false)
    expect(game.completed.value).toBe(true)
  })

  it('resumes a saved attempt with its verdict and clears the inbox for a new attempt', async () => {
    readAttempt.mockResolvedValueOnce(done)
    const { game } = harness()
    await game.load('att-1')
    await flushPromises()
    expect(game.completed.value).toBe(true)
    expect(game.result.value.score).toBe(100)

    game.selectEmail('a01')
    writeAttempt.mockResolvedValueOnce({ ...active, attemptId: 'att-2' })
    game.resetGame()
    await game.start({ kind: 'personal' })
    await flushPromises()
    expect(game.reviewing.value).toBe(false)
    expect(game.selectedEmailId.value).toBe('')
    expect(game.result.value).toBeNull()
  })

  it('reports a failed attempt load', async () => {
    readAttempt.mockRejectedValueOnce({
      response: { status: 404, data: { error: { message: 'Attempt not found.' } } },
    })
    const { game } = harness()
    await game.load('missing')
    await flushPromises()
    expect(game.error.value).toBe('Attempt not found.')
    expect(game.caseFile.value).toBeNull()
  })
})
