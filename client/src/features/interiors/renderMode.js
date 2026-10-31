// pure decisions for how an interior is drawn, kept apart from babylon so they can be unit tested

export const STILL_DIR = '/interiors'

export function stillUrl(id) {
  return `${STILL_DIR}/${id}.webp`
}

// INT-03: game routes always show the pre-rendered still, the live room code is kept but never started
// the inputs stay so the live path can come back; 'loop' and 'single' are currently unreachable
// returns 'loop' (animated), 'single' (one frame, then the loop stops) or 'still' (image, no canvas)
// eslint-disable-next-line no-unused-vars
export function decideRender(options = {}) {
  return 'still'
}

// what the room is allowed to build per tier: draw call ceiling, ambient motion and the resident rig
export function roomBudget(tierName) {
  if (tierName === 'desktop') return { drawCalls: 150, rig: true, animate: true }
  if (tierName === 'compact') return { drawCalls: 100, rig: false, animate: true }
  return { drawCalls: 60, rig: false, animate: false }
}

// css gradient used when the still is missing
export function fallbackGradient(palette) {
  const [top, bottom, accent] = palette ?? ['#2b3a36', '#1c2420', '#b88a3a']
  return `radial-gradient(ellipse at 50% 18%, ${accent}33, transparent 55%), linear-gradient(180deg, ${top}, ${bottom})`
}
