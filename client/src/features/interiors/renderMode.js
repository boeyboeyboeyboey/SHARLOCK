// still image url and gradient fallback for a game room

const STILL_DIR = '/interiors'

export function stillUrl(id) {
  return `${STILL_DIR}/${id}.webp`
}

// css gradient used when the still is missing
export function fallbackGradient(palette) {
  const [top, bottom, accent] = palette ?? ['#2b3a36', '#1c2420', '#b88a3a']
  return `radial-gradient(ellipse at 50% 18%, ${accent}33, transparent 55%), linear-gradient(180deg, ${top}, ${bottom})`
}
