import { describe, expect, it } from 'vitest'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../../src/modules/profile/how-to-play.js'
import { ProfileError, parseHowToPlayInput } from '../../../src/modules/profile/policy.js'

describe('how to play policy', () => {
  it('lists exactly the scored game ids in the attempts registry', () => {
    const registryIds = createProductionAttemptRegistry().entries.map((entry) => entry.id)
    expect([...HOW_TO_PLAY_GAME_IDS].sort()).toEqual([...new Set(registryIds)].sort())
  })

  it.each(HOW_TO_PLAY_GAME_IDS)('accepts %s with a boolean flag', (gameId) => {
    expect(parseHowToPlayInput(gameId, { dismissed: true })).toEqual({ gameId, dismissed: true })
    expect(parseHowToPlayInput(gameId, { dismissed: false }).dismissed).toBe(false)
  })

  it.each(['threat-briefing', '', '__proto__', '$where', undefined, 42])(
    'rejects game id %s',
    (gameId) => {
      expect(() => parseHowToPlayInput(gameId, { dismissed: true })).toThrow(ProfileError)
    },
  )

  it.each([
    null,
    [],
    'true',
    {},
    { dismissed: 'true' },
    { dismissed: 1 },
    { dismissed: true, extra: 1 },
    { dismissed: true, __proto__: { x: 1 }, gameId: 'x' },
  ])('rejects body %j', (body) => {
    expect(() => parseHowToPlayInput('clearance-tower', body)).toThrow(ProfileError)
  })
})
