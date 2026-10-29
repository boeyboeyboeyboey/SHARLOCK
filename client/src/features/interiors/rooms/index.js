// registry of interior rooms keyed by game id; each entry lazily loads its builder
// a builder is (ctx) => { camera, update(dt, time), dispose() } where ctx has scene, engine, tier, budget, reduced

export const ROOM_IDS = [
  'cli-cyber-defender',
  'phishing-post-mortem',
  'sql-injection-arcade',
  'social-engineering-simulator',
  'clearance-tower',
]

// palette is [top, bottom, accent] and also feeds the still fallback
const placeholder = (id, label, palette, light) => ({
  id,
  label,
  palette,
  load: () =>
    import('./placeholder.js').then((m) => (ctx) => m.buildPlaceholder(ctx, { palette, light })),
})

export const rooms = {
  'cli-cyber-defender': {
    id: 'cli-cyber-defender',
    label: 'Telegraph Office, instrument room',
    palette: ['#2b3a36', '#14100d', '#d69a2f'],
    load: () => import('./cli.js').then((m) => m.buildCliRoom),
  },
  'phishing-post-mortem': placeholder(
    'phishing-post-mortem',
    'Post Office, sorting room',
    ['#6a4a3a', '#2c1c16', '#e0b04a'],
    [1, 0.86, 0.6],
  ),
  'sql-injection-arcade': placeholder(
    'sql-injection-arcade',
    'Customs House, bonded registry',
    ['#1f3045', '#0e1620', '#4fc3d9'],
    [0.6, 0.8, 1],
  ),
  'social-engineering-simulator': placeholder(
    'social-engineering-simulator',
    'The snug, The Capybara & Crown',
    ['#5a3a24', '#22140c', '#f0a050'],
    [1, 0.7, 0.4],
  ),
  'clearance-tower': placeholder(
    'clearance-tower',
    'Records room, river police tower',
    ['#26344a', '#10151f', '#d8c070'],
    [0.8, 0.85, 1],
  ),
}

export function roomFor(id) {
  return rooms[id] ?? null
}
