import { describe, expect, it } from 'vitest'
import { LEVELS, findLevel } from '../../../src/modules/games/clearance-tower/levels.js'
import { parseSubmission } from '../../../src/modules/games/clearance-tower/policy.js'
import {
  clearanceHintsRuleset,
  clearanceLegacyRuleset,
} from '../../../src/modules/games/clearance-tower/legacy.js'
import {
  clearanceRuleset,
  levelMastered,
} from '../../../src/modules/games/clearance-tower/ruleset.js'
import {
  LEGACY_SCORING_RULES,
  SCORING_RULES,
} from '../../../src/modules/games/clearance-tower/scoring.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { deriveAchievements } from '../../../src/modules/progress/achievements.js'
import { predictionList, SOLUTIONS } from './solutions.js'

function submission(levelId, overrides = {}) {
  const { policy, predictions } = SOLUTIONS[levelId]
  return {
    levelId,
    policy,
    predictions: predictionList(predictions),
    ...overrides,
  }
}

function fieldErrorsOf(action) {
  try {
    action()
  } catch (error) {
    expect(error.code).toBe('CLEAR_INVALID_BODY')
    return error.fieldErrors
  }
  throw new Error('expected the input to be rejected')
}

describe('clearance tower validation', () => {
  it('rejects an unsupported field such as a browser score', () => {
    const body = submission('the-gift', { score: 600 })
    expect(fieldErrorsOf(() => parseSubmission(findLevel('the-gift'), body))).toMatchObject({
      score: 'unsupported field',
    })
  })

  it('rejects an own __proto__ field instead of ignoring it', () => {
    const body = JSON.parse(
      `{"levelId":"the-matrix","policy":{"grants":[]},"predictions":[],"__proto__":{"admin":true}}`,
    )
    const errors = fieldErrorsOf(() => parseSubmission(findLevel('the-matrix'), body))
    expect(Object.keys(errors)).toContain('__proto__')
  })

  it('rejects grants for unknown agents, duplicate pairs and unsupported rights', () => {
    const level = findLevel('the-matrix')
    const bad = [
      [{ subject: 'mallory', object: 'ops', rights: ['r'] }],
      [
        { subject: 'director', object: 'ops', rights: ['r'] },
        { subject: 'director', object: 'ops', rights: ['w'] },
      ],
      [{ subject: 'director', object: 'ops', rights: ['x'] }],
      [{ subject: 'director', object: 'ops', rights: ['r', 'r'] }],
    ]
    for (const grants of bad)
      expect(
        fieldErrorsOf(() =>
          parseSubmission(level, submission('the-matrix', { policy: { grants } })),
        ),
      ).toHaveProperty(['policy.grants'])
  })

  it('needs exactly one valid label for every file', () => {
    const level = findLevel('compartments')
    const { objectLabels } = SOLUTIONS.compartments.policy
    const missing = { ...objectLabels }
    delete missing.notice
    const unknownCategory = {
      ...objectLabels,
      notice: { level: 'secret', categories: ['finance'] },
    }
    for (const labels of [
      missing,
      unknownCategory,
      { ...objectLabels, extra: objectLabels.notice },
    ])
      expect(() =>
        parseSubmission(level, submission('compartments', { policy: { objectLabels: labels } })),
      ).toThrow(/could not be read/)
  })

  it('bounds roles and checks every assignment', () => {
    const level = findLevel('roles-not-people')
    const tooMany = Array.from({ length: 9 }, (_, index) => ({
      id: `role-${index}`,
      name: `Role ${index}`,
      permissions: [],
    }))
    const policies = [
      { roles: tooMany, assignments: [] },
      { roles: [{ id: 'r1', name: 'x'.repeat(25), permissions: [] }], assignments: [] },
      { roles: [{ id: 'r1', name: 'Ops', permissions: ['launch-missiles'] }], assignments: [] },
      { roles: [], assignments: [{ agent: 'ada', roleIds: ['ghost'] }] },
    ]
    for (const policy of policies)
      expect(() => parseSubmission(level, submission('roles-not-people', { policy }))).toThrow(
        /could not be read/,
      )
  })

  it('needs one allow or deny verdict per prompt', () => {
    const level = findLevel('the-matrix')
    for (const predictions of [
      [],
      [
        { id: 'p1', verdict: 'maybe' },
        { id: 'p2', verdict: 'deny' },
        { id: 'p3', verdict: 'allow' },
      ],
      [
        { id: 'p1', verdict: 'deny' },
        { id: 'p1', verdict: 'deny' },
        { id: 'p3', verdict: 'allow' },
      ],
    ])
      expect(
        fieldErrorsOf(() => parseSubmission(level, submission('the-matrix', { predictions }))),
      ).toHaveProperty('predictions')
  })
})

