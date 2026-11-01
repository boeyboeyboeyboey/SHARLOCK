import { cohortModel } from '../../models/Cohort.js'
import { institutionModel } from '../../models/Institution.js'
import { membershipModel } from '../../models/Membership.js'
import { userModel } from '../../models/User.js'
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

  // rows store only ids; names are read here for the administrator, so a renamed or deleted record
  // simply shows its current name or none. a target can be a user, class, institution or membership
  async function loadEventNames(events) {
    const idsOf = (field) => [
      ...new Set(events.map((event) => event[field]?.toString()).filter(Boolean)),
    ]
    const targetIds = idsOf('targetId')
    const memberships = await membershipModel(database)
      .find({ _id: { $in: targetIds } }, { userId: 1, cohortId: 1 })
      .lean()
    const userIds = [
      ...new Set([
        ...idsOf('actorId'),
        ...targetIds,
        ...memberships.map(({ userId }) => userId.toString()),
      ]),
    ]
    const cohortIds = [...new Set([...idsOf('scopeCohortId'), ...targetIds])]
    const [users, cohorts, institutions] = await Promise.all([
      userModel(database)
        .find({ _id: { $in: userIds } }, { username: 1 })
        .lean(),
      cohortModel(database)
        .find({ _id: { $in: cohortIds } }, { name: 1 })
        .lean(),
      institutionModel(database)
        .find({ _id: { $in: targetIds } }, { name: 1 })
        .lean(),
    ])
    const names = new Map()
    for (const { _id, name } of [...cohorts, ...institutions]) names.set(_id.toString(), name)
    for (const { _id, username } of users) names.set(_id.toString(), username)
    for (const { _id, userId } of memberships) {
      const username = names.get(userId.toString())
      if (username) names.set(_id.toString(), username)
    }
    return names
  }

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
    const names = await loadEventNames(events)
    const nameOf = (id) => names.get(id?.toString()) ?? null
    return {
      events: events.map((event) => ({
        ...eventDto(event),
        actorName: nameOf(event.actorId),
        targetName: nameOf(event.targetId),
        cohortName: nameOf(event.scopeCohortId),
      })),
      page: filters.page,
      total,
    }
  }

  return Object.freeze({ recordAuditEvent, listEvents })
}
