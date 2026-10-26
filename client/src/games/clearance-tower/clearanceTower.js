export const VERDICTS = [
  { value: 'allow', label: 'Allowed' },
  { value: 'deny', label: 'Blocked' },
]

export const OUTCOME_LABELS = {
  done: 'Done',
  blocked: 'Work blocked',
  leaked: 'Leaked',
  stopped: 'Stopped',
  tampered: 'Tampered',
}

export const MODEL_GUIDES = {
  dac: {
    name: 'Discretionary access control',
    rules: [
      'Each file has an access list naming who may read (r) and write (w).',
      'Grant only what today’s work needs. Rights nobody uses cost points.',
      'Attacks are not in the brief. They succeed through rights you granted.',
    ],
  },
  blp: {
    name: 'Bell–LaPadula mandatory access control',
    rules: [
      'Agents hold fixed clearances. You choose each file’s label.',
      'Read down: an agent may read a file only if the agent’s label dominates the file’s.',
      'Write up: an agent may write a file only if the file’s label dominates the agent’s.',
      'A label dominates another when its level is at least as high and it holds all of the other’s categories.',
    ],
  },
  rbac: {
    name: 'Role-based access control',
    rules: [
      'Give permissions to roles, then give each agent role badges.',
      'Separation of duties: the listed permission pairs must never meet in one agent.',
      'Permissions nobody needs cost points.',
    ],
  },
}

export function nameOf(list, id) {
  return list.find((item) => item.id === id)?.name ?? id
}

export function describeStep(level, step) {
  const verb = step.action === 'read' ? 'reads' : 'writes to'
  return `${nameOf(level.agents, step.agent)} ${verb} ${nameOf(level.files, step.file)}`
}

// levels without categories show the plain clearance; the others use slide 27's {set} notation
export function formatLabel(level, label) {
  if (!level.categories.length) return nameOf(level.clearances, label.level)
  const categories = label.categories.map((id) => nameOf(level.categories, id))
  return `${nameOf(level.clearances, label.level)} {${categories.join(', ')}}`
}

export function starText(stars) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

// adds the item when missing, removes it when present
export function toggleItem(list, item) {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]
}

export function hasRight(grants, agentId, fileId, right) {
  const grant = grants.find((entry) => entry.subject === agentId && entry.object === fileId)
  return Boolean(grant?.rights.includes(right))
}

// returns new grants with one right switched; an entry with no rights left is dropped
export function toggleRight(grants, agentId, fileId, right) {
  const others = grants.filter((entry) => !(entry.subject === agentId && entry.object === fileId))
  const current = grants.find((entry) => entry.subject === agentId && entry.object === fileId)
  const rights = toggleItem(current?.rights ?? [], right)
  if (!rights.length) return others
  return [
    ...others,
    { subject: agentId, object: fileId, rights: ['r', 'w'].filter((r) => rights.includes(r)) },
  ]
}

export function roleIdsFor(policy, agentId) {
  return policy.assignments.find((entry) => entry.agent === agentId)?.roleIds ?? []
}

export function toggleAssignment(policy, agentId, roleId) {
  const roleIds = toggleItem(roleIdsFor(policy, agentId), roleId)
  const others = policy.assignments.filter((entry) => entry.agent !== agentId)
  const assignments = roleIds.length ? [...others, { agent: agentId, roleIds }] : others
  return { ...policy, assignments }
}

export function addRole(policy) {
  let number = 1
  while (policy.roles.some((role) => role.id === `role-${number}`)) number += 1
  const role = { id: `role-${number}`, name: `Role ${number}`, permissions: [] }
  return { ...policy, roles: [...policy.roles, role] }
}

export function removeRole(policy, roleId) {
  return {
    roles: policy.roles.filter((role) => role.id !== roleId),
    assignments: policy.assignments
      .map((entry) => ({ ...entry, roleIds: entry.roleIds.filter((id) => id !== roleId) }))
      .filter((entry) => entry.roleIds.length),
  }
}

export function updateRole(policy, roleId, changes) {
  const roles = policy.roles.map((role) => (role.id === roleId ? { ...role, ...changes } : role))
  return { ...policy, roles }
}

// display-only warning; the server makes the scored decision
export function dutyWarnings(level, policy) {
  const warnings = []
  for (const agent of level.agents) {
    const roleIds = roleIdsFor(policy, agent.id)
    const held = policy.roles
      .filter((role) => roleIds.includes(role.id))
      .flatMap((role) => role.permissions)
    for (const constraint of level.constraints)
      if (constraint.permissions.every((permission) => held.includes(permission)))
        warnings.push(`${agent.name}: ${constraint.reason}`)
  }
  return warnings
}

// bell-lapadula levels stack files on the floor of their label; other levels use two rooms a floor
export function floorsFor(level, policy) {
  if (level.model === 'blp') {
    return [...level.clearances].reverse().map((clearance) => ({
      id: clearance.id,
      name: clearance.name,
      rooms: level.files.filter((file) => policy.objectLabels[file.id].level === clearance.id),
    }))
  }
  const floors = []
  for (let index = 0; index < level.files.length; index += 2)
    floors.push({
      id: `floor-${index}`,
      name: `Floor ${index / 2 + 1}`,
      rooms: level.files.slice(index, index + 2),
    })
  return floors.reverse()
}
