import { describe, expect, it } from 'vitest'
import {
  parseBoardQuery,
  parseGamesQuery,
  parseRouteId,
} from '../../../src/modules/leaderboards/policy.js'

describe('parseBoardQuery', () => {
  it('applies defaults', () => {
    expect(parseBoardQuery({ gameId: 'phishing-post-mortem' })).toEqual({
      gameId: 'phishing-post-mortem',
      rulesetVersion: undefined,
      view: 'best',
      page: 1,
    })
  })

  it('accepts a full query', () => {
    expect(
      parseBoardQuery({ gameId: 'g1', rulesetVersion: 'v1.2', view: 'all-time', page: '3' }),
    ).toMatchObject({ rulesetVersion: 'v1.2', view: 'all-time', page: 3 })
  })

  it.each([
    [{}],
    [{ gameId: 'g1', extra: '1' }],
    [{ gameId: 'Bad_Id' }],
    [{ gameId: ['g1', 'g2'] }],
    [{ gameId: 'g1', view: 'weekly' }],
    [{ gameId: 'g1', view: ['best'] }],
    [{ gameId: 'g1', page: '0' }],
    [{ gameId: 'g1', page: '-1' }],
    [{ gameId: 'g1', page: '10001' }],
    [{ gameId: 'g1', page: '1.5' }],
    [{ gameId: 'g1', rulesetVersion: 'a b' }],
    [{ gameId: 'g1', rulesetVersion: { $ne: 'x' } }],
  ])('rejects %j', (query) => {
    expect(() => parseBoardQuery(query)).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('parseGamesQuery', () => {
  it('rejects any key', () => {
    expect(() => parseGamesQuery({})).not.toThrow()
    expect(() => parseGamesQuery({ page: '1' })).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('parseRouteId', () => {
  it('returns a uniform 404 for malformed ids', () => {
    expect(() => parseRouteId('nope')).toThrow(expect.objectContaining({ status: 404 }))
    expect(parseRouteId('A'.repeat(24).replaceAll('A', 'a'))).toHaveLength(24)
  })
})
