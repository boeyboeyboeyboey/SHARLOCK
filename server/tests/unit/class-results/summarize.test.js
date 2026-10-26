import { describe, expect, it } from 'vitest'
import { parseAttemptsQuery, parseSummaryQuery } from '../../../src/modules/class-results/policy.js'
import { summarizeClass } from '../../../src/modules/class-results/service.js'

const students = [
  { id: 'a', username: 'ann', avatarId: 'mint' },
  { id: 'b', username: 'bob', avatarId: 'mint' },
  { id: 'c', username: 'cy', avatarId: 'mint' },
]

function attempt(playerId, over = {}) {
  return {
    playerId,
    gameId: 'g1',
    rulesetVersion: 'v1',
    score: 5,
    maxScore: 10,
    completedAt: new Date('2026-10-01T00:00:00Z'),
    topicOutcomes: [{ topic: 'x', achieved: true, feedbackCode: 'f' }],
    ...over,
  }
}

describe('summarizeClass', () => {
  it('reports registered games with no attempts as empty', () => {
    const result = summarizeClass({ gameIds: ['g1'], students, attemptsNewestFirst: [] })
    expect(result.games).toEqual([
      {
        gameId: 'g1',
        rulesetVersion: null,
        studentsAttempted: 0,
        averageBestPercent: null,
        topics: [],
      },
    ])
    expect(
      result.students.every((row) => row.completedAttempts === 0 && row.games.length === 0),
    ).toBe(true)
  })

  it('uses the newest ruleset version and the best attempt per student', () => {
    const attempts = [
      attempt('a', { rulesetVersion: 'v2', score: 3, completedAt: new Date('2026-10-05') }),
      attempt('a', { rulesetVersion: 'v2', score: 9, completedAt: new Date('2026-10-04') }),
      attempt('a', { rulesetVersion: 'v1', score: 10, completedAt: new Date('2026-10-03') }),
      attempt('b', { rulesetVersion: 'v1', score: 10, completedAt: new Date('2026-10-02') }),
    ]
    const { games, students: rows } = summarizeClass({
      gameIds: ['g1'],
      students,
      attemptsNewestFirst: attempts,
    })
    expect(games[0]).toMatchObject({
      rulesetVersion: 'v2',
      studentsAttempted: 1,
      averageBestPercent: 90,
    })
    expect(rows[0]).toMatchObject({
      completedAttempts: 3,
      games: [{ gameId: 'g1', bestPercent: 90 }],
    })
    expect(rows[1]).toMatchObject({ completedAttempts: 1, games: [] })
  })

  it('rounds the mean of best percents and counts topics per student', () => {
    const attempts = [
      attempt('a', { score: 1, maxScore: 3 }),
      attempt('b', {
        score: 2,
        maxScore: 3,
        topicOutcomes: [{ topic: 'x', achieved: false, feedbackCode: 'f' }],
      }),
      attempt('b', {
        score: 1,
        maxScore: 3,
        topicOutcomes: [{ topic: 'y', achieved: true, feedbackCode: 'f' }],
      }),
    ]
    const { games } = summarizeClass({ gameIds: ['g1'], students, attemptsNewestFirst: attempts })
    expect(games[0].averageBestPercent).toBe(50)
    expect(games[0].topics).toEqual([
      { topic: 'x', studentsAttempted: 2, studentsPassed: 1 },
      { topic: 'y', studentsAttempted: 1, studentsPassed: 1 },
    ])
  })

  it('never divides by a zero max score', () => {
    const { games, students: rows } = summarizeClass({
      gameIds: ['g1'],
      students,
      attemptsNewestFirst: [attempt('a', { score: 0, maxScore: 0 })],
    })
    expect(games[0]).toMatchObject({ studentsAttempted: 1, averageBestPercent: null })
    expect(rows[0].games).toEqual([{ gameId: 'g1', bestPercent: null }])
  })

  it('ignores attempts from players outside the counted students', () => {
    const { games } = summarizeClass({
      gameIds: ['g1'],
      students,
      attemptsNewestFirst: [attempt('zzz')],
    })
    expect(games[0].studentsAttempted).toBe(0)
  })
})

describe('query parsing', () => {
  it('accepts valid and rejects bad shapes', () => {
    expect(parseSummaryQuery({})).toEqual({ page: 1 })
    expect(parseSummaryQuery({ page: '3' })).toEqual({ page: 3 })
    for (const query of [
      { page: '0' },
      { page: 'x' },
      { page: ['1'] },
      { x: '1' },
      { page: '10001' },
    ]) {
      expect(() => parseSummaryQuery(query)).toThrow()
    }
    expect(parseAttemptsQuery({ gameId: 'g1' }, ['g1'])).toEqual({ gameId: 'g1', page: 1 })
    expect(() => parseAttemptsQuery({ gameId: 'nope' }, ['g1'])).toThrow()
    expect(() => parseAttemptsQuery({ gameId: { $ne: 'x' } }, ['g1'])).toThrow()
  })
})
