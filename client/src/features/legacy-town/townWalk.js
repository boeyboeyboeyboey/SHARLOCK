import { TOWN_SIZE } from '../../data/gameCatalog.js'
import { buildingArt, townBushes, townTrees } from './townArt.js'

export const WALK_SPEED = 120
export const SPAWN = { x: 560, y: 596 }
// feet position that counts as standing at a door, relative to its ground point
const DOOR_REACH = { side: 40, above: 10, below: 44 }

// walkable ground in world px: everything below the quay, plus the pier under the newsstand
const GROUND = [
  { x: 8, y: 172, w: TOWN_SIZE.width - 16, h: TOWN_SIZE.height - 172 - 6 },
  { x: 456, y: 12, w: 208, h: 170 },
]

// scenery that blocks feet; rects follow the art in townArt.js (pond, fountain, props, trunks)
const SCENERY = [
  { x: 948, y: 302, w: 104, h: 60 },
  { x: 520, y: 676, w: 80, h: 72 },
  { x: 36, y: 372, w: 112, h: 70 },
  { x: 48, y: 592, w: 128, h: 56 },
  { x: 736, y: 690, w: 80, h: 54 },
  { x: 172, y: 684, w: 56, h: 28 },
  { x: 940, y: 446, w: 64, h: 50 },
  ...townTrees.map((tree) => ({ x: tree.x + 20, y: tree.y + 56, w: 24, h: 24 })),
  ...townBushes.map((bush) => ({ x: bush.x + 8, y: bush.y + 18, w: 48, h: 20 })),
]

const inside = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h

export function doorPoint(game) {
  return { x: game.building.x + 96, y: game.building.y + 200 }
}

// the body stops a few px above the ground line, leaving a strip in front of the door
export function buildingBlock(game) {
  const { x, y, type } = game.building
  const art = buildingArt(type)
  const half = Math.min(art.width, 176) / 2 - 16
  const top = y + 200 - Math.round(art.height * 0.62)
  return { x: x + 96 - half, y: top, w: half * 2, h: y + 194 - top }
}

export function createTownWalk(games) {
  const blocks = [...SCENERY, ...games.map(buildingBlock)]

  function walkable(x, y) {
    return GROUND.some((rect) => inside(rect, x, y)) && !blocks.some((rect) => inside(rect, x, y))
  }

  // try the whole step, then each axis alone so walls are slid along; stay put when boxed in
  function slide(from, to) {
    if (walkable(to.x, to.y)) return { x: to.x, y: to.y }
    if (walkable(to.x, from.y)) return { x: to.x, y: from.y }
    if (walkable(from.x, to.y)) return { x: from.x, y: to.y }
    return { x: from.x, y: from.y }
  }

  // the building whose door the feet are standing at, nearest first
  function doorAt(pos) {
    let best = null
    let bestDistance = Infinity
    for (const game of games) {
      const door = doorPoint(game)
      const dx = pos.x - door.x
      const dy = pos.y - door.y
      if (Math.abs(dx) > DOOR_REACH.side || dy < -DOOR_REACH.above || dy > DOOR_REACH.below)
        continue
      const distance = Math.hypot(dx, dy)
      if (distance < bestDistance) {
        best = game
        bestDistance = distance
      }
    }
    return best
  }

  return { walkable, slide, doorAt, blocks }
}
