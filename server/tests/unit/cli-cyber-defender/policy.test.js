import { describe, expect, it } from 'vitest'
import {
  CliError,
  INCIDENT_COUNT,
  MAX_COMMANDS_PER_RUN,
  MAX_LOOKUPS_PER_INCIDENT,
  MAX_SCORE,
  RULESET_VERSION,
  SHIFT_SECONDS,
  TOTAL_STEPS,
  parseCommandBody,
  parseCompleteBody,
  parseRunId,
  parseStart,
} from '../../../src/modules/games/cli-cyber-defender/policy.js'

function codeOf(fn) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(CliError)
    return { code: error.code, status: error.status, fieldErrors: error.fieldErrors }
  }
  return null
}

describe('cli defender request validation', () => {
  it('derives the documented maximum score', () => {
    // 8 incidents plus 2 second steps: 100 + 200 + 8 x 300
    expect(TOTAL_STEPS).toBe(10)
    expect(MAX_SCORE).toBe(2700)
    expect(RULESET_VERSION).toBe('cli-3')
  })

  it('keeps the shift length, lookup allowance and command cap consistent', () => {
    expect(SHIFT_SECONDS).toBe(INCIDENT_COUNT * 25)
    expect(MAX_LOOKUPS_PER_INCIDENT).toBe(6)
    // every lookup, step and mistake of a long run still fits under the cap
    expect(MAX_COMMANDS_PER_RUN).toBe(120)
    expect(MAX_COMMANDS_PER_RUN).toBeGreaterThanOrEqual(
      INCIDENT_COUNT * MAX_LOOKUPS_PER_INCIDENT + TOTAL_STEPS,
    )
  })

  it('accepts only timed or practice starts with no extra fields', () => {
    const context = { kind: 'personal' }
    expect(parseStart({ mode: 'timed', context })).toEqual({ mode: 'timed', context })
    expect(parseStart({ mode: 'practice', context })).toEqual({ mode: 'practice', context })
    expect(codeOf(() => parseStart({ mode: 'easy', context })).fieldErrors).toHaveProperty('mode')
    expect(codeOf(() => parseStart({ mode: 'timed' })).fieldErrors).toHaveProperty('context')
    expect(
      codeOf(() => parseStart({ mode: 'timed', context, score: 2100 })).fieldErrors,
    ).toHaveProperty('score')
    expect(codeOf(() => parseStart(null)).code).toBe('CLI_INVALID_BODY')
    expect(codeOf(() => parseStart(['timed'])).code).toBe('CLI_INVALID_BODY')
  })

  it('validates command bodies', () => {
    const body = { actionId: 'action-0001', incidentId: 'incident-03', command: 'block ip 1.2.3.4' }
    expect(parseCommandBody(body)).toEqual(body)
    const cases = [
      [{ ...body, actionId: 'short' }, 'actionId'],
      [{ ...body, incidentId: 'incident-09' }, 'incidentId'],
      [{ ...body, incidentId: { $ne: null } }, 'incidentId'],
      [{ ...body, command: '' }, 'command'],
      [{ ...body, command: 'x'.repeat(121) }, 'command'],
      [{ ...body, command: ['block ip 1.2.3.4'] }, 'command'],
      [{ ...body, points: 300 }, 'points'],
    ]
    for (const [input, field] of cases) {
      const failure = codeOf(() => parseCommandBody(input))
      expect(failure).toMatchObject({ code: 'CLI_INVALID_BODY', status: 400 })
      expect(failure.fieldErrors).toHaveProperty(field)
    }
  })

  it('validates completion bodies and run ids', () => {
    expect(parseCompleteBody({ actionId: 'action-0001' })).toEqual({ actionId: 'action-0001' })
    expect(codeOf(() => parseCompleteBody({ actionId: 'action-0001', score: 1 })).code).toBe(
      'CLI_INVALID_BODY',
    )
    expect(parseRunId('11111111-1111-4111-8111-111111111111')).toBeTruthy()
    expect(codeOf(() => parseRunId('../etc/passwd'))).toMatchObject({
      code: 'CLI_RUN_NOT_FOUND',
      status: 404,
    })
  })
})
