import { describe, expect, it } from 'vitest'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'
import { socialEngineeringRuleset } from '../../../src/modules/games/social-engineering-simulator/ruleset.js'
import { socialEngineeringShiftRuleset as ruleset } from '../../../src/modules/games/social-engineering-simulator/shiftRuleset.js'

const call = {
  genuine: false,
  callbackViable: true,
  decision: 'refuse',
  leaked: false,
  verified: true,
  messagesUsed: 2,
  hints: 0,
}

describe('help desk shift ruleset', () => {
  it('is the current ruleset while the single-call version stays registered', () => {
    const registry = createAttemptRegistry([socialEngineeringRuleset, ruleset])
    expect(registry.getCurrent('social-engineering-simulator').rulesetVersion).toBe('2026-10-31')
    expect(registry.get('social-engineering-simulator', '2026-10-27')).toBeDefined()
    expect(ruleset).toMatchObject({ serverRecorded: true, competitive: false, maxScore: 430 })
  })

  it('recomputes a perfect shift from stored inputs', () => {
    const summary = ruleset.summarize({ calls: [call, call, call, call] })
    expect(summary.score).toBe(430)
    expect(summary.feedback.outcome).toBe('resisted')
    expect(summary.topicOutcomes.every((item) => item.achieved)).toBe(true)
  })

  it('reports strikes and missed checks', () => {
    const slip = { ...call, decision: 'grant', verified: false }
    const summary = ruleset.summarize({ calls: [slip, slip] })
    expect(summary.feedback.outcome).toBe('partial')
    expect(summary.topicOutcomes.map((item) => item.achieved)).toEqual([false, false])
    expect(ruleset.serializePublicState({ calls: [slip, slip] })).toMatchObject({
      strikes: 2,
      callsPlayed: 2,
    })
  })

  it('stores per-call inputs with a strict schema', () => {
    const callSchema = ruleset.stateSchema.path('calls').schema
    expect(callSchema.options.strict).toBe('throw')
    expect(callSchema.path('decision').enumValues).toEqual([
      'grant',
      'callback',
      'refuse',
      'escalate',
      'none',
    ])
  })
})
