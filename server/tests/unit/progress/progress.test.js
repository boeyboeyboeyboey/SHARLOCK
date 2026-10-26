import { describe, expect, it } from 'vitest'
import { deriveAchievements } from '../../../src/modules/progress/achievements.js'
import { summarizeGame, summarizeTopics } from '../../../src/modules/progress/points.js'

let counter = 0
function attempt(overrides = {}) {
  counter += 1
  return {
    gameId: 'game-a',
    rulesetVersion: 'v1',
    score: 5,
    maxScore: 10,
    completedAt: new Date(Date.UTC(2026, 0, counter)),
    topicOutcomes: [],
    ...overrides,
  }
}

describe('game points', () => {
  it('is zero with no completed attempts', () => {
    expect(summarizeGame('game-a', [])).toMatchObject({ points: 0, completedCount: 0 })
  })

  it('uses the best ratio within the latest ruleset only', () => {
    const attempts = [
      attempt({ rulesetVersion: 'v1', score: 100, maxScore: 100 }),
      attempt({ rulesetVersion: 'v2', score: 3, maxScore: 10 }),
      attempt({ rulesetVersion: 'v2', score: 7, maxScore: 20 }),
      attempt({ gameId: 'game-b', score: 10, maxScore: 10 }),
    ]
    const summary = summarizeGame('game-a', attempts)
    expect(summary).toMatchObject({ bestScore: 7, maxScore: 20, points: 35, completedCount: 3 })
    expect(summary.lastCompletedAt).toEqual(attempts[2].completedAt)
  })

  it('aggregates topics sorted by name', () => {
    const attempts = [
      attempt({
        topicOutcomes: [
          { topic: 'b', achieved: true },
          { topic: 'a', achieved: false },
        ],
      }),
      attempt({ topicOutcomes: [{ topic: 'a', achieved: true }] }),
    ]
    expect(summarizeTopics(attempts)).toEqual([
      { topic: 'a', attempted: 2, passed: 1 },
      { topic: 'b', attempted: 1, passed: 1 },
    ])
  })
})

describe('achievements', () => {
  it('earns nothing without attempts', () => {
    expect(deriveAchievements([])).toEqual([])
  })

  it('records the earning attempt time for each criterion', () => {
    const attempts = [
      attempt({ gameId: 'g1' }),
      attempt({ gameId: 'g1', score: 10, maxScore: 10 }),
      attempt({ gameId: 'g2', topicOutcomes: [{ topic: 't', achieved: true }] }),
      attempt({ gameId: 'g3' }),
      attempt({ gameId: 'g3' }),
    ]
    const earned = Object.fromEntries(deriveAchievements(attempts).map((a) => [a.key, a.earnedAt]))
    expect(earned).toEqual({
      'first-clue': attempts[0].completedAt,
      'perfect-case': attempts[1].completedAt,
      'well-rounded': attempts[3].completedAt,
      'persistent-detective': attempts[4].completedAt,
      'topic-expert': attempts[2].completedAt,
    })
  })

  it('does not award topic expert for empty or failed outcomes and is deterministic', () => {
    const attempts = [
      attempt({ topicOutcomes: [] }),
      attempt({ topicOutcomes: [{ topic: 't', achieved: false }] }),
    ]
    const first = deriveAchievements(attempts)
    expect(first.map((a) => a.key)).toEqual(['first-clue'])
    expect(deriveAchievements(attempts)).toEqual(first)
  })
})
