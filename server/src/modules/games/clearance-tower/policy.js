import { CLEARANCE_IDS } from './models.js'

export const GAME_ID = 'clearance-tower'
export const RULESET_VERSION = 'clear-2'
export const VERDICTS = ['allow', 'deny']
export const MAX_GRANTS = 64
export const MAX_ROLES = 8
export const MAX_ROLE_NAME_LENGTH = 24

const ROLE_ID = /^[a-z0-9-]{1,24}$/

export class ClearanceError extends Error {
  constructor(code, message, status = 400, fieldErrors = null) {
    super(message)
    this.name = 'ClearanceError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function invalid(fieldErrors) {
  return new ClearanceError(
    'CLEAR_INVALID_BODY',
    'That request could not be read. Reload the level and try again.',
    400,
    fieldErrors,
  )
}

export function rateLimited() {
  return new ClearanceError(
    'CLEAR_RATE_LIMITED',
    'Too many requests. Wait a moment and try again.',
    429,
  )
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isKnownId(list, id) {
  return typeof id === 'string' && list.some((item) => item.id === id)
}

function isUniqueSubset(values, allowed) {
  return (
    Array.isArray(values) &&
    new Set(values).size === values.length &&
    values.every((value) => allowed.includes(value))
  )
}

// null prototype so an own "__proto__" key is recorded like any other field
function newFieldErrors() {
  return Object.create(null)
}

function flagUnknownKeys(value, allowed, fieldErrors, prefix = '') {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fieldErrors[`${prefix}${key}`] = 'unsupported field'
}

function throwIfInvalid(fieldErrors) {
  if (Object.keys(fieldErrors).length) throw invalid(fieldErrors)
}

function parseGrants(level, policy, fieldErrors) {
  flagUnknownKeys(policy, ['grants'], fieldErrors, 'policy.')
  const { grants } = policy
  if (!Array.isArray(grants) || grants.length > MAX_GRANTS) {
    fieldErrors['policy.grants'] = `expected up to ${MAX_GRANTS} grants`
    return null
  }
  const seen = new Set()
  const parsed = []
  for (const grant of grants) {
    const valid =
      isPlainObject(grant) &&
      hasOnlyKeys(grant, ['subject', 'object', 'rights']) &&
      isKnownId(level.agents, grant.subject) &&
      isKnownId(level.files, grant.object) &&
      isUniqueSubset(grant.rights, ['r', 'w'])
    const pair = valid && `${grant.subject}:${grant.object}`
    if (!valid || seen.has(pair)) {
      fieldErrors['policy.grants'] =
        'expected one grant per known agent and file, with r and w only'
      return null
    }
    seen.add(pair)
    parsed.push({ subject: grant.subject, object: grant.object, rights: [...grant.rights] })
  }
  return { grants: parsed }
}

function parseObjectLabels(level, policy, fieldErrors) {
  flagUnknownKeys(policy, ['objectLabels'], fieldErrors, 'policy.')
  const labels = policy.objectLabels
  const categoryIds = level.categories.map((category) => category.id)
  const fileIds = level.files.map((file) => file.id)
  if (!isPlainObject(labels) || !isUniqueSubset(Object.keys(labels), fileIds)) {
    fieldErrors['policy.objectLabels'] = 'expected one label for each file'
    return null
  }
  const parsed = {}
  for (const fileId of fileIds) {
    const label = labels[fileId]
    const valid =
      isPlainObject(label) &&
      hasOnlyKeys(label, ['level', 'categories']) &&
      CLEARANCE_IDS.includes(label.level) &&
      isUniqueSubset(label.categories, categoryIds)
    if (!valid) {
      fieldErrors[`policy.objectLabels.${fileId}`] = 'expected a known level and categories'
      return null
    }
    parsed[fileId] = { level: label.level, categories: [...label.categories] }
  }
  return { objectLabels: parsed }
}

function parseRole(level, role, fieldErrors) {
  const permissionIds = level.permissions.map((permission) => permission.id)
  const valid =
    isPlainObject(role) &&
    hasOnlyKeys(role, ['id', 'name', 'permissions']) &&
    typeof role.id === 'string' &&
    ROLE_ID.test(role.id) &&
    typeof role.name === 'string' &&
    role.name.trim().length > 0 &&
    role.name.length <= MAX_ROLE_NAME_LENGTH &&
    isUniqueSubset(role.permissions, permissionIds)
  if (!valid) {
    fieldErrors['policy.roles'] =
      `expected roles with an id, a name up to ${MAX_ROLE_NAME_LENGTH} characters and known permissions`
    return null
  }
  return { id: role.id, name: role.name.trim(), permissions: [...role.permissions] }
}

function parseRoles(level, policy, fieldErrors) {
  flagUnknownKeys(policy, ['roles', 'assignments'], fieldErrors, 'policy.')
  const { roles, assignments } = policy
  if (!Array.isArray(roles) || roles.length > MAX_ROLES) {
    fieldErrors['policy.roles'] = `expected up to ${MAX_ROLES} roles`
    return null
  }
  const parsedRoles = []
  for (const role of roles) {
    const parsed = parseRole(level, role, fieldErrors)
    if (!parsed) return null
    parsedRoles.push(parsed)
  }
  const roleIds = parsedRoles.map((role) => role.id)
  if (new Set(roleIds).size !== roleIds.length) {
    fieldErrors['policy.roles'] = 'expected unique role ids'
    return null
  }

  if (!Array.isArray(assignments) || assignments.length > level.agents.length) {
    fieldErrors['policy.assignments'] = 'expected at most one assignment per agent'
    return null
  }
  const seenAgents = new Set()
  const parsedAssignments = []
  for (const assignment of assignments) {
    const valid =
      isPlainObject(assignment) &&
      hasOnlyKeys(assignment, ['agent', 'roleIds']) &&
      isKnownId(level.agents, assignment.agent) &&
      !seenAgents.has(assignment.agent) &&
      isUniqueSubset(assignment.roleIds, roleIds)
    if (!valid) {
      fieldErrors['policy.assignments'] = 'expected one assignment per known agent with known roles'
      return null
    }
    seenAgents.add(assignment.agent)
    parsedAssignments.push({ agent: assignment.agent, roleIds: [...assignment.roleIds] })
  }
  return { roles: parsedRoles, assignments: parsedAssignments }
}

const POLICY_PARSERS = { dac: parseGrants, blp: parseObjectLabels, rbac: parseRoles }

function parsePredictions(level, predictions, fieldErrors) {
  const promptIds = level.predictions.map((prompt) => prompt.id)
  const valid =
    Array.isArray(predictions) &&
    predictions.length === promptIds.length &&
    predictions.every(
      (item) =>
        isPlainObject(item) &&
        hasOnlyKeys(item, ['id', 'verdict']) &&
        promptIds.includes(item.id) &&
        VERDICTS.includes(item.verdict),
    ) &&
    new Set(predictions.map((item) => item.id)).size === promptIds.length
  if (!valid) {
    fieldErrors.predictions = 'expected one allow or deny verdict for every prompt'
    return null
  }
  return Object.fromEntries(predictions.map((item) => [item.id, item.verdict]))
}

// a saved-attempt action carries the level it answers; the attempt service owns idempotency
export function parseSubmission(level, body) {
  const fieldErrors = newFieldErrors()
  if (!isPlainObject(body)) throw invalid({ body: 'expected an object' })
  flagUnknownKeys(body, ['levelId', 'policy', 'predictions'], fieldErrors)

  let policy = null
  if (isPlainObject(body.policy))
    policy = POLICY_PARSERS[level.model](level, body.policy, fieldErrors)
  else fieldErrors.policy = 'expected an object'

  const predictions = parsePredictions(level, body.predictions, fieldErrors)
  throwIfInvalid(fieldErrors)
  return { levelId: level.id, policy, predictions }
}
