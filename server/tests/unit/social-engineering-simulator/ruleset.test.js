import { describe, expect, it } from 'vitest'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'
import { socialEngineeringRuleset as ruleset } from '../../../src/modules/games/social-engineering-simulator/ruleset.js'
import { SCENARIOS } from '../../../src/modules/games/social-engineering-simulator/scenarios.js'

const attack = SCENARIOS.find((item) => !item.legitimate).id
const legit = SCENARIOS.find((item) => item.legitimate).id
const base = {
  scenarioId: attack,
  decision: 'refuse',
  leaked: false,
  turnsUsed: 3,
  verifierRequired: true,
  verifierContacted: true,
}

describe('social-engineering ruleset', () => {
  it('registers as a server-recorded, non-competitive game', () => {
    const registry = createAttemptRegistry([ruleset])
    const entry = registry.get('social-engineering-simulator', ruleset.rulesetVersion)
    // the single-call ruleset is kept for saved results; the shift ruleset is current
    expect(registry.getCurrent('social-engineering-simulator')).toBeUndefined()
    expect(entry.serverRecorded).toBe(true)
    expect(entry.competitive).toBe(false)
    expect(entry.maxScore).toBe(100)
  })

  it('scores a resisted attack at 100', () => {
    const summary = ruleset.summarize(base)
    expect(summary.score).toBe(100)
    expect(summary.feedback.outcome).toBe('resisted')
    expect(summary.topicOutcomes.every((item) => item.achieved)).toBe(true)
  })

  it('scores a partial attack when nobody was contacted', () => {
    const summary = ruleset.summarize({ ...base, verifierContacted: false })
    expect(summary.score).toBe(75)
    expect(summary.feedback.outcome).toBe('partial')
    expect(summary.topicOutcomes.map((item) => item.achieved)).toEqual([true, false])
  })

  it('scores a compromised attack with only the efficiency points', () => {
    const summary = ruleset.summarize({ ...base, leaked: true, decision: 'share-code' })
    expect(summary.score).toBe(15)
    expect(summary.feedback.outcome).toBe('compromised')
    expect(summary.topicOutcomes.every((item) => !item.achieved)).toBe(true)
  })

  it('scores a genuine request: check then share is full marks', () => {
    expect(ruleset.summarize({ ...base, scenarioId: legit, decision: 'share-code' }).score).toBe(
      100,
    )
    const refused = ruleset.summarize({ ...base, scenarioId: legit, decision: 'refuse' })
    expect(refused.score).toBe(15)
    expect(refused.feedback.outcome).toBe('partial')
    const unchecked = ruleset.summarize({
      ...base,
      scenarioId: legit,
      decision: 'share-code',
      verifierContacted: false,
    })
    expect(unchecked.feedback.outcome).toBe('compromised')
  })

  it('takes legitimacy and the budget from the scenario, not the stored state', () => {
    const over = ruleset.summarize({ ...base, turnsUsed: 16 })
    expect(over.score).toBe(85)
    const forged = ruleset.stateSchema.path('legitimate')
    expect(forged).toBeUndefined()
  })

  it('rejects unknown scenarios, decisions and extra fields in the state schema', () => {
    expect(ruleset.stateSchema.options.strict).toBe('throw')
    expect(ruleset.stateSchema.path('scenarioId').enumValues).toContain(attack)
    expect(ruleset.stateSchema.path('decision').enumValues).toEqual([
      'refuse',
      'verify-independently',
      'share-code',
    ])
  })

  it('exposes a safe public state', () => {
    expect(Object.keys(ruleset.serializePublicState(base)).sort()).toEqual([
      'outcome',
      'score',
      'turnsUsed',
    ])
  })
})
