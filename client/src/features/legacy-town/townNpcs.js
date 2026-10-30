import { npcs } from '../hub/scenes/wharf/npcs.js'
import { finds } from '../hub/scenes/wharf/finds.js'

// the hub's townsfolk and discoveries placed in the 2D town; ids, names, lines and styles come from the hub files
export const TALK_RANGE = 56
export const WANDER_SPEED = 30
export const NEAR_PAUSE = 80

// feet positions in world px; wanderer routes start at their post and loop
const NPC_PLACES = {
  'customs-officer': { x: 890, y: 386, facing: 'left' },
  'telegraph-clerk': { x: 226, y: 404, facing: 'right' },
  postmaster: { x: 860, y: 586, facing: 'left' },
  'police-constable': { x: 875, y: 770, facing: 'right' },
  publican: { x: 225, y: 606, facing: 'right' },
  'news-vendor': { x: 620, y: 206, facing: 'left' },
  fisherman: {
    route: [
      [330, 190],
      [250, 190],
    ],
  },
  lamplighter: {
    route: [
      [100, 300],
      [180, 300],
      [180, 340],
    ],
  },
  'gull-feeder': {
    route: [
      [1000, 210],
      [1060, 210],
      [1060, 260],
    ],
  },
  'street-sweeper': {
    route: [
      [500, 330],
      [500, 450],
    ],
  },
  'chimney-sweep': {
    route: [
      [610, 500],
      [610, 430],
      [590, 430],
    ],
  },
  'flower-seller': {
    route: [
      [460, 700],
      [460, 770],
      [490, 770],
    ],
  },
}

const FIND_PLACES = {
  'sticky-note': { x: 100, y: 260 },
  tailgater: { x: 50, y: 458, facing: 'right' },
  'usb-stick': { x: 1085, y: 600 },
  'shoulder-surfer': { x: 1080, y: 690, facing: 'left' },
  'open-telegraph': { x: 400, y: 770 },
  handbill: { x: 140, y: 775 },
}

export const townNpcs = npcs.map((npc) => {
  const place = NPC_PLACES[npc.id]
  const route = place.route ?? []
  const start = route[0] ?? [place.x, place.y]
  return {
    id: npc.id,
    name: npc.name,
    kind: npc.kind,
    gameId: npc.gameId,
    lines: npc.lines,
    style: npc.style,
    pause: npc.pause ?? 0,
    x: start[0],
    y: start[1],
    facing: place.facing ?? 'right',
    route,
  }
})

export const townFinds = finds.map((find) => ({
  ...find,
  ...FIND_PLACES[find.id],
  facing: FIND_PLACES[find.id].facing ?? 'right',
}))

// small block under the feet, like a prop
export const footBlock = (x, y) => ({ x: x - 14, y: y - 10, w: 28, h: 14 })

// blocks that never move: keepers and the two people among the finds
export const fixedNpcBlocks = [
  ...townNpcs.filter((npc) => !npc.route.length).map((npc) => footBlock(npc.x, npc.y)),
  ...townFinds.filter((find) => find.kind === 'npc').map((find) => footBlock(find.x, find.y)),
]
