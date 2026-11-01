import { describe, expect, it } from 'vitest'
import {
  addRole,
  describeStep,
  dutyWarnings,
  floorsFor,
  formatLabel,
  hasRight,
  removeRole,
  starText,
  stepVerdict,
  toggleAssignment,
  toggleRight,
} from '../clearanceTower.js'
import {
  findLevel,
  publicLevel,
} from '../../../../../server/src/modules/games/clearance-tower/levels.js'

const matrixLevel = publicLevel(findLevel('the-matrix'))
const labelLevel = publicLevel(findLevel('compartments'))
const roleLevel = publicLevel(findLevel('roles-not-people'))

describe('clearance tower helpers', () => {
  it('words a step as allowed, blocked or not reached', () => {
    expect([true, false, null].map((allowed) => stepVerdict({ allowed }))).toEqual([
      'allowed',
      'blocked',
      'not reached',
    ])
  })

  it('toggles one right at a time and drops empty grants', () => {
    let grants = toggleRight([], 'director', 'ops', 'w')
    grants = toggleRight(grants, 'director', 'ops', 'r')
    expect(grants).toEqual([{ subject: 'director', object: 'ops', rights: ['r', 'w'] }])
    expect(hasRight(grants, 'director', 'ops', 'r')).toBe(true)
    grants = toggleRight(grants, 'director', 'ops', 'r')
    grants = toggleRight(grants, 'director', 'ops', 'w')
    expect(grants).toEqual([])
  })

  it('adds, assigns and removes roles without mutating the policy', () => {
    const empty = { roles: [], assignments: [] }
    const withRole = addRole(addRole(empty))
    expect(withRole.roles.map((role) => role.id)).toEqual(['role-1', 'role-2'])
    expect(empty.roles).toEqual([])

    const assigned = toggleAssignment(withRole, 'ada', 'role-1')
    expect(assigned.assignments).toEqual([{ agent: 'ada', roleIds: ['role-1'] }])
    expect(removeRole(assigned, 'role-1')).toEqual({
      roles: [{ id: 'role-2', name: 'Role 2', permissions: [] }],
      assignments: [],
    })
  })

  it('warns when one agent holds both sides of a separated duty', () => {
    const policy = {
      roles: [{ id: 'boss', name: 'Boss', permissions: ['write-register', 'write-ops'] }],
      assignments: [{ agent: 'cy', roleIds: ['boss'] }],
    }
    expect(dutyWarnings(roleLevel, policy)).toEqual([
      `Officer Moreau: ${roleLevel.constraints[0].reason}`,
    ])
  })

  it('stacks bell-lapadula files on the floor of their label, highest first', () => {
    const floors = floorsFor(labelLevel, {
      objectLabels: {
        cyber: { level: 'secret', categories: ['cyber'] },
        defense: { level: 'secret', categories: ['defense'] },
        joint: { level: 'top-secret', categories: [] },
        notice: { level: 'unclassified', categories: [] },
      },
    })
    expect(floors.map((floor) => floor.name)).toEqual([
      'Top Secret',
      'Secret',
      'Confidential',
      'Unclassified',
    ])
    expect(floors[1].rooms.map((room) => room.id)).toEqual(['cyber', 'defense'])
    expect(floors[2].rooms).toEqual([])
  })

  it('puts two rooms on each floor for the other models', () => {
    const floors = floorsFor(matrixLevel, { grants: [] })
    expect(floors.map((floor) => floor.rooms.length)).toEqual([2, 2])
    expect(floors[0].name).toBe('Floor 2')
  })

  it('describes steps, labels and stars in plain words', () => {
    expect(describeStep(matrixLevel, { agent: 'analyst', action: 'write', file: 'report' })).toBe(
      'Analyst Okafor writes to Field Report',
    )
    expect(formatLabel(labelLevel, { level: 'secret', categories: ['defense', 'cyber'] })).toBe(
      'Secret {Defense, Cyber}',
    )
    expect(starText(2)).toBe('★★☆')
  })
})
