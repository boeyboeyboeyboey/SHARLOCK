import { describe, expect, it } from 'vitest'
import {
  ARENA as SERVER_ARENA,
  PLAYER_RADIUS as SERVER_RADIUS,
  walkable as serverWalkable,
} from '../../../../../../server/src/modules/games/botnet-tag/arena.js'
import { ARENA, PLAYER_RADIUS, walkable } from '../arenaData.js'

describe('client arena copy', () => {
  it('equals the server arena', () => {
    expect(ARENA).toEqual(SERVER_ARENA)
    expect(PLAYER_RADIUS).toBe(SERVER_RADIUS)
  })

  it('agrees with the server on walkable points', () => {
    for (let x = -23; x <= 23; x += 0.7) {
      for (let z = -17; z <= 17; z += 0.7) expect(walkable(x, z)).toBe(serverWalkable(x, z))
    }
    expect(walkable(Number.NaN, 0)).toBe(false)
  })
})
