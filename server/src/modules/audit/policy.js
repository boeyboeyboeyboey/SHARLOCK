const objectIdPattern = /^[a-f\d]{24}$/i
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
const utcTimestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/
export const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const recordFields = [
  'eventType',
  'actorKind',
  'actorId',
  'targetId',
  'scopeCohortId',
  'outcome',
  'requestId',
]
const queryFields = ['eventType', 'from', 'to', 'page', 'limit']
export const auditEventTypes = Object.freeze([
  'admin.bootstrap',
  'admin.institution.create',
  'admin.institution.update',
  'admin.cohort.create',
  'admin.cohort.update',
  'admin.instructor.provision',
  'admin.instructor.activation.issue',
  'admin.instructor.assignments.update',
  'admin.administrator.provision',
  'admin.administrator.activation.issue',
  'admin.user.disable',
  'admin.user.enable',
  'account.instructor.activate',
  'account.administrator.activate',
  'cohort.code.issue',
  'cohort.code.revoke',
  'cohort.membership.request',
  'cohort.membership.approve',
  'cohort.membership.decline',
  'cohort.membership.remove',
  'cohort.onboarding.complete',
  'admin.student.recovery.issue',
  'cohort.student.recovery.issue',
  'account.student.password_reset',
])

export class AuditError extends Error {
  constructor(code = 'AUDIT_INVALID_REQUEST', status = 400) {
    super('Check the request fields and try again.')
    this.name = 'AuditError'
    this.code = code
    this.status = status
  }
}

function invalidRequest() {
  return new AuditError()
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function keysAreAllowed(value, allowed) {
  const keys = Reflect.ownKeys(value)
  return keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function parseObjectId(value, nullable = false) {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !objectIdPattern.test(value)) throw invalidRequest()
  return value.toLowerCase()
}

function parseUtcTimestamp(value) {
  if (typeof value !== 'string' || !utcTimestampPattern.test(value)) throw invalidRequest()
  const [, wholeSeconds, fraction = ''] = value.match(utcTimestampPattern)
  const date = new Date(value)
  const normalizedFraction = fraction.padEnd(3, '0')
  const expected = `${wholeSeconds}.${normalizedFraction}Z`
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== expected) throw invalidRequest()
  return date
}

function parsePositiveInteger(value, maximum) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw invalidRequest()
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number > maximum) throw invalidRequest()
  return number
}

export function parseAuditRecord(input) {
  if (!isRecord(input) || !keysAreAllowed(input, recordFields)) throw invalidRequest()
  if (!recordFields.every((field) => Object.hasOwn(input, field))) throw invalidRequest()
  if (!auditEventTypes.includes(input.eventType)) throw invalidRequest()
  if (!['user', 'operator'].includes(input.actorKind)) throw invalidRequest()
  if (!['success', 'refused', 'failure'].includes(input.outcome)) throw invalidRequest()
  if (typeof input.requestId !== 'string' || !uuidPattern.test(input.requestId))
    throw invalidRequest()

  const actorId = parseObjectId(input.actorId, input.actorKind === 'operator')
  if (input.actorKind === 'operator' && actorId !== null) throw invalidRequest()

  return {
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorId,
    targetId: parseObjectId(input.targetId),
    scopeCohortId: parseObjectId(input.scopeCohortId, true),
    outcome: input.outcome,
    requestId: input.requestId.toLowerCase(),
  }
}

export function parseAuditQuery(query, now) {
  if (!isRecord(query) || !keysAreAllowed(query, queryFields)) throw invalidRequest()
  for (const key of queryFields) {
    if (Object.hasOwn(query, key) && typeof query[key] !== 'string') {
      throw invalidRequest()
    }
  }

  const currentTime = new Date(now)
  if (!Number.isFinite(currentTime.getTime())) throw new TypeError('Audit clock is invalid.')
  const defaultTo = currentTime
  const defaultFrom = new Date(currentTime.getTime() - AUDIT_RETENTION_MS)
  const from = Object.hasOwn(query, 'from') ? parseUtcTimestamp(query.from) : defaultFrom
  const to = Object.hasOwn(query, 'to') ? parseUtcTimestamp(query.to) : defaultTo
  if (from > to || to > currentTime || to.getTime() - from.getTime() > AUDIT_RETENTION_MS) {
    throw invalidRequest()
  }

  if (Object.hasOwn(query, 'eventType') && !auditEventTypes.includes(query.eventType)) {
    throw invalidRequest()
  }

  return {
    eventType: query.eventType,
    from,
    to,
    page: Object.hasOwn(query, 'page') ? parsePositiveInteger(query.page, 10000) : 1,
    limit: Object.hasOwn(query, 'limit') ? parsePositiveInteger(query.limit, 50) : 20,
  }
}
