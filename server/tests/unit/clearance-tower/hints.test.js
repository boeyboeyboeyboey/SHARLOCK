import { describe, expect, it } from 'vitest'
import {
  HINT_COST,
  HINTS,
  MAX_HINTS,
  hintTexts,
} from '../../../src/modules/games/clearance-tower/hints.js'
import { LEVELS, findLevel } from '../../../src/modules/games/clearance-tower/levels.js'
import { clearanceLegacyRuleset } from '../../../src/modules/games/clearance-tower/legacy.js'
import { RULESET_VERSION } from '../../../src/modules/games/clearance-tower/policy.js'
import { clearanceRuleset } from '../../../src/modules/games/clearance-tower/ruleset.js'
import { hintPenaltyFor, scoreLevel } from '../../../src/modules/games/clearance-tower/scoring.js'
import { simulateDay } from '../../../src/modules/games/clearance-tower/simulate.js'
import { predictionList, SOLUTIONS } from './solutions.js'

function play(levelId, hintsUsed) {
  const { policy, predictions } = SOLUTIONS[levelId]
  const level = findLevel(levelId)
  return scoreLevel(level, policy, predictions, simulateDay(level, policy), hintsUsed)
}

function hintAction(levelId) {
  return {
    type: 'request-hint',
    payload: clearanceRuleset.validateAction('request-hint', { levelId }),
  }
}

describe('clearance tower hints', () => {
  it('has a nudge and a concept hint for every level', () => {
    expect(MAX_HINTS).toBe(2)
    for (const level of LEVELS) {
      expect(HINTS[level.id], level.id).toHaveLength(MAX_HINTS)
      for (const text of HINTS[level.id]) expect(text.length).toBeGreaterThan(20)
    }
  })

  it('reveals only the tiers taken so far', () => {
    expect(hintTexts('the-matrix', 0)).toEqual([])
    expect(hintTexts('the-matrix', 1)).toEqual([HINTS['the-matrix'][0]])
    expect(hintTexts('the-matrix', 2)).toEqual(HINTS['the-matrix'])
  })

  it('takes ten points per hint off the level score', () => {
    expect(HINT_COST).toBe(10)
    const clean = play('the-matrix', 0)
    expect(play('the-matrix', 1)).toMatchObject({
      score: clean.score - 10,
      hintsUsed: 1,
      hintPenalty: 10,
    })
    expect(play('the-matrix', 2)).toMatchObject({ score: clean.score - 20, hintPenalty: 20 })
  })

  it('never takes a level below zero', () => {
    expect(hintPenaltyFor(5, 2)).toBe(5)
    expect(hintPenaltyFor(0, 2)).toBe(0)
  })

  it('keeps the maximum score unchanged', () => {
    expect(clearanceRuleset.maxScore).toBe(600)
    expect(RULESET_VERSION).toBe('clear-4')
  })

  it('allows two hints then refuses a third', () => {
    let state = clearanceRuleset.createState().state
    state = clearanceRuleset.applyAction(state, hintAction('the-gift'))
    state = clearanceRuleset.applyAction(state, hintAction('the-gift'))
    expect(state.hints).toEqual([{ levelId: 'the-gift', count: 2 }])
    expect(() => clearanceRuleset.applyAction(state, hintAction('the-gift'))).toThrow(
      expect.objectContaining({ code: 'CLEAR_HINTS_EXHAUSTED', status: 409 }),
    )
  })

  it('rejects a hint with extra fields or an unknown level', () => {
    expect(() =>
      clearanceRuleset.validateAction('request-hint', { levelId: 'the-gift', tier: 2 }),
    ).toThrow(expect.objectContaining({ code: 'CLEAR_INVALID_ACTION' }))
    expect(() => clearanceRuleset.validateAction('request-hint', { levelId: 'nope' })).toThrow(
      expect.objectContaining({ code: 'CLEAR_INVALID_ACTION' }),
    )
  })

  it('refuses a hint once the level has run and deducts the cost in the public state', () => {
    const { policy, predictions } = SOLUTIONS['the-matrix']
    let state = clearanceRuleset.applyAction(
      clearanceRuleset.createState().state,
      hintAction('the-matrix'),
    )
    const submit = {
      type: 'submit-level',
      payload: clearanceRuleset.validateAction('submit-level', {
        levelId: 'the-matrix',
        policy,
        predictions: predictionList(predictions),
      }),
    }
    state = clearanceRuleset.applyAction(state, submit)
    expect(() => clearanceRuleset.applyAction(state, hintAction('the-matrix'))).toThrow(
      expect.objectContaining({ code: 'CLEAR_LEVEL_SUBMITTED' }),
    )
    const level = clearanceRuleset.serializePublicState(state).levels[0]
    expect(level.hints).toMatchObject({ used: 1, max: 2, cost: 10 })
    expect(level.result).toMatchObject({ score: 90, hintsUsed: 1, hintPenalty: 10 })
    expect(clearanceRuleset.summarize(state).score).toBe(90)
  })

  it('keeps clear-2 readable without hints', () => {
    expect(clearanceLegacyRuleset).toMatchObject({ rulesetVersion: 'clear-2', current: false })
    expect(() =>
      clearanceLegacyRuleset.validateAction('request-hint', { levelId: 'the-gift' }),
    ).toThrow(expect.objectContaining({ code: 'CLEAR_INVALID_ACTION' }))
    const level = clearanceLegacyRuleset.serializePublicState({ levels: [] }).levels[0]
    expect(level.hints).toBeUndefined()
  })
})
