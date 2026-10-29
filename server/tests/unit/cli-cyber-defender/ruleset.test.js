import { describe, expect, it } from 'vitest'
import {
  cliRuleset,
  scoreIncidents,
} from '../../../src/modules/games/cli-cyber-defender/ruleset.js'
import { cliLegacyRuleset } from '../../../src/modules/games/cli-cyber-defender/legacy.js'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'
import { SCENARIOS } from '../../../src/modules/games/cli-cyber-defender/scenarios.js'

const ids = SCENARIOS.slice(0, 8).map((scenario) => scenario.id)
const trailFor = (outcome) => (outcome === 'correct' ? ['ok'] : outcome === 'wrong' ? ['bad'] : [])
const state = (outcomes, mode = 'timed') => ({
  mode,
  incidents: ids.map((scenarioId, index) => ({
    scenarioId,
    outcome: outcomes[index],
    hintUsed: false,
    trail: trailFor(outcomes[index]),
  })),
})

describe('cli ruleset', () => {
  it('registers as a server-recorded competitive game', () => {
    const registry = createAttemptRegistry([cliLegacyRuleset, cliRuleset])
    expect(registry.getCurrent('cli-cyber-defender')).toMatchObject({
      rulesetVersion: 'cli-3',
      serverRecorded: true,
      competitive: true,
      maxScore: 2700,
    })
  })

  it('keeps cli-2 registered but not current so old results still read', () => {
    const registry = createAttemptRegistry([cliLegacyRuleset, cliRuleset])
    expect(registry.get('cli-cyber-defender', 'cli-2')).toMatchObject({
      current: false,
      maxScore: 2100,
    })
    const old = {
      mode: 'timed',
      incidents: [
        'ssh-brute-force',
        'web-scanner',
        'password-spray',
        'sqli-probe',
        'port-scan',
        'smtp-relay-abuse',
        'impossible-travel',
        'usb-autorun',
      ].map((scenarioId) => ({ scenarioId, outcome: 'correct', hintUsed: false })),
    }
    expect(cliLegacyRuleset.summarize(old).score).toBe(2100)
    expect(cliLegacyRuleset.serializePublicState(old)).toMatchObject({ correct: 8, score: 2100 })
  })

  it('uses a strict state schema with no loose fields', () => {
    const schema = cliRuleset.stateSchema
    expect(schema.options.strict).toBe('throw')
    const incident = schema.path('incidents').schema
    expect(incident.options.strict).toBe('throw')
    expect(Object.values(incident.paths).map((path) => path.instance)).not.toContain('Mixed')
    expect(Object.keys(incident.paths).sort()).toEqual(
      ['hintUsed', 'outcome', 'scenarioId', 'trail'].sort(),
    )
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

  it('scores each ordered step of a two-step incident and resets on a mistake', () => {
    const incidents = [
      { scenarioId: ids[0], outcome: 'correct', hintUsed: false, trail: ['ok'] },
      // the mistake resets the streak, then both steps score 100 and 200
      { scenarioId: ids[1], outcome: 'wrong', hintUsed: false, trail: ['bad', 'ok', 'ok'] },
      // a partial incident whose window ended still keeps its first step, then resets the streak
      { scenarioId: ids[2], outcome: 'missed', hintUsed: false, trail: ['ok'] },
      { scenarioId: ids[3], outcome: 'correct', hintUsed: false, trail: ['ok'] },
    ]
    expect(scoreIncidents(incidents)).toBe(100 + 100 + 200 + 300 + 100)
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
