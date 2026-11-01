import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  requireCapability: vi.fn(),
}))

vi.mock('../../../src/modules/audit/model.js', () => ({
  auditEventModel: () => mocks,
}))
vi.mock('../../../src/services/permissions.js', () => ({
  createPermissionService: () => ({ requireCapability: mocks.requireCapability }),
}))
const noRows = { find: () => ({ lean: async () => [] }) }
vi.mock('../../../src/models/Membership.js', () => ({ membershipModel: () => noRows }))
vi.mock('../../../src/models/User.js', () => ({ userModel: () => noRows }))
vi.mock('../../../src/models/Cohort.js', () => ({ cohortModel: () => noRows }))
vi.mock('../../../src/models/Institution.js', () => ({ institutionModel: () => noRows }))

import { createAuditService } from '../../../src/modules/audit/service.js'

const now = Date.parse('2026-10-14T00:00:00.000Z')
const userId = '0123456789abcdef01234567'
const targetId = 'abcdef0123456789abcdef01'
const requestId = '4f352aaa-6774-42aa-b187-fc84d979d524'

function input(overrides = {}) {
  return {
    eventType: 'admin.bootstrap',
    actorKind: 'user',
    actorId: userId,
    targetId,
    scopeCohortId: null,
    outcome: 'success',
    requestId,
    ...overrides,
  }
}

function queryResult(rows = []) {
  const chain = {
    select: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    skip: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn().mockResolvedValue(rows),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireCapability.mockResolvedValue(undefined)
})

describe('audit service', () => {
  it('owns timestamps, applies 90-day expiry, and passes a transaction session', async () => {
    const session = { id: 'transaction-session' }
    const saved = {
      ...input(),
      _id: targetId,
      occurredAt: new Date(now),
      expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000),
    }
    mocks.create.mockResolvedValue([{ toObject: () => saved }])
    const service = createAuditService({}, { now: () => now })

    const result = await service.recordAuditEvent(input(), { session })

    expect(mocks.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          eventType: 'admin.bootstrap',
          occurredAt: new Date(now),
          expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000),
        }),
      ],
      { session },
    )
    expect(result).toEqual({
      eventType: 'admin.bootstrap',
      actorKind: 'user',
      actorId: userId,
      targetId,
      scopeCohortId: null,
      outcome: 'success',
      occurredAt: new Date(now).toISOString(),
      requestId,
    })
    expect(Object.keys(result)).toEqual([
      'eventType',
      'actorKind',
      'actorId',
      'targetId',
      'scopeCohortId',
      'outcome',
      'occurredAt',
      'requestId',
    ])
  })

  it('requires the current audit capability before querying and returns bounded public DTOs', async () => {
    const actor = { id: userId, globalRoles: ['admin'] }
    const row = {
      _id: targetId,
      ...input({ actorKind: 'operator', actorId: null }),
      occurredAt: new Date(now - 1000),
    }
    const chain = queryResult([row])
    mocks.find.mockReturnValue(chain)
    mocks.countDocuments.mockResolvedValue(1)
    const service = createAuditService({}, { now: () => now })

    const result = await service.listEvents(actor, { page: '2', limit: '5' })

    expect(mocks.requireCapability).toHaveBeenCalledWith(actor, 'admin:audit:read')
    expect(mocks.find).toHaveBeenCalledWith({
      occurredAt: { $gte: new Date(now - 90 * 24 * 60 * 60 * 1000), $lte: new Date(now) },
      expiresAt: { $gt: new Date(now) },
    })
    expect(chain.sort).toHaveBeenCalledWith({ occurredAt: -1, _id: -1 })
    expect(chain.skip).toHaveBeenCalledWith(5)
    expect(chain.limit).toHaveBeenCalledWith(5)
    expect(result).toEqual({
      events: [
        {
          eventType: 'admin.bootstrap',
          actorKind: 'operator',
          actorId: null,
          targetId,
          scopeCohortId: null,
          outcome: 'success',
          occurredAt: new Date(now - 1000).toISOString(),
          requestId,
          actorName: null,
          targetName: null,
          cohortName: null,
        },
      ],
      page: 2,
      total: 1,
    })
  })

  it('does not query when current permission is denied', async () => {
    mocks.requireCapability.mockRejectedValue(new Error('denied'))
    const service = createAuditService({}, { now: () => now })

    await expect(service.listEvents({ id: userId }, {})).rejects.toThrow('denied')
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.countDocuments).not.toHaveBeenCalled()
  })
})
