import { describe, expect, it } from 'vitest'
import { gameCatalog } from '../../../data/gameCatalog.js'
import { buildingBlock, createTownWalk, doorPoint, SPAWN } from '../townWalk.js'

const walk = createTownWalk(gameCatalog)

describe('walkable ground', () => {
  it('starts on open street and refuses water, pond, fountain and building bodies', () => {
    expect(walk.walkable(SPAWN.x, SPAWN.y)).toBe(true)
    expect(walk.walkable(300, 100)).toBe(false)
    expect(walk.walkable(1000, 330)).toBe(false)
    expect(walk.walkable(560, 710)).toBe(false)
    expect(walk.walkable(-5, 400)).toBe(false)
    for (const game of gameCatalog) {
      const body = buildingBlock(game)
      expect(walk.walkable(body.x + body.w / 2, body.y + body.h / 2)).toBe(false)
    }
  })

  it('lets the pier under the newsstand be walked from the quay', () => {
    expect(walk.walkable(640, 60)).toBe(true)
    expect(walk.walkable(640, 190)).toBe(true)
  })

  it('leaves a strip in front of every door and reports the door there', () => {
    for (const game of gameCatalog) {
      const door = doorPoint(game)
      expect(walk.walkable(door.x, door.y + 4)).toBe(true)
      expect(walk.doorAt({ x: door.x, y: door.y + 4 })?.id).toBe(game.id)
    }
    expect(walk.doorAt(SPAWN)).toBeNull()
  })

  it('reaches every door from the start on an 8px grid', () => {
    const key = (x, y) => `${x},${y}`
    const seen = new Set([key(SPAWN.x, SPAWN.y)])
    const queue = [[SPAWN.x, SPAWN.y]]
    while (queue.length) {
      const [x, y] = queue.shift()
      for (const [dx, dy] of [
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
      ]) {
        const next = [x + dx, y + dy]
        if (seen.has(key(...next)) || !walk.walkable(...next)) continue
        seen.add(key(...next))
        queue.push(next)
      }
    }
    for (const game of gameCatalog) {
      const door = doorPoint(game)
      const reached = [...seen].some((point) => {
        const [x, y] = point.split(',').map(Number)
        return Math.hypot(x - door.x, y - (door.y + 4)) < 12
      })
      expect(reached, game.id).toBe(true)
    }
  })
})

describe('slide', () => {
  it('takes the whole step in the open', () => {
    expect(walk.slide({ x: 560, y: 500 }, { x: 562, y: 502 })).toEqual({ x: 562, y: 502 })
  })

  it('keeps moving along a wall instead of stopping', () => {
    // the pier edge at x 456 blocks sideways movement but not downwards
    const next = walk.slide({ x: 458, y: 100 }, { x: 452, y: 106 })
    expect(next).toEqual({ x: 458, y: 106 })
  })

  it('stays put when every direction is blocked', () => {
    expect(walk.slide({ x: 458, y: 14 }, { x: 452, y: 8 })).toEqual({ x: 458, y: 14 })
  })
})
