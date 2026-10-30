import { describe, expect, it } from 'vitest'
import { gameCatalog } from '../../../data/gameCatalog.js'
import { npcs } from '../../hub/scenes/wharf/npcs.js'
import { finds } from '../../hub/scenes/wharf/finds.js'
import { DISCOVERY_TOTAL } from '../../hub/discoveries.js'
import { fixedNpcBlocks, footBlock, TALK_RANGE, townFinds, townNpcs } from '../townNpcs.js'
import { createTownWalk, doorPoint } from '../townWalk.js'

// ground and scenery only, so each person is checked against the props they stand beside
const walk = createTownWalk(gameCatalog)

describe('2d townsfolk', () => {
  it('place every hub townsperson with the hub id, name and lines', () => {
    expect(townNpcs.map((npc) => npc.id)).toEqual(npcs.map((npc) => npc.id))
    townNpcs.forEach((npc, index) => {
      expect(npc.name).toBe(npcs[index].name)
      expect(npc.lines).toBe(npcs[index].lines)
    })
  })

  it('stand on walkable ground and follow walkable routes', () => {
    for (const npc of townNpcs) {
      expect(walk.walkable(npc.x, npc.y), npc.id).toBe(true)
      for (const [x, y] of npc.route) expect(walk.walkable(x, y), npc.id).toBe(true)
    }
  })

  it('keeps one keeper per game, clear of its own door prompt', () => {
    const keepers = townNpcs.filter((npc) => npc.kind === 'game')
    expect(keepers.map((npc) => npc.gameId).sort()).toEqual(gameCatalog.map((g) => g.id).sort())
    for (const keeper of keepers) {
      const game = gameCatalog.find((item) => item.id === keeper.gameId)
      const door = doorPoint(game)
      expect(Math.hypot(keeper.x - door.x, keeper.y - door.y)).toBeGreaterThan(TALK_RANGE)
      expect(walk.doorAt({ x: keeper.x, y: keeper.y })).toBeNull()
    }
  })

  it('leaves a free spot next to every keeper to talk from', () => {
    const blocked = createTownWalk(gameCatalog, { fixed: fixedNpcBlocks })
    for (const keeper of townNpcs.filter((npc) => npc.kind === 'game')) {
      const spots = [-30, 30].map((dx) => blocked.walkable(keeper.x + dx, keeper.y))
      expect(spots.some(Boolean), keeper.id).toBe(true)
      expect(blocked.walkable(keeper.x, keeper.y)).toBe(false)
    }
    expect(footBlock(100, 100).w).toBeGreaterThan(0)
  })
})

describe('2d discoveries', () => {
  it('share ids, names and lines with the hub finds and the discovery total', () => {
    expect(townFinds.map((find) => find.id)).toEqual(finds.map((find) => find.id))
    expect(townFinds).toHaveLength(DISCOVERY_TOTAL)
    townFinds.forEach((find, index) => expect(find.lines).toBe(finds[index].lines))
  })

  it('sit on walkable ground', () => {
    for (const find of townFinds) expect(walk.walkable(find.x, find.y), find.id).toBe(true)
  })
})
