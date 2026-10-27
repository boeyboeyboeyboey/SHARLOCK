import { describe, expect, it } from 'vitest'
import { AuditError, parseAuditQuery, parseAuditRecord } from '../../../src/modules/audit/policy.js'

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
    ['window over 90 days', { from: '2026-07-15T23:59:59.999Z' }],
    ['reversed window', { from: '2026-10-13T00:00:00Z', to: '2026-10-12T00:00:00Z' }],
    ['page above bound', { page: '10001' }],
    ['limit above bound', { limit: '51' }],
    ['signed page', { page: '+1' }],
    ['fractional page', { page: '1.5' }],
  ])('rejects %s', (_label, query) => {
    expect(() => parseAuditQuery(query, now)).toThrow(AuditError)
  })
})
