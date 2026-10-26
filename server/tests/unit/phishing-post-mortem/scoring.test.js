import { describe, expect, it } from 'vitest'
import { CASE_IDS } from '../../../src/modules/games/phishing-post-mortem/service.js'
import { createPhishingRuleset } from '../../../src/modules/games/phishing-post-mortem/ruleset.js'
import { readAnswers, readCase } from './fixtures.js'

// pick(0) always chooses the first case and leaves the inbox order unchanged
const ruleset = (pick = () => 0) => createPhishingRuleset({ pick })
const stateFor = (entry, caseId) => {
  const { state } = entry.createState()
  const content = readCase(caseId)
  return {
    ...state,
    caseId,
    datasetVersion: content.datasetVersion,
    emailOrder: content.emails.map((email) => email.id),
  }
}
const verdictOf = (entry, caseId, selectedEmailId, evidenceIds) => {
  const payload = entry.validateAction('submit-verdict', { selectedEmailId, evidenceIds })
  return entry.applyAction(stateFor(entry, caseId), { payload })
}
const answerKeyFragments = (caseId) => {
  const answers = readAnswers(caseId)
  return [
    answers.summary,
    ...answers.chain,
    ...Object.values(answers.evidenceNotes).map((n) => n.note),
  ]
}

describe.each(CASE_IDS)('scoring %s', (caseId) => {
  const content = readCase(caseId)
  const answers = readAnswers(caseId)
  const entry = ruleset()
  const wrongEmail = content.emails.find((email) => email.id !== answers.patientZeroId).id
  const distractors = content.evidenceOptions
    .map((option) => option.id)
    .filter((id) => !answers.evidenceIds.includes(id))
  const scoreOf = (selectedEmailId, evidenceIds) =>
    entry.summarize(verdictOf(entry, caseId, selectedEmailId, evidenceIds))

  it('awards 60 for the email and 20 for each supporting clue', () => {
    expect(scoreOf(answers.patientZeroId, answers.evidenceIds).score).toBe(100)
    expect(scoreOf(answers.patientZeroId, [answers.evidenceIds[0], distractors[0]]).score).toBe(80)
    expect(scoreOf(answers.patientZeroId, distractors.slice(0, 2)).score).toBe(60)
  })

  it('scores nothing when the accused email is wrong, even with both correct clues', () => {
    const summary = scoreOf(wrongEmail, answers.evidenceIds)
    expect(summary.score).toBe(0)
    expect(summary.topicOutcomes.every((topic) => !topic.achieved)).toBe(true)
    const shown = entry.serializePublicState(
      verdictOf(entry, caseId, wrongEmail, answers.evidenceIds),
    )
    expect(shown.verdict.result.emailCorrect).toBe(false)
  })

  it('reports topic outcomes for a complete verdict', () => {
    const summary = scoreOf(answers.patientZeroId, answers.evidenceIds)
    expect(summary.topicOutcomes).toHaveLength(3)
    expect(summary.topicOutcomes.every((topic) => topic.achieved)).toBe(true)
  })

  it('reveals the chain only after the verdict, including a wrong one', () => {
    const state = verdictOf(entry, caseId, wrongEmail, distractors.slice(0, 2))
    const { debrief } = entry.serializePublicState(state).verdict
    expect(debrief.patientZero.id).toBe(answers.patientZeroId)
    expect(debrief.chain.length).toBeGreaterThanOrEqual(5)
    expect(debrief.evidence.filter((item) => item.correct)).toHaveLength(2)
    expect(debrief.decoys.every((decoy) => decoy.subject)).toBe(true)
  })

  it('refuses selections that do not belong to the case', () => {
    expect(() => verdictOf(entry, caseId, 'zz99', answers.evidenceIds)).toThrow(/selection/)
    expect(() =>
      verdictOf(entry, caseId, answers.patientZeroId, [answers.evidenceIds[0], 'ev-invented']),
    ).toThrow(/selection/)
  })

  it('keeps the answer key out of the public state before the verdict', () => {
    const payload = JSON.stringify(entry.serializePublicState(stateFor(entry, caseId)))
    expect(payload).not.toContain('patientZeroId')
    for (const fragment of answerKeyFragments(caseId)) expect(payload).not.toContain(fragment)
    expect(entry.serializePublicState(stateFor(entry, caseId)).verdict).toBeNull()
  })

  it('exposes only the debrief and result after the verdict', () => {
    const state = verdictOf(entry, caseId, answers.patientZeroId, answers.evidenceIds)
    const shown = entry.serializePublicState(state)
    expect(Object.keys(shown.verdict).sort()).toEqual(['debrief', 'feedback', 'result', 'score'])
    expect(JSON.stringify(shown.case)).not.toContain(answers.summary)
    expect(shown.verdict.score).toBe(100)
  })
})

describe('ruleset lifecycle', () => {
  const entry = ruleset()
  const answers = readAnswers('case-01')

  it('submits exactly one verdict', () => {
    const state = verdictOf(entry, 'case-01', answers.patientZeroId, answers.evidenceIds)
    const payload = entry.validateAction('submit-verdict', {
      selectedEmailId: answers.patientZeroId,
      evidenceIds: answers.evidenceIds,
    })
    expect(() => entry.applyAction(state, { payload })).toThrow(/already has a verdict/)
    try {
      entry.applyAction(state, { payload })
    } catch (error) {
      expect(error.code).toBe('PHISH_VERDICT_SUBMITTED')
      expect(error.status).toBe(409)
    }
  })

  it('can only complete once a verdict exists', () => {
    const { state } = entry.createState()
    expect(entry.canComplete(state)).toBe(false)
    expect(
      entry.canComplete(verdictOf(entry, 'case-01', answers.patientZeroId, answers.evidenceIds)),
    ).toBe(true)
  })

  it('rejects unknown actions and client supplied case fields', () => {
    expect(() => entry.validateAction('reveal', {})).toThrow()
    expect(() =>
      entry.validateAction('submit-verdict', {
        caseId: 'case-02',
        selectedEmailId: 'a11',
        evidenceIds: answers.evidenceIds,
      }),
    ).toThrow()
  })

  it('picks the case and inbox order from the injected source', () => {
    const last = CASE_IDS.length - 1
    const lastCase = ruleset((limit) => (limit === CASE_IDS.length ? last : 0)).createState().state
    const steady = ruleset(() => 0).createState().state
    const reversed = ruleset((limit) => (limit === CASE_IDS.length ? 0 : limit - 1)).createState()
      .state
    expect(steady.caseId).toBe(CASE_IDS[0])
    expect(lastCase.caseId).toBe(CASE_IDS[last])
    expect(steady.verdict).toBeNull()
    expect(steady.emailOrder).toHaveLength(20)
    expect([...steady.emailOrder].sort()).toEqual([...reversed.emailOrder].sort())
    expect(steady.emailOrder).not.toEqual(reversed.emailOrder)
  })

  it('serializes the stored inbox order and nothing else', () => {
    const { state } = ruleset((limit) => limit - 1).createState()
    const shown = entry.serializePublicState(state)
    expect(shown.case.emails.map((email) => email.id)).toEqual(state.emailOrder)
    expect(shown.case.emails).toHaveLength(20)
  })
})
