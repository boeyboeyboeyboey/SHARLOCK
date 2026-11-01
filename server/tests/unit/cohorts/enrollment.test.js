import { describe, expect, it } from 'vitest'
import { createConnection } from 'mongoose'
import {
  CohortError,
  createEnrollmentCode,
  enrollmentCodeExpiry,
  hashEnrollmentCode,
  parseCodeRevisionInput,
  parseDecisionInput,
  parseEnrollmentCode,
  parseEnrollmentInput,
  parseMemberListQuery,
  parseOnboardingInput,
} from '../../../src/modules/cohorts/policy.js'
import { enrollmentCodeModel } from '../../../src/modules/cohorts/enrollment-code-model.js'

describe('cohort enrollment policy', () => {
  it('generates a grouped code from the allowed alphabet and hashes normalized input', () => {
    const { code, formatted } = createEnrollmentCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/)
    expect(formatted).toBe(code.match(/.{4}/g).join('-'))
    expect(parseEnrollmentCode(` ${formatted.toLowerCase()} `)).toBe(code)
    expect(hashEnrollmentCode(` ${formatted.toLowerCase()} `)).toBe(hashEnrollmentCode(code))
  })

  it.each(['', '1234', 'O234-5678-9ABC-DEFG', 'ABCD-1234-EFGH-IJKL', 123, null, 'A'.repeat(65)])(
    'rejects malformed enrollment code %s',
    (code) => expect(() => hashEnrollmentCode(code)).toThrow(CohortError),
  )

  it('accepts only the exact body for manual or captured invitation joins', () => {
    const hash = hashEnrollmentCode('ABCD-EFGH-JKLM-NPQR')
    expect(parseEnrollmentInput({ code: 'abcd efgh-jklm npqr' })).toEqual({ codeHash: hash })
    expect(parseEnrollmentInput({ invitation: true }, { invitationHash: hash })).toEqual({
      codeHash: hash,
    })
    expect(() => parseEnrollmentInput({ code: 'ABCD-EFGH-JKLM-NPQR', userId: 'x' })).toThrow(
      CohortError,
    )
    expect(() => parseEnrollmentInput({ invitation: true })).toThrow(CohortError)
    expect(() => parseEnrollmentInput({ invitation: false }, { invitationHash: hash })).toThrow(
      CohortError,
    )
  })

  it('validates onboarding, decision transitions and safe revisions', () => {
    expect(parseOnboardingInput({ completed: true })).toEqual({ completed: true })
    expect(parseDecisionInput({ status: 'active', expectedRevision: 0 })).toEqual({
      status: 'active',
      expectedRevision: 0,
    })
    expect(parseDecisionInput({ status: 'removed', expectedRevision: 12 })).toEqual({
      status: 'removed',
      expectedRevision: 12,
    })
    expect(parseCodeRevisionInput({ expectedRevision: 0 })).toEqual({ expectedRevision: 0 })
    for (const [parser, input] of [
      [parseOnboardingInput, { completed: false }],
      [parseOnboardingInput, { completed: true, role: 'admin' }],
      [parseDecisionInput, { status: 'pending', expectedRevision: 0 }],
      [parseDecisionInput, { status: 'active', expectedRevision: -1 }],
      [parseCodeRevisionInput, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }],
      [parseCodeRevisionInput, { expectedRevision: 0, extra: 1 }],
    ]) {
      expect(() => parser(input)).toThrow(CohortError)
    }
  })

  it('parses member status filters with bounded pagination', () => {
    expect(parseMemberListQuery({})).toEqual({ status: 'pending', page: 1, limit: 20, skip: 0 })
    expect(parseMemberListQuery({ status: 'active', page: '3', limit: '10' })).toEqual({
      status: 'active',
      page: 3,
      limit: 10,
      skip: 20,
    })
    expect(() => parseMemberListQuery({ status: 'declined' })).toThrow(CohortError)
    expect(() => parseMemberListQuery({ limit: '51' })).toThrow(CohortError)
  })

  it('sets a seven-day code expiry and a strict unique cohort index', () => {
    const start = Date.UTC(2026, 9, 15)
    expect(enrollmentCodeExpiry(() => start).getTime() - start).toBe(7 * 24 * 60 * 60 * 1000)
    const database = createConnection()
    const model = enrollmentCodeModel(database)
    expect(model.collection.collectionName).toBe('enrollment_codes')
    expect(model.schema.options).toMatchObject({
      strict: 'throw',
      versionKey: false,
      autoIndex: false,
      autoCreate: false,
    })
    expect(model.schema.indexes()).toContainEqual([{ cohortId: 1 }, { unique: true }])
    expect(model.schema.indexes()).toContainEqual([{ codeHash: 1 }, { unique: true }])
    database.destroy()
  })
})
