import { describe, expect, it } from 'vitest'
import {
  AdminError,
  assertEmptyAdminBody,
  assertEmptyAdminQuery,
  parseAdminListQuery,
  parseAccountDeleteInput,
  parseAccountStatusInput,
  parseAdminObjectId,
  parseAssignmentsInput,
  parseCohortInput,
  parseCohortUpdateInput,
  parseInstitutionInput,
  parseInstitutionUpdateInput,
  parseInstructorInput,
} from '../../../src/modules/admin/policy.js'

const firstId = '0123456789abcdef01234567'
const secondId = 'abcdef0123456789abcdef01'

describe('admin workspace policy', () => {
  it('applies bounded list defaults and accepts only defined pagination and cohort filter fields', () => {
    expect(parseAdminListQuery({})).toEqual({ page: 1, limit: 20 })
    expect(parseAdminListQuery({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 })
    expect(parseAdminListQuery({ institutionId: firstId }, { institution: true })).toEqual({
      page: 1,
      limit: 20,
      institutionId: firstId,
    })
  })

  it('parses bounded account-list filters and exact status-transition inputs', () => {
    expect(
      parseAdminListQuery({ role: 'student', accountStatus: 'disabled' }, { users: true }),
    ).toEqual({
      page: 1,
      limit: 20,
      role: 'student',
      accountStatus: 'disabled',
    })
    expect(parseAccountStatusInput({ accountStatus: 'disabled', expectedRevision: 3 })).toEqual({
      accountStatus: 'disabled',
      expectedRevision: 3,
    })
    expect(() => parseAdminListQuery({ role: 'admin' }, { users: true })).toThrow(AdminError)
    expect(() => parseAdminListQuery({ accountStatus: ['active'] }, { users: true })).toThrow(
      AdminError,
    )
    expect(() => parseAdminListQuery({ role: 'student' })).toThrow(AdminError)
    expect(() =>
      parseAccountStatusInput({ accountStatus: 'active', expectedRevision: 1, role: 'student' }),
    ).toThrow(AdminError)
    expect(() =>
      parseAccountStatusInput({ accountStatus: 'pending', expectedRevision: 1 }),
    ).toThrow(AdminError)
  })

  it.each([
    ['unknown query key', { role: 'admin' }],
    ['repeated page', { page: ['1', '2'] }],
    ['object page', { page: { value: '1' } }],
    ['prototype key', JSON.parse('{"__proto__":"x"}')],
    ['operator key', { $where: 'true' }],
    ['invalid page', { page: '0' }],
    ['oversized page', { page: '10001' }],
    ['invalid cohort identifier', { institutionId: 'bad' }],
  ])('rejects %s', (_label, query) => {
    expect(() => parseAdminListQuery(query, { institution: true })).toThrow(AdminError)
  })

  it('parses institution names and canonical lowercase slugs within model bounds', () => {
    expect(parseInstitutionInput({ name: '  North Campus  ', slug: '  SMU-NORTH ' })).toEqual({
      name: 'North Campus',
      slug: 'smu-north',
    })
    expect(() => parseInstitutionInput({ name: '', slug: 'x' })).toThrow(AdminError)
    expect(() => parseInstitutionInput({ name: 'x'.repeat(101), slug: 'valid-slug' })).toThrow(
      AdminError,
    )
    expect(() => parseInstitutionInput({ name: 'Campus', slug: 'invalid_slug' })).toThrow(
      AdminError,
    )
    expect(() =>
      parseInstitutionInput({ name: 'Campus', slug: 'valid-slug', status: 'inactive' }),
    ).toThrow(AdminError)
  })

  it('requires an exact active-parent cohort input and bounded text', () => {
    expect(
      parseCohortInput({
        institutionId: firstId.toUpperCase(),
        name: '  WAD2  ',
        term: '  2026 T2 ',
      }),
    ).toEqual({ institutionId: firstId, name: 'WAD2', term: '2026 T2' })
    expect(() =>
      parseCohortInput({ institutionId: firstId, name: 'Class', term: 'Term', status: 'inactive' }),
    ).toThrow(AdminError)
    expect(() => parseCohortInput({ institutionId: 'bad', name: 'Class', term: 'Term' })).toThrow(
      AdminError,
    )
  })

  it('accepts only supplied mutable institution and cohort patch fields with a revision', () => {
    expect(parseInstitutionUpdateInput({ name: ' Campus ', expectedRevision: 0 })).toEqual({
      name: 'Campus',
      expectedRevision: 0,
    })
    expect(parseInstitutionUpdateInput({ status: 'inactive', expectedRevision: 4 })).toEqual({
      status: 'inactive',
      expectedRevision: 4,
    })
    expect(parseCohortUpdateInput({ term: '2026 T2', expectedRevision: 2 })).toEqual({
      term: '2026 T2',
      expectedRevision: 2,
    })
    expect(
      parseCohortUpdateInput({
        name: 'WAD2',
        term: '2026 T2',
        status: 'active',
        expectedRevision: 2,
      }),
    ).toEqual({ name: 'WAD2', term: '2026 T2', status: 'active', expectedRevision: 2 })
    expect(() => parseInstitutionUpdateInput({ expectedRevision: 0 })).toThrow(AdminError)
    expect(() => parseInstitutionUpdateInput({ name: 'Campus' })).toThrow(AdminError)
    expect(() => parseCohortUpdateInput({ slug: 'changed', expectedRevision: 1 })).toThrow(
      AdminError,
    )
    expect(() => parseCohortUpdateInput({ status: 'pending', expectedRevision: 1 })).toThrow(
      AdminError,
    )
  })

  it('reuses account normalization and avatar policy for instructor provisioning', () => {
    expect(
      parseInstructorInput({
        email: '  INSTRUCTOR@example.test ',
        username: ' Teacher_One ',
        avatarId: 'mint',
      }),
    ).toEqual({
      emailNormalized: 'instructor@example.test',
      username: { display: 'Teacher_One', normalized: 'teacher_one' },
      avatarId: 'mint',
    })
    expect(() =>
      parseInstructorInput({ email: 'bad', username: 'Teacher_One', avatarId: 'mint' }),
    ).toThrow(AdminError)
    expect(() =>
      parseInstructorInput({ email: 'teacher@example.test', username: 'x', avatarId: 'mint' }),
    ).toThrow(AdminError)
    expect(() =>
      parseInstructorInput({
        email: 'teacher@example.test',
        username: 'Teacher_One',
        avatarId: 'bad',
      }),
    ).toThrow(AdminError)
  })

  it('rejects untrusted or duplicate IDs and stale assignment revisions', () => {
    expect(parseAdminObjectId(firstId.toUpperCase())).toBe(firstId)
    expect(parseAssignmentsInput({ cohortIds: [firstId, secondId], expectedRevision: 0 })).toEqual({
      cohortIds: [firstId, secondId],
      expectedRevision: 0,
    })
    expect(parseAssignmentsInput({ cohortIds: [], expectedRevision: 12 })).toEqual({
      cohortIds: [],
      expectedRevision: 12,
    })
    expect(() =>
      parseAssignmentsInput({ cohortIds: [firstId, firstId.toUpperCase()], expectedRevision: 0 }),
    ).toThrow(AdminError)
    expect(() =>
      parseAssignmentsInput({ cohortIds: Array(51).fill(firstId), expectedRevision: 0 }),
    ).toThrow(AdminError)
    expect(() => parseAssignmentsInput({ cohortIds: [firstId], expectedRevision: -1 })).toThrow(
      AdminError,
    )
    expect(() => parseAssignmentsInput({ cohortIds: [firstId], expectedRevision: '0' })).toThrow(
      AdminError,
    )
    expect(() =>
      parseAssignmentsInput({ cohortIds: [firstId], expectedRevision: 0, role: 'admin' }),
    ).toThrow(AdminError)
  })

  it('accepts only an empty activation reissue body', () => {
    expect(assertEmptyAdminBody(undefined)).toBeUndefined()
    expect(assertEmptyAdminBody({})).toBeUndefined()
    expect(() => assertEmptyAdminBody({ token: 'secret' })).toThrow(AdminError)
  })

  it('accepts only empty queries on mutation routes', () => {
    expect(assertEmptyAdminQuery({})).toBeUndefined()
    expect(() => assertEmptyAdminQuery({ page: '1' })).toThrow(AdminError)
    expect(() => assertEmptyAdminQuery({ role: 'admin' })).toThrow(AdminError)
  })
})

describe('account delete input', () => {
  const valid = {
    confirmUsername: 'learner-one',
    password: 'Synthetic-Test-Password-2026',
    reasonCategory: 'duplicate',
    expectedRevision: 1,
  }

  it('accepts the exact object and trims the note', () => {
    expect(parseAccountDeleteInput(valid)).toEqual(valid)
    expect(
      parseAccountDeleteInput({
        ...valid,
        reasonCategory: 'other',
        reasonNote: '  ten chars ok  ',
      }),
    ).toMatchObject({ reasonNote: 'ten chars ok' })
  })

  it.each([
    ['extra field', { role: 'admin' }],
    ['deleted status smuggled', { accountStatus: 'deleted' }],
    ['unknown category', { reasonCategory: 'bored' }],
    ['other without note', { reasonCategory: 'other' }],
    ['short note', { reasonNote: 'too short' }],
    ['long note', { reasonNote: 'x'.repeat(501) }],
    ['non-string note', { reasonNote: 12 }],
    ['empty password', { password: '' }],
    ['long password', { password: 'p'.repeat(129) }],
    ['blank username', { confirmUsername: '  ' }],
    ['bad revision', { expectedRevision: -1 }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseAccountDeleteInput({ ...valid, ...overrides })).toThrow(AdminError)
  })

  it('rejects missing required fields and non-objects', () => {
    const withoutPassword = { ...valid }
    delete withoutPassword.password
    expect(() => parseAccountDeleteInput(withoutPassword)).toThrow(AdminError)
    expect(() => parseAccountDeleteInput(null)).toThrow(AdminError)
    expect(() => parseAccountDeleteInput([])).toThrow(AdminError)
  })

  it('still refuses deleted as a status transition', () => {
    expect(() =>
      parseAccountStatusInput({ accountStatus: 'deleted', expectedRevision: 1 }),
    ).toThrow(AdminError)
  })
})
