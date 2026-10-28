import { describe, expect, it } from 'vitest'
import {
  evaluatePayload,
  evaluateLogin,
} from '../../../src/modules/games/sql-injection-arcade/parser.js'
import { sqlLegacyRuleset } from '../../../src/modules/games/sql-injection-arcade/legacy.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'

describe('bounded SQL teaching parser', () => {
  it.each([
    ["' OR 1=1 --", 'BYPASS'],
    ["' or 'yes' = 'yes' --", 'BYPASS'],
    ["guest'\tOr\t7 = 7\t--", 'BYPASS'],
    ["' OR 1=2 --", 'FALSE_EQUALITY'],
    ["' OR 'OR 1=1'='no' --", 'FALSE_EQUALITY'],
    ['OR 1=1 --', 'NO_BREAKOUT'],
    ["' OR 1=1; DROP TABLE users; --", 'UNSUPPORTED'],
    ["' OR 1=1 -- DROP TABLE users", 'UNSUPPORTED'],
    ["' OR 'broken=1 --", 'UNSUPPORTED'],
    ["' OR '1'=1 --", 'UNSUPPORTED'],
    ["' OR 1=1", 'UNSUPPORTED'],
    ["' OR " + '1='.repeat(40), 'UNSUPPORTED'],
    ['a'.repeat(121), 'UNSUPPORTED'],
  ])('evaluates %j as %s', (input, expected) => expect(evaluatePayload(input)).toBe(expected))
  it('handles either fictional field without authenticating', () => {
    expect(evaluateLogin('guest', "' OR 1=1 --")).toBe('BYPASS')
    expect(evaluateLogin("' OR 1=1 --", "malformed'")).toBe('UNSUPPORTED')
  })
})

describe('SQL rules and private state', () => {
  it('registers strict bounded state and awards 80 plus 20 only on the server', () => {
    const registry = createProductionAttemptRegistry()
    expect(registry.get(sqlLegacyRuleset.id, 'sql-1').current).toBe(false)
    expect(registry.getCurrent(sqlLegacyRuleset.id).rulesetVersion).toBe('sql-2')
    let { state, mode, deadlineAt } = sqlLegacyRuleset.createState()
    expect(mode).toBe('practice')
    expect(deadlineAt).toBeNull()
    const payload = sqlLegacyRuleset.validateAction('test-payload', {
      username: "' OR 1=1 --",
      password: 'never-save-this',
    })
    state = sqlLegacyRuleset.applyAction(state, { type: 'test-payload', payload })
    expect(sqlLegacyRuleset.summarize(state).score).toBe(80)
    expect(JSON.stringify(state)).not.toContain('never-save-this')
    expect(sqlLegacyRuleset.serializePublicState(state)).not.toHaveProperty('repairOptionId')
    expect(sqlLegacyRuleset.canComplete(state)).toBe(false)
    state = sqlLegacyRuleset.applyAction(state, {
      type: 'select-repair',
      payload: { optionId: 'bind' },
    })
    expect(sqlLegacyRuleset.canComplete(state)).toBe(true)
    expect(sqlLegacyRuleset.summarize(state).score).toBe(100)
    expect(() =>
      sqlLegacyRuleset.applyAction(state, {
        type: 'select-repair',
        payload: { optionId: 'strip' },
      }),
    ).toThrow()
  })
  it('counts unsupported tests, enforces phases and offers repair after exhaustion', () => {
    let { state } = sqlLegacyRuleset.createState()
    const repair = { type: 'select-repair', payload: { optionId: 'strip' } }
    expect(() => sqlLegacyRuleset.applyAction(state, repair)).toThrow()
    for (let index = 0; index < 5; index++)
      state = sqlLegacyRuleset.applyAction(state, {
        type: 'test-payload',
        payload: { username: "' invalid", password: '' },
      })
    expect(state.evaluations).toEqual(Array(5).fill('UNSUPPORTED'))
    expect(() =>
      sqlLegacyRuleset.applyAction(state, {
        type: 'test-payload',
        payload: { username: '', password: '' },
      }),
    ).toThrow()
    state = sqlLegacyRuleset.applyAction(state, repair)
    expect(sqlLegacyRuleset.summarize(state).score).toBe(0)
  })
  it('rejects extra fields, oversized inputs and unknown repairs', () => {
    expect(() =>
      sqlLegacyRuleset.validateAction('test-payload', { username: '', password: '', score: 100 }),
    ).toThrow()
    expect(() =>
      sqlLegacyRuleset.validateAction('test-payload', { username: 'x'.repeat(121), password: '' }),
    ).toThrow()
    expect(() =>
      sqlLegacyRuleset.validateAction('select-repair', { optionId: 'unknown' }),
    ).toThrow()
  })
})
