import { describe, expect, it } from 'vitest'
import {
  parseVerdict,
  PhishingError,
} from '../../../src/modules/games/phishing-post-mortem/policy.js'

const valid = {
  selectedEmailId: 'a11',
  evidenceIds: ['ev-lookalike-domain', 'ev-click-then-credentials'],
}
const code = (body) => {
  try {
    parseVerdict(body)
    return 'accepted'
  } catch (error) {
    return error instanceof PhishingError ? error.code : 'unexpected'
  }
}

describe('phishing verdict validation', () => {
  it('accepts exactly the supported fields', () => {
    expect(parseVerdict(valid)).toEqual(valid)
  })

  it.each([
    ['unknown field', { ...valid, score: 100 }],
    ['a client supplied case id', { ...valid, caseId: 'case-01' }],
    ['a client supplied dataset version', { ...valid, datasetVersion: '2026-09-21' }],
    ['a client supplied action id', { ...valid, actionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }],
    ['one evidence id', { ...valid, evidenceIds: ['ev-lookalike-domain'] }],
    ['three evidence ids', { ...valid, evidenceIds: [...valid.evidenceIds, 'ev-urgent-language'] }],
    ['duplicate evidence ids', { ...valid, evidenceIds: ['ev-x', 'ev-x'] }],
    ['evidence that is not an array', { ...valid, evidenceIds: 'ev-lookalike-domain' }],
    ['a traversal style email id', { ...valid, selectedEmailId: '../answers/case-01' }],
    ['a non-object body', null],
    ['an array body', []],
  ])('rejects %s', (_label, body) => {
    expect(code(body)).toBe('PHISH_INVALID_REQUEST')
  })

  it('reports the offending field without leaking internals', () => {
    try {
      parseVerdict({ ...valid, evidenceIds: [] })
    } catch (error) {
      expect(error.status).toBe(400)
      expect(error.fieldErrors).toHaveProperty('evidenceIds')
      expect(error.message).not.toMatch(/case-0|patientZero/)
    }
  })

  it('rejects an own __proto__ field from parsed JSON', () => {
    const body = JSON.parse(
      '{"selectedEmailId":"a11","evidenceIds":["ev-lookalike-domain","ev-click-then-credentials"],"__proto__":"unsupported"}',
    )
    let error
    try {
      parseVerdict(body)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(PhishingError)
    expect(error.code).toBe('PHISH_INVALID_REQUEST')
    expect(Object.hasOwn(error.fieldErrors, '__proto__')).toBe(true)
    expect(error.fieldErrors['__proto__']).toBe('unsupported field')
  })
})
