import { createPermissionService } from '../../services/permissions.js'
import { auditEventModel } from './model.js'
import { AuditError, auditRetentionMs, parseAuditQuery, parseAuditRecord } from './policy.js'

function eventDto(event) {
  return {
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorId: event.actorId?.toString() ?? null,
    targetId: event.targetId.toString(),
    scopeCohortId: event.scopeCohortId?.toString() ?? null,
    outcome: event.outcome,
    occurredAt: event.occurredAt.toISOString(),
    requestId: event.requestId,
    ...(event.reasonCategory && {
      targetRole: event.targetRole,
      accountOutcome: event.accountOutcome,
      reasonCategory: event.reasonCategory,
      ...(event.reasonNote && { reasonNote: event.reasonNote }),
    }),
  }
}

export function createAuditService(database, { now = Date.now } = {}) {
  const AuditEvent = auditEventModel(database)
  const permissions = createPermissionService(database)

  async function recordAuditEvent(input, { session } = {}) {
    const record = parseAuditRecord(input)
    const occurredAt = new Date(now())
    if (!Number.isFinite(occurredAt.getTime())) throw new TypeError('Audit clock is invalid.')
    const event = {
      ...record,
      occurredAt,
      expiresAt: new Date(occurredAt.getTime() + auditRetentionMs(record.eventType)),
    }
    try {
      const [created] = await AuditEvent.create([event], session ? { session } : {})
      return eventDto(created.toObject())
    } catch {
      throw new AuditError('AUDIT_WRITE_FAILED', 500)
    }
  }

  async function listEvents(actor, query = {}) {
    await permissions.requireCapability(actor, 'admin:audit:read')
    const currentTime = now()
    const filters = parseAuditQuery(query, currentTime)
    const filter = {
      occurredAt: { $gte: filters.from, $lte: filters.to },
      expiresAt: { $gt: new Date(currentTime) },
    }
    if (filters.eventType) filter.eventType = filters.eventType
    const skip = (filters.page - 1) * filters.limit
    const [events, total] = await Promise.all([
      AuditEvent.find(filter)
        .select(
          '_id eventType actorKind actorId targetId scopeCohortId outcome occurredAt requestId targetRole accountOutcome reasonCategory reasonNote',
        )
        .sort({ occurredAt: -1, _id: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      AuditEvent.countDocuments(filter),
    ])
    return { events: events.map(eventDto), page: filters.page, total }
  }

  return Object.freeze({ recordAuditEvent, listEvents })
}
