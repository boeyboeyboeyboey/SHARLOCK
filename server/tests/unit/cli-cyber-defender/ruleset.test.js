import { describe, expect, it } from 'vitest'
import {
  cliRuleset,
  scoreIncidents,
} from '../../../src/modules/games/cli-cyber-defender/ruleset.js'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'
import { SCENARIOS } from '../../../src/modules/games/cli-cyber-defender/scenarios.js'

const ids = SCENARIOS.slice(0, 8).map((scenario) => scenario.id)
const state = (outcomes, mode = 'timed') => ({
  mode,
  incidents: ids.map((scenarioId, index) => ({
    scenarioId,
    outcome: outcomes[index],
    hintUsed: false,
  })),
})

describe('cli ruleset', () => {
  it('registers as a server-recorded competitive game', () => {
    const registry = createAttemptRegistry([cliRuleset])
    expect(registry.getCurrent('cli-cyber-defender')).toMatchObject({
      serverRecorded: true,
      competitive: true,
      maxScore: 2100,
    })
  })

  it('recomputes the score from outcomes with the streak rule', () => {
    expect(cliRuleset.summarize(state(Array(8).fill('correct'))).score).toBe(2100)
    expect(
      scoreIncidents(
        state(['correct', 'correct', 'wrong', 'correct', 'missed', 'correct', 'correct', 'correct'])
          .incidents,
      ),
    ).toBe(100 + 200 + 100 + 100 + 200 + 300)
    expect(cliRuleset.summarize(state(Array(8).fill('skipped'), 'practice')).score).toBe(0)
  })

  it('reports topic outcomes and a safe public summary', () => {
    const summary = cliRuleset.summarize(state(Array(8).fill('correct')))
    expect(summary.topicOutcomes.every((item) => item.achieved)).toBe(true)
    expect(summary.topicOutcomes[0].feedbackCode).toMatch(/^CLI_[A-Z_]+_ACHIEVED$/)
    expect(cliRuleset.serializePublicState(state(Array(8).fill('wrong')))).toEqual({
      mode: 'timed',
      correct: 0,
      incidentCount: 8,
      hintsUsed: 0,
      score: 0,
    })
  })
})
