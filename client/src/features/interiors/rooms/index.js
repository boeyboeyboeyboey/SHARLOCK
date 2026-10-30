// registry of interior rooms keyed by game id; each entry lazily loads its builder
// a builder is (ctx) => { camera, update(dt, time), dispose() } where ctx has scene, engine, tier, budget, reduced

import { cliHero, phishingHero, sqlHero } from './heroes.js'

export const ROOM_IDS = [
  'cli-cyber-defender',
  'phishing-post-mortem',
  'sql-injection-arcade',
  'social-engineering-simulator',
  'clearance-tower',
]

// palette is [top, bottom, accent] and also feeds the still fallback
// an optional hero (see heroes.js) pins the camera and tells the layout where the desk panel sits
export const rooms = {
  'cli-cyber-defender': {
    id: 'cli-cyber-defender',
    label: 'Telegraph Office, instrument room',
    palette: ['#2b3a36', '#14100d', '#d69a2f'],
    hero: cliHero,
    load: () => import('./cli.js').then((m) => m.buildCliRoom),
  },
  'phishing-post-mortem': {
    id: 'phishing-post-mortem',
    label: 'Post Office, sorting room',
    palette: ['#6a4a3a', '#2c1c16', '#e0b04a'],
    hero: phishingHero,
    load: () => import('./phishing.js').then((m) => m.buildPostRoom),
  },
  'sql-injection-arcade': {
    id: 'sql-injection-arcade',
    label: 'Customs House, bonded registry',
    palette: ['#1f3045', '#0e1620', '#4fc3d9'],
    hero: sqlHero,
    load: () => import('./sql.js').then((m) => m.buildCustomsRoom),
  },
  'social-engineering-simulator': {
    id: 'social-engineering-simulator',
    label: 'The snug, The Capybara & Crown',
    palette: ['#5a3a24', '#22140c', '#f0a050'],
    load: () => import('./social.js').then((m) => m.buildSnugRoom),
  },
  'clearance-tower': {
    id: 'clearance-tower',
    label: 'Records room, river police tower',
    palette: ['#26344a', '#10151f', '#d8c070'],
    load: () => import('./clearance.js').then((m) => m.buildClearanceRoom),
  },
}

export function roomFor(id) {
  return rooms[id] ?? null
}
