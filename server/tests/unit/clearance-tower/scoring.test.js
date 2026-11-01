import { describe, expect, it } from 'vitest'
import { findLevel, LEVELS } from '../../../src/modules/games/clearance-tower/levels.js'
import {
  LEGACY_SCORING_RULES,
  scoreLevel,
  starsFor,
} from '../../../src/modules/games/clearance-tower/scoring.js'
import { simulateDay } from '../../../src/modules/games/clearance-tower/simulate.js'
import { SOLUTIONS } from './solutions.js'

function play(levelId, policy, predictions) {
  const level = findLevel(levelId)
  return scoreLevel(level, policy, predictions, simulateDay(level, policy))
}

function legacyPlay(levelId, policy, predictions) {
  const level = findLevel(levelId)
  const events = simulateDay(level, policy)
  return scoreLevel(level, policy, predictions, events, 0, LEGACY_SCORING_RULES)
}

const correctCalls = (level) =>
  Object.fromEntries(level.predictions.map((prompt) => [prompt.id, prompt.answer]))

// every subject and object pair takes one of four right sets, so a level has 4^(agents*files) policies
function everyGrantPolicy(level) {
  const pairs = level.agents.flatMap((agent) =>
    level.files.map((file) => ({ subject: agent.id, object: file.id })),
  )
  const rightSets = [[], ['r'], ['w'], ['r', 'w']]
  return Array.from({ length: rightSets.length ** pairs.length }, (_, code) => ({
    grants: pairs.flatMap((pair, index) => {
      const rights = rightSets[Math.floor(code / rightSets.length ** index) % rightSets.length]
      return rights.length ? [{ ...pair, rights }] : []
    }),
  }))
}

function everyLabelPolicy(level) {
  const ids = ['unclassified', 'confidential', 'secret', 'top-secret']
  const files = level.files.map((file) => file.id)
  return Array.from({ length: ids.length ** files.length }, (_, code) => ({
    objectLabels: Object.fromEntries(
      files.map((file, index) => [
        file,
        { level: ids[Math.floor(code / ids.length ** index) % ids.length], categories: [] },
      ]),
    ),
  }))
}

describe('clear-4 balance, checked over every policy of the small levels', () => {
  const gift = findLevel('the-gift')
  const calls = correctCalls(gift)
  const giftPolicies = everyGrantPolicy(gift)
  const giftScores = giftPolicies.map((policy) => ({
    policy,
    result: play('the-gift', policy, calls),
  }))

  it('covers all 256 policies of the gift and reaches 100 as the best score', () => {
    expect(giftPolicies).toHaveLength(256)
    expect(Math.max(...giftScores.map(({ result }) => result.score))).toBe(100)
  })

  it('needs exactly the three blocked tasks the level allows for', () => {
    const leakFree = giftScores.filter(({ result }) => result.meters.leaks === 0)
    const fewestBlocked = Math.min(
      ...leakFree.map(({ result }) => result.meters.workTotal - result.meters.workDone),
    )
    expect(fewestBlocked).toBe(gift.unavoidableWorkLoss)
  })

  it('scores the unchanged gift below the mastery line, with a wide gap to a fix', () => {
    const unchanged = play('the-gift', gift.startPolicy, calls)
    expect(unchanged).toMatchObject({ score: 60, stars: 1 })
    expect(unchanged.meters).toMatchObject({ leaks: 1, topicBlockedByLeak: true })
    const fixed = play('the-gift', SOLUTIONS['the-gift'].policy, calls)
    expect(fixed).toMatchObject({ score: 100, stars: 3 })
    expect(fixed.meters).toMatchObject({ leaks: 0, workDone: 7, workAllowance: 3 })
    expect(fixed.score - unchanged.score).toBe(40)
  })

  it('keeps every leaking gift policy below the mastery line', () => {
    const leaking = giftScores.filter(({ result }) => result.meters.leaks > 0)
    expect(leaking.length).toBeGreaterThan(0)
    expect(Math.max(...leaking.map(({ result }) => result.score))).toBeLessThan(75)
  })

  it.each(['the-matrix', 'the-gift', 'roles-not-people', 'reshuffle'])(
    'gives %s almost nothing for an empty policy with correct calls',
    (levelId) => {
      const level = findLevel(levelId)
      const empty = level.model === 'dac' ? { grants: [] } : { roles: [], assignments: [] }
      const result = play(levelId, empty, correctCalls(level))
      expect(result).toMatchObject({ score: 15, stars: 0 })
      expect(result.meters.leaks).toBe(0)
    },
  )

  it('shrinks the security rows only when under three quarters of the work is done', () => {
    const { policy, predictions } = SOLUTIONS['the-matrix']
    const missing = (count) => ({ grants: policy.grants.slice(0, -count) })
    // the last two grants hold one task each: the payroll check and the menu read
    expect(play('the-matrix', missing(1), predictions).meters.securityShare).toBe(1)
    expect(play('the-matrix', missing(2), predictions).meters.securityShare).toBeCloseTo(
      5 / 7 / 0.75,
    )
  })

  it('never lowers a leak-free policy that gets at least three quarters of the work done', () => {
    const cases = [
      ['the-gift', giftPolicies],
      ['read-down-write-up', everyLabelPolicy(findLevel('read-down-write-up'))],
    ]
    for (const [levelId, policies] of cases) {
      const level = findLevel(levelId)
      for (const policy of policies) {
        const now = play(levelId, policy, correctCalls(level))
        if (now.meters.leaks === 0 && now.meters.securityShare === 1)
          expect(now.score).toBeGreaterThanOrEqual(
            legacyPlay(levelId, policy, correctCalls(level)).score,
          )
      }
    }
  })
})

