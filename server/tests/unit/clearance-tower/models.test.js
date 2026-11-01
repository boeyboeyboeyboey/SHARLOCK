import { describe, expect, it } from 'vitest'
import {
  checkStep,
  dominates,
  findDutyConflicts,
} from '../../../src/modules/games/clearance-tower/models.js'
import {
  findLevel,
  LEVELS,
  publicLevel,
} from '../../../src/modules/games/clearance-tower/levels.js'
import { simulateDay } from '../../../src/modules/games/clearance-tower/simulate.js'
import { SOLUTIONS } from './solutions.js'

const label = (level, categories = []) => ({ level, categories })
const outcomeOf = (events, id) => events.find((event) => event.id === id).outcome

describe('label dominance', () => {
  it('needs a high enough level and every category', () => {
    expect(dominates(label('secret'), label('confidential'))).toBe(true)
    expect(dominates(label('confidential'), label('secret'))).toBe(false)
    expect(dominates(label('top-secret', ['defense', 'cyber']), label('secret', ['defense']))).toBe(
      true,
    )
    expect(dominates(label('top-secret', ['cyber']), label('confidential', ['defense']))).toBe(
      false,
    )
  })

  it('treats different compartments at the same level as incomparable', () => {
    const cyber = label('secret', ['cyber'])
    const defense = label('secret', ['defense'])
    expect(dominates(cyber, defense)).toBe(false)
    expect(dominates(defense, cyber)).toBe(false)
  })
})

describe('bell-lapadula checks', () => {
  const level = findLevel('read-down-write-up')
  const policy = SOLUTIONS['read-down-write-up'].policy

  it('reads down and writes up, never the reverse', () => {
    const analystReadsThreat = checkStep(level, policy, {
      agent: 'analyst',
      action: 'read',
      file: 'threat',
    })
    expect(analystReadsThreat).toMatchObject({ allowed: true })
    expect(analystReadsThreat.reason).toMatch(/^Read down/)
    const analystWritesThreat = checkStep(level, policy, {
      agent: 'analyst',
      action: 'write',
      file: 'threat',
    })
    expect(analystWritesThreat).toMatchObject({ allowed: false })
    expect(analystWritesThreat.reason).toMatch(/^No write down/)
    expect(checkStep(level, policy, { agent: 'guard', action: 'write', file: 'ops' }).allowed).toBe(
      true,
    )
  })
})

describe('the trojan horse', () => {
  it('leaks under discretionary control even with a policy that matches the work', () => {
    const level = findLevel('the-gift')
    const events = simulateDay(level, level.startPolicy)
    expect(outcomeOf(events, 'a1')).toBe('leaked')
    expect(events.filter((event) => event.outcome === 'blocked')).toHaveLength(0)
  })

  it('is stopped by the star property, while bell-lapadula still allows tampering', () => {
    const level = findLevel('compartments')
    const events = simulateDay(level, SOLUTIONS.compartments.policy)
    const trojan = events.find((event) => event.id === 'a2')
    expect(trojan.outcome).toBe('stopped')
    expect(trojan.steps.map((step) => step.allowed)).toEqual([true, false, null])
    expect(trojan.steps[2].reason).toMatch(/earlier step was blocked/)
    expect(outcomeOf(events, 'i1')).toBe('tampered')
  })

  it('reports no verdict for any step after the first blocked one', () => {
    const level = findLevel('the-gift')
    const noRead = {
      grants: [
        { subject: 'cfo', object: 'board', rights: ['w'] },
        { subject: 'manager', object: 'board', rights: ['r'] },
      ],
    }
    const trojan = simulateDay(level, noRead).find((event) => event.id === 'a1')
    expect(trojan.outcome).toBe('stopped')
    expect(trojan.steps.map((step) => step.allowed)).toEqual([false, null, null])
  })
})

describe('writing up needs dominance, not just a higher level', () => {
  const level = findLevel('compartments')
  const secretCyber = { agent: 'analyst', action: 'write', file: 'defense' }
  const higherButOtherCompartment = {
    objectLabels: {
      ...SOLUTIONS.compartments.policy.objectLabels,
      defense: label('top-secret', ['defense']),
    },
  }

  it('denies a write to a higher file that lacks the writer category', () => {
    expect(checkStep(level, higherButOtherCompartment, secretCyber).allowed).toBe(false)
  })

  it('teaches the same rule in the clerk prediction', () => {
    const { explanation } = level.predictions.find((prompt) => prompt.id === 'p3')
    expect(explanation).not.toMatch(/always allowed/)
    expect(explanation).toMatch(/dominates/)
  })
})

describe('role-based checks', () => {
  const level = findLevel('roles-not-people')

  it('grants permissions through assigned roles only', () => {
    const policy = SOLUTIONS['roles-not-people'].policy
    const allowed = checkStep(level, policy, { agent: 'ada', action: 'write', file: 'ops' })
    expect(allowed).toMatchObject({ allowed: true })
    expect(allowed.reason).toContain('Operator')
    expect(checkStep(level, policy, { agent: 'cy', action: 'read', file: 'ops' }).allowed).toBe(
      false,
    )
  })

  it('flags an agent holding both sides of a separated duty', () => {
    const policy = {
      roles: [
        { id: 'boss', name: 'Boss', permissions: ['write-register', 'read-audit', 'write-ops'] },
      ],
      assignments: [{ agent: 'cy', roleIds: ['boss'] }],
    }
    expect(findDutyConflicts(level, policy)).toHaveLength(2)
    expect(findDutyConflicts(level, SOLUTIONS['roles-not-people'].policy)).toEqual([])
  })
})

describe('level data', () => {
  it('has six levels, two per act, each with a known solution', () => {
    expect(LEVELS.map((level) => level.act)).toEqual([1, 1, 2, 2, 3, 3])
    expect(Object.keys(SOLUTIONS).sort()).toEqual(LEVELS.map((level) => level.id).sort())
  })

  it('only names agents and files that exist in the level', () => {
    for (const level of LEVELS) {
      const agentIds = level.agents.map((agent) => agent.id)
      const fileIds = level.files.map((file) => file.id)
      for (const event of level.day)
        for (const step of event.steps) {
          expect(agentIds, `${level.id} ${event.id}`).toContain(step.agent)
          expect(fileIds, `${level.id} ${event.id}`).toContain(step.file)
        }
    }
  })

  it('marks the unix mode calls as non-examinable and credits separation of duties to the team', () => {
    const matrix = findLevel('the-matrix')
    for (const id of ['p2', 'p3']) {
      const prompt = matrix.predictions.find((item) => item.id === id)
      expect(prompt.context).toMatch(/not examinable/)
      expect(prompt.explanation).toMatch(/non-examinable/)
    }
    expect(matrix.brief).toMatch(/Authentication/)
    const duty = findLevel('roles-not-people').takeaways.find((text) => /Separation/.test(text))
    expect(duty).toMatch(/team design/)
  })

  it('keeps the day script and answers out of the public level', () => {
    for (const level of LEVELS) {
      const payload = JSON.stringify(publicLevel(level))
      for (const event of level.day.filter((item) => item.kind !== 'work'))
        expect(payload).not.toContain(event.story)
      for (const prompt of level.predictions) expect(payload).not.toContain(prompt.explanation)
      expect(payload).not.toContain('"answer"')
      expect(payload).not.toContain('takeaways')
      expect(payload).not.toContain('unavoidableWorkLoss')
    }
  })
})