describe('clearance tower ruleset', () => {
  const play = (state, levelId) =>
    clearanceRuleset.applyAction(state, {
      type: 'submit-level',
      payload: clearanceRuleset.validateAction('submit-level', submission(levelId)),
    })

  it('scores each level to its known score through the ruleset', () => {
    for (const levelId of Object.keys(SOLUTIONS)) {
      const state = play(clearanceRuleset.createState().state, levelId)
      expect(clearanceRuleset.summarize(state).score).toBe(SOLUTIONS[levelId].score)
    }
  })

  it('rejects a second submission for the same level and bad actions', () => {
    const state = play(clearanceRuleset.createState().state, 'the-matrix')
    expect(() => play(state, 'the-matrix')).toThrow(/already ran its day/)
    expect(() => clearanceRuleset.validateAction('run-day', {})).toThrow(/supported/)
    expect(() => clearanceRuleset.validateAction('submit-level', { levelId: 'nope' })).toThrow(
      /level/,
    )
    expect(() =>
      clearanceRuleset.validateAction('submit-level', { ...submission('the-matrix'), score: 600 }),
    ).toThrow(/could not be read/)
  })

  it('hides every day script and answer until its level is submitted', () => {
    const empty = clearanceRuleset.createState().state
    const before = clearanceRuleset.serializePublicState(empty)
    expect(before.levels).toHaveLength(6)
    expect(before.readyToComplete).toBe(false)
    const text = JSON.stringify(before)
    for (const level of LEVELS) {
      for (const prompt of level.predictions) expect(text).not.toContain(prompt.explanation)
      for (const event of level.day.filter((item) => item.kind !== 'work'))
        expect(text).not.toContain(event.story)
    }
    const after = clearanceRuleset.serializePublicState(play(empty, 'the-matrix'))
    const [played, ...rest] = after.levels
    expect(played).toMatchObject({ submitted: true, result: { score: 100, stars: 3 } })
    expect(played.result.events).toHaveLength(findLevel('the-matrix').day.length)
    expect(rest.every((level) => !level.submitted && !('result' in level))).toBe(true)
    expect(after).toMatchObject({ submittedCount: 1, readyToComplete: true })
  })

  it('completes after one level and sums scores up to 600', () => {
    const empty = clearanceRuleset.createState().state
    expect(clearanceRuleset.canComplete(empty)).toBe(false)
    let state = empty
    for (const levelId of Object.keys(SOLUTIONS)) state = play(state, levelId)
    expect(clearanceRuleset.canComplete(state)).toBe(true)
    const summary = clearanceRuleset.summarize(state)
    const expected = Object.values(SOLUTIONS).reduce((total, item) => total + item.score, 0)
    expect(summary.score).toBe(expected)
    expect(summary.score).toBeLessThanOrEqual(clearanceRuleset.maxScore)
    expect(clearanceRuleset.maxScore).toBe(600)
    expect(summary.score).toBe(600)
    expect(summary.topicOutcomes.map((item) => item.topic)).toEqual(clearanceRuleset.topicTags)
    const partial = clearanceRuleset.summarize(play(empty, 'the-matrix'))
    expect(partial.score).toBe(100)
    expect(partial.topicOutcomes.every((item) => !item.achieved)).toBe(true)
  })

  it('reaches the advertised maximum, so the perfect case badge can be earned', () => {
    let state = clearanceRuleset.createState().state
    for (const levelId of Object.keys(SOLUTIONS)) state = play(state, levelId)
    const { score, topicOutcomes } = clearanceRuleset.summarize(state)
    expect(score).toBe(clearanceRuleset.maxScore)
    const earned = deriveAchievements([
      {
        gameId: 'clearance-tower',
        rulesetVersion: clearanceRuleset.rulesetVersion,
        score,
        maxScore: clearanceRuleset.maxScore,
        topicOutcomes,
        completedAt: new Date('2026-11-01T00:00:00Z'),
      },
    ]).map((item) => item.key)
    expect(earned).toContain('perfect-case')
    expect(earned).toContain('topic-expert')
  })

  it('does not achieve a topic with a leak, whatever the score', () => {
    expect(levelMastered({ score: 90, meters: { leaks: 1 } }, SCORING_RULES)).toBe(false)
    expect(levelMastered({ score: 75, meters: { leaks: 0 } }, SCORING_RULES)).toBe(true)
    expect(levelMastered({ score: 74, meters: { leaks: 0 } }, SCORING_RULES)).toBe(false)
    expect(levelMastered(undefined, SCORING_RULES)).toBe(false)
  })

  function climbWithUnchangedGift(ruleset) {
    const send = (state, levelId, policy) =>
      ruleset.applyAction(state, {
        type: 'submit-level',
        payload: ruleset.validateAction('submit-level', submission(levelId, { policy })),
      })
    const solved = send(ruleset.createState().state, 'the-matrix', SOLUTIONS['the-matrix'].policy)
    return ruleset.summarize(send(solved, 'the-gift', findLevel('the-gift').startPolicy))
  }

  it('leaves the discretionary topic unachieved when the gift leaks', () => {
    const summary = climbWithUnchangedGift(clearanceRuleset)
    expect(summary.score).toBe(160)
    expect(summary.topicOutcomes[0]).toEqual({
      topic: 'discretionary-access-control',
      achieved: false,
      feedbackCode: 'DAC_REVIEW',
    })
  })

  it.each([
    ['clear-2', clearanceLegacyRuleset],
    ['clear-3', clearanceHintsRuleset],
  ])('keeps %s scoring and topic rules for saved climbs', (version, ruleset) => {
    expect(ruleset).toMatchObject({ rulesetVersion: version, current: false, maxScore: 600 })
    const summary = climbWithUnchangedGift(ruleset)
    expect(summary.score).toBe(180)
    expect(summary.topicOutcomes[0]).toMatchObject({
      achieved: true,
      feedbackCode: 'DAC_SECURED',
    })
    expect(LEGACY_SCORING_RULES.leakBlocksTopic).toBe(false)
  })

  it('registers every version with clear-4 as the only current one', () => {
    const registry = createProductionAttemptRegistry()
    expect(registry.getCurrent('clearance-tower').rulesetVersion).toBe('clear-4')
    for (const version of ['clear-2', 'clear-3'])
      expect(registry.get('clearance-tower', version)).toMatchObject({ current: false })
  })
})
