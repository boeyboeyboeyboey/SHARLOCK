import { describe, expect, it } from 'vitest'
import { buildBoard, rankAllTime, rankBest } from '../../../src/modules/leaderboards/rank.js'

const names = ['ann', 'bob', 'cy', 'dee']
const students = new Map(names.map((name) => [name, { username: name, avatarId: 'mint' }]))

let tick = 0
function attempt(playerId, score, over = {}) {
  tick += 1
  return {
    playerId,
    score,
    maxScore: 10,
    completedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, tick)),
    competitiveEligible: true,
    ...over,
  }
}

describe('rankBest', () => {
  it('keeps one best row per student', () => {
    const rows = rankBest({
      attempts: [attempt('ann', 3), attempt('ann', 8), attempt('ann', 5), attempt('bob', 6)],
      students,
    })
    expect(rows.map((row) => [row.username, row.score, row.rank])).toEqual([
      ['ann', 8, 1],
      ['bob', 6, 2],
    ])
  })

  it('shares ranks on equal scores and skips the next rank', () => {
    const rows = rankBest({
      attempts: [attempt('ann', 9), attempt('bob', 9), attempt('cy', 4)],
      students,
    })
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3])
  })

  it('orders ties by earliest completion of the best score, then username', () => {
    const early = attempt('bob', 7)
    const late = attempt('ann', 7)
    expect(rankBest({ attempts: [late, early], students }).map((row) => row.username)).toEqual([
      'bob',
      'ann',
    ])
    const same = new Date('2026-10-02T00:00:00Z')
    const rows = rankBest({
      attempts: [
        attempt('bob', 7, { completedAt: same }),
        attempt('ann', 7, { completedAt: same }),
      ],
      students,
    })
    expect(rows.map((row) => row.username)).toEqual(['ann', 'bob'])
  })

  it('uses the earliest of repeated best scores', () => {
    const rows = rankBest({
      attempts: [attempt('ann', 7), attempt('bob', 7), attempt('ann', 7)],
      students,
    })
    expect(rows.map((row) => row.username)).toEqual(['ann', 'bob'])
  })

  it('filters to competitive attempts only when asked', () => {
    const attempts = [attempt('ann', 9, { competitiveEligible: false }), attempt('bob', 4)]
    expect(rankBest({ attempts, students, competitiveOnly: true }).map((r) => r.username)).toEqual([
      'bob',
    ])
    expect(rankBest({ attempts, students, competitiveOnly: false })).toHaveLength(2)
  })

  it('ignores players outside the eligible set', () => {
    expect(rankBest({ attempts: [attempt('zed', 9)], students })).toEqual([])
  })
})

describe('rankAllTime', () => {
  it('sums rounded percentages, counts plays and reports the best attempt', () => {
    const rows = rankAllTime({
      attempts: [attempt('ann', 5), attempt('ann', 10), attempt('ann', 3), attempt('bob', 6)],
      students,
    })
    expect(rows[0]).toMatchObject({
      username: 'ann',
      points: 50 + 100 + 30,
      plays: 3,
      bestScore: 10,
      maxScore: 10,
      rank: 1,
    })
    expect(rows[1]).toMatchObject({ username: 'bob', points: 60, plays: 1, rank: 2 })
  })

  it('orders ties by username and shares the rank', () => {
    const rows = rankAllTime({
      attempts: [attempt('cy', 5), attempt('bob', 5), attempt('ann', 1)],
      students,
    })
    expect(rows.map((row) => [row.username, row.rank])).toEqual([
      ['bob', 1],
      ['cy', 1],
      ['ann', 3],
    ])
  })

  it('scores a zero max score as zero points', () => {
    const rows = rankAllTime({ attempts: [attempt('ann', 0, { maxScore: 0 })], students })
    expect(rows[0].points).toBe(0)
  })
})

describe('buildBoard', () => {
  const many = new Map(
    Array.from({ length: 30 }, (_, index) => {
      const name = `u${String(index).padStart(2, '0')}`
      return [name, { username: name, avatarId: 'mint' }]
    }),
  )
  const attempts = [...many.keys()].map((id, index) => attempt(id, index % 11))

  it('pages after ranking and reports the caller off-page', () => {
    const base = { attempts, students: many, view: 'best', callerId: 'u00', pageSize: 25 }
    const first = buildBoard({ ...base, page: 1 })
    const second = buildBoard({ ...base, page: 2 })
    expect(first.rows).toHaveLength(25)
    expect(second.rows).toHaveLength(5)
    expect(first.total).toBe(30)
    expect(first.rows.some((row) => row.isSelf)).toBe(false)
    expect(first.me).toMatchObject({ username: 'u00', isSelf: true })
  })

  it('returns null me for an unranked caller and exact row keys', () => {
    const board = buildBoard({
      attempts: [attempt('ann', 5)],
      students,
      view: 'best',
      callerId: 'bob',
      page: 1,
    })
    expect(board.me).toBeNull()
    expect(Object.keys(board.rows[0]).sort()).toEqual(
      ['avatarId', 'isSelf', 'maxScore', 'rank', 'score', 'username'].sort(),
    )
    const allTime = buildBoard({
      attempts: [attempt('ann', 5)],
      students,
      view: 'all-time',
      callerId: 'ann',
      page: 1,
    })
    expect(Object.keys(allTime.rows[0]).sort()).toEqual(
      ['avatarId', 'bestScore', 'isSelf', 'maxScore', 'plays', 'points', 'rank', 'username'].sort(),
    )
  })

  it('returns an empty page past the end', () => {
    const board = buildBoard({ attempts, students: many, view: 'best', callerId: 'x', page: 9 })
    expect(board.rows).toEqual([])
    expect(board.total).toBe(30)
  })
})
