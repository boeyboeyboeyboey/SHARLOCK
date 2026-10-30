import { describe, expect, it } from 'vitest'
import {
  achievementCatalogue,
  achievementKeys,
  deriveAchievements,
} from '../../../src/modules/progress/achievements.js'
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
  describe('first close and timed run', () => {
    const closeGames = {
      'sql-injection-arcade': 'Customs cleared',
      'clearance-tower': 'Tower cleared',
      'phishing-post-mortem': 'Post sorted',
      'cli-cyber-defender': 'Wire held',
      'social-engineering-simulator': 'Talked down',
    }

    it.each(Object.entries(closeGames))(
      'awards %s on its first completed attempt',
      (gameId, name) => {
        const attempts = [
          attempt({ gameId: 'other', mode: 'practice' }),
          attempt({ gameId, mode: 'practice' }),
          attempt({ gameId, mode: 'practice' }),
        ]
        const found = deriveAchievements(attempts).find((a) => a.key === `first-close-${gameId}`)
        expect(found).toMatchObject({ name, earnedAt: attempts[1].completedAt })
        expect(found.description).toMatch(/^Finish a case in /)
      },
    )

    it('awards timed run only for a standard attempt on a competitive ruleset', () => {
      const isCompetitive = (gameId, version) => gameId === 'g1' && version === 'v9'
      const attempts = [
        attempt({ gameId: 'g1', rulesetVersion: 'v9', mode: 'practice' }),
        attempt({ gameId: 'g2', rulesetVersion: 'v9', mode: 'standard' }),
        attempt({ gameId: 'g1', rulesetVersion: 'v1', mode: 'standard' }),
      ]
      const keys = (list, options) => deriveAchievements(list, options).map((a) => a.key)
      expect(keys(attempts, { isCompetitive })).not.toContain('timed-run')
      expect(keys(attempts)).not.toContain('timed-run')

      const timed = attempt({ gameId: 'g1', rulesetVersion: 'v9', mode: 'standard' })
      const earned = deriveAchievements([...attempts, timed], { isCompetitive }).find(
        (a) => a.key === 'timed-run',
      )
      expect(earned).toMatchObject({ name: 'Against the clock', earnedAt: timed.completedAt })
    })
  })
})

describe('achievement catalogue', () => {
  it('lists every achievement without criteria', () => {
    expect(achievementCatalogue).toHaveLength(16)
    expect(achievementCatalogue.map((item) => item.key)).toEqual([...achievementKeys])
    for (const item of achievementCatalogue) {
      expect(Object.keys(item).sort()).toEqual(['description', 'key', 'name'])
      expect(Object.values(item).every((value) => typeof value === 'string' && value)).toBe(true)
      expect(Object.isFrozen(item)).toBe(true)
    }
  })
})

describe('botnet tag achievements', () => {
  const round = (state, overrides = {}) =>
    attempt({
      gameId: 'botnet-tag',
      rulesetVersion: '1',
      state: {
        outcome: 'infected',
        sideWon: false,
        patches: 0,
        tags: 0,
        startedInfected: false,
        cleanAtEnd: 3,
        ...state,
      },
      ...overrides,
    })
  const keys = (list) =>
    deriveAchievements(list)
      .map((a) => a.key)
      .filter((key) => key.startsWith('tag-'))

  it('awards nothing for a plain infected round', () => {
    expect(keys([round({})])).toEqual([])
  })

  it('awards untouchable for a clean survivor only', () => {
    expect(keys([round({ outcome: 'survived' })])).toEqual(['tag-untouchable'])
  })

  it('awards last one clean only when survivors win with exactly one clean player', () => {
    const win = { outcome: 'survived', sideWon: true }
    expect(keys([round({ ...win, cleanAtEnd: 1 })])).toContain('tag-last-one-clean')
    expect(keys([round({ ...win, cleanAtEnd: 2 })])).not.toContain('tag-last-one-clean')
    expect(keys([round({ outcome: 'survived', sideWon: false, cleanAtEnd: 1 })])).not.toContain(
      'tag-last-one-clean',
    )
    expect(keys([round({ ...win, cleanAtEnd: undefined })])).not.toContain('tag-last-one-clean')
  })

  it('draws the tag and patch thresholds at 3 and 4', () => {
    expect(keys([round({ tags: 2, patches: 3 })])).toEqual([])
    expect(keys([round({ tags: 3 })])).toEqual(['tag-super-spreader'])
    expect(keys([round({ patches: 4 })])).toEqual(['tag-firewall'])
  })

  it('awards patient zero wins only for a botnet win that started infected', () => {
    expect(keys([round({ startedInfected: true, sideWon: true })])).toEqual([
      'tag-patient-zero-wins',
    ])
    expect(keys([round({ startedInfected: false, sideWon: true })])).toEqual([])
    expect(keys([round({ startedInfected: true, sideWon: false })])).toEqual([])
  })

  it('ignores the same counters on another game and attempts without state', () => {
    expect(keys([round({ tags: 9, patches: 9 }, { gameId: 'game-a' })])).toEqual([])
    expect(keys([attempt({ gameId: 'botnet-tag' })])).toEqual([])
  })
})