describe('clear-2 and clear-3 scoring stays as saved', () => {
  it('still scores the unchanged gift 80 and the best fix 91', () => {
    const { policy, predictions } = SOLUTIONS['the-gift']
    expect(legacyPlay('the-gift', findLevel('the-gift').startPolicy, predictions)).toMatchObject({
      score: 80,
      stars: 2,
    })
    expect(legacyPlay('the-gift', policy, predictions)).toMatchObject({ score: 91, stars: 2 })
  })

  it('still scores an empty policy 70 and a single leak at half the row', () => {
    const { policy, predictions } = SOLUTIONS['the-matrix']
    expect(legacyPlay('the-matrix', { grants: [] }, predictions).score).toBe(70)
    const leaky = {
      grants: [...policy.grants, { subject: 'contractor', object: 'payroll', rights: ['r'] }],
    }
    const row = legacyPlay('the-matrix', leaky, predictions).breakdown[0]
    expect(row).toEqual({ key: 'leaks', label: 'No leaks', max: 40, points: 20 })
  })

  it('adds none of the clear-4 meters', () => {
    const { policy, predictions } = SOLUTIONS['the-gift']
    expect(legacyPlay('the-gift', policy, predictions).meters).not.toHaveProperty('workAllowance')
  })
})

describe('clearance tower scoring', () => {
  it.each(LEVELS.map((level) => level.id))('scores the known solution for %s', (levelId) => {
    const { policy, predictions, score } = SOLUTIONS[levelId]
    const result = play(levelId, policy, predictions)
    expect(result.score).toBe(score)
    expect(result.meters.leaks).toBe(0)
    expect(result.breakdown.reduce((total, row) => total + row.max, 0)).toBe(100)
  })

  it('charges for excess rights and wrong predictions', () => {
    const { policy } = SOLUTIONS['the-matrix']
    const generous = {
      grants: [...policy.grants, { subject: 'contractor', object: 'payroll', rights: ['r', 'w'] }],
    }
    const result = play('the-matrix', generous, { p1: 'allow', p2: 'deny', p3: 'allow' })
    expect(result.meters).toMatchObject({ leaks: 1, excessRights: 2, correctPredictions: 2 })
    expect(result.breakdown).toEqual([
      { key: 'leaks', label: 'No leaks', max: 40, points: 0 },
      { key: 'work', label: 'Work completed', max: 30, points: 30 },
      { key: 'privilege', label: 'Least privilege', max: 15, points: 5 },
      { key: 'predictions', label: 'Predictions', max: 15, points: 10 },
    ])
  })

  it('never goes below zero when everything leaks', () => {
    const everything = {
      grants: findLevel('the-matrix').agents.flatMap((agent) =>
        findLevel('the-matrix').files.map((file) => ({
          subject: agent.id,
          object: file.id,
          rights: ['r', 'w'],
        })),
      ),
    }
    const result = play('the-matrix', everything, { p1: 'allow', p2: 'allow', p3: 'deny' })
    expect(result.breakdown.find((row) => row.key === 'leaks').points).toBe(0)
    expect(result.breakdown.find((row) => row.key === 'privilege').points).toBe(0)
    expect(result.score).toBe(30)
  })

  it('gives mandatory levels no privilege row and scores predictions out of 30', () => {
    const { policy, predictions } = SOLUTIONS.compartments
    const result = play('compartments', policy, predictions)
    expect(result.breakdown.map((row) => row.key)).toEqual(['leaks', 'work', 'predictions'])
    expect(result.meters.tampering).toBe(1)
  })

  it('compares badge edits with matrix edits after the reshuffle', () => {
    const { policy, predictions } = SOLUTIONS.reshuffle
    expect(play('reshuffle', policy, predictions).edits).toEqual({ badgeEdits: 6, matrixEdits: 10 })
  })

  it('counts separation of duties conflicts against least privilege', () => {
    const { policy, predictions } = SOLUTIONS.reshuffle
    const doubleBadge = {
      ...policy,
      assignments: policy.assignments.map((entry) =>
        entry.agent === 'dee' ? { agent: 'dee', roleIds: ['security', 'auditor'] } : entry,
      ),
    }
    const result = play('reshuffle', doubleBadge, predictions)
    expect(result.meters.dutyConflicts).toHaveLength(1)
    expect(result.meters.leaks).toBe(1)
  })

  it('maps scores to stars', () => {
    expect([100, 95, 94, 75, 74, 50, 49, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0, 0])
  })
})
