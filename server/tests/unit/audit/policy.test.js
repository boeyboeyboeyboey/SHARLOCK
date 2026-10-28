import { describe, expect, it } from 'vitest'
import {
  AUDIT_RETENTION_MS,
  AuditError,
  auditRetentionMs,
  parseAuditQuery,
  parseAuditRecord,
} from '../../../src/modules/audit/policy.js'

const now = Date.parse('2026-10-14T00:00:00.000Z')
const userId = '0123456789abcdef01234567'
const cohortId = 'abcdef0123456789abcdef01'
const requestId = '4f352aaa-6774-42aa-b187-fc84d979d524'

function validRecord(overrides = {}) {
  return {
    eventType: 'admin.bootstrap',
    actorKind: 'user',
    actorId: userId,
    targetId: cohortId,
    scopeCohortId: null,
    outcome: 'success',
    requestId,
    ...overrides,
  }
}

describe('audit record policy', () => {
  it('accepts only the declared event shape and normalizes IDs', () => {
    expect(parseAuditRecord(validRecord({ actorId: userId.toUpperCase() }))).toEqual({
      ...validRecord(),
      actorId: userId,
    })
    expect(
      parseAuditRecord(
        validRecord({ actorKind: 'operator', actorId: null, scopeCohortId: cohortId }),
      ),
    ).toMatchObject({ actorKind: 'operator', actorId: null, scopeCohortId: cohortId })
  })

  it.each([
    'admin.institution.update',
    'admin.cohort.update',
    'admin.administrator.provision',
    'admin.administrator.activation.issue',
    'admin.administrator.cancel',
    'account.administrator.activate',
  ])('accepts the %s event type', (eventType) => {
    expect(parseAuditRecord(validRecord({ eventType })).eventType).toBe(eventType)
  })

  it.each([
    ['unknown event', { eventType: 'auth.login' }],
    ['unknown actor', { actorKind: 'system' }],
    ['operator user id', { actorKind: 'operator' }],
    ['user without id', { actorId: null }],
    ['invalid target id', { targetId: 'bad-id' }],
    ['invalid scope id', { scopeCohortId: 'bad-id' }],
    ['unknown outcome', { outcome: 'partial' }],
    ['invalid request id', { requestId: 'request-1' }],
  ])('rejects %s with a safe generic error', (_label, overrides) => {
    expect(() => parseAuditRecord(validRecord(overrides))).toThrow(AuditError)
  })

  it('rejects secret and prototype-named fields without echoing them', () => {
    const input = JSON.parse(JSON.stringify(validRecord({ password: 'private-value' })))
    const error = (() => {
      try {
        parseAuditRecord(input)
      } catch (caught) {
        return caught
      }
      throw new Error('expected invalid input')
    })()
    expect(error).toBeInstanceOf(AuditError)
    expect(error.message).not.toContain('password')
    expect(error.message).not.toContain('private-value')
    expect(() => parseAuditRecord(JSON.parse('{"__proto__":"x"}'))).toThrow(AuditError)
  })
})

describe('audit query policy', () => {
  it('uses the bounded default window and pagination', () => {
    expect(parseAuditQuery({}, now)).toEqual({
      eventType: undefined,
      from: new Date('2026-07-16T00:00:00.000Z'),
      to: new Date(now),
      page: 1,
      limit: 20,
    })
    expect(
      parseAuditQuery(
        { eventType: 'admin.bootstrap', from: '2026-10-13T00:00:00Z', page: '2', limit: '50' },
        now,
      ),
    ).toMatchObject({ eventType: 'admin.bootstrap', page: 2, limit: 50 })
  })

  it.each([
    ['unknown filter', { secret: 'x' }],
    ['repeated filter', { page: ['1', '2'] }],
    ['object filter', { page: { $gt: '0' } }],
    ['operator key', { $where: 'true' }],
    ['prototype key', JSON.parse('{"__proto__":"x"}')],
    ['constructor key', { constructor: 'x' }],
    ['invalid event type', { eventType: 'auth.login' }],
    ['invalid calendar date', { from: '2026-02-30T00:00:00Z' }],
    ['non-UTC timestamp', { from: '2026-10-13T00:00:00+08:00' }],
    ['future date', { to: '2026-10-15T00:00:00Z' }],
    ['window over 180 days', { from: '2026-04-16T23:59:59.999Z' }],
    ['reversed window', { from: '2026-10-13T00:00:00Z', to: '2026-10-12T00:00:00Z' }],
    ['page above bound', { page: '10001' }],
    ['limit above bound', { limit: '51' }],
    ['signed page', { page: '+1' }],
    ['fractional page', { page: '1.5' }],
  ])('rejects %s', (_label, query) => {
    expect(() => parseAuditQuery(query, now)).toThrow(AuditError)
  })
})

describe('audit retention and account-delete record', () => {
  const day = 24 * 60 * 60 * 1000
  const deleteRecord = (overrides = {}) =>
    validRecord({
      eventType: 'admin.account.delete',
      targetRole: 'student',
      accountOutcome: 'deleted',
      reasonCategory: 'duplicate',
      ...overrides,
    })

  it('keeps account-delete events 180 days and all others 90', () => {
    expect(auditRetentionMs('admin.account.delete')).toBe(180 * day)
    expect(auditRetentionMs('admin.user.disable')).toBe(AUDIT_RETENTION_MS)
    expect(AUDIT_RETENTION_MS).toBe(90 * day)
  })

  it('accepts a window up to 180 days and defaults to 90', () => {
    const wide = parseAuditQuery({ from: '2026-04-17T00:00:00.000Z' }, now)
    expect(wide.to.getTime() - wide.from.getTime()).toBe(180 * day)
    const fallback = parseAuditQuery({}, now)
    expect(fallback.to.getTime() - fallback.from.getTime()).toBe(90 * day)
  })

  it('requires the delete details and bounds the only free-text field', () => {
    expect(parseAuditRecord(deleteRecord()).accountOutcome).toBe('deleted')
    expect(parseAuditRecord(deleteRecord({ reasonNote: 'x'.repeat(10) })).reasonNote).toHaveLength(
      10,
    )
    for (const overrides of [
      { reasonNote: 'short' },
      { reasonNote: 'x'.repeat(501) },
      { reasonNote: 5 },
      { reasonCategory: 'bored' },
      { accountOutcome: 'gone' },
      { targetRole: 'admin' },
    ]) {
      expect(() => parseAuditRecord(deleteRecord(overrides))).toThrow(AuditError)
    }
    const missing = deleteRecord()
    delete missing.reasonCategory
    expect(() => parseAuditRecord(missing)).toThrow(AuditError)
  })

  it('rejects delete-only fields on other events', () => {
    expect(() => parseAuditRecord(validRecord({ reasonNote: 'a note of ten chars' }))).toThrow(
      AuditError,
    )
  })
})
