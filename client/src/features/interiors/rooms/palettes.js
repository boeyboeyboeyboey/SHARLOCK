// [top, bottom, accent] per game id, used for the still's gradient fallback
export const ROOM_IDS = [
  'cli-cyber-defender',
  'phishing-post-mortem',
  'sql-injection-arcade',
  'social-engineering-simulator',
  'clearance-tower',
]

const palettes = {
  'cli-cyber-defender': ['#2b3a36', '#14100d', '#d69a2f'],
  'phishing-post-mortem': ['#6a4a3a', '#2c1c16', '#e0b04a'],
  'sql-injection-arcade': ['#1f3045', '#0e1620', '#4fc3d9'],
  'social-engineering-simulator': ['#5a3a24', '#22140c', '#f0a050'],
  'clearance-tower': ['#26344a', '#10151f', '#d8c070'],
}

export function roomFor(id) {
  const palette = palettes[id]
  return palette ? { id, palette } : null
}
