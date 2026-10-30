// pure helpers for the hero prop: screen corners of the prop surface to the desk panel rect

export const HERO_MIN = { width: 420, height: 320 }

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// corners are [x, y] css px in TL, TR, BR, BL order; returns the largest axis-aligned rect inside the quad,
// grown to the minimum size around its centre and kept inside the stage
export function rectFromCorners(corners, stage, min = HERO_MIN) {
  const [tl, tr, br, bl] = corners
  const left = Math.max(tl[0], bl[0])
  const right = Math.min(tr[0], br[0])
  const top = Math.max(tl[1], tr[1])
  const bottom = Math.min(bl[1], br[1])
  const width = clamp(Math.max(right - left, min.width), 0, stage.width)
  const height = clamp(Math.max(bottom - top, min.height), 0, stage.height)
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return {
    left: Math.round(clamp(cx - width / 2, 0, stage.width - width)),
    top: Math.round(clamp(cy - height / 2, 0, stage.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  }
}

// clip space (after the perspective divide) to css px of the canvas
export function ndcToCss([x, y], stage) {
  return [((x + 1) / 2) * stage.width, ((1 - y) / 2) * stage.height]
}

// the hero layout needs a hero room, a live 3d stage and a wide viewport; anything else keeps the centred desk
export function heroActive({ hero, stage, wide }) {
  return Boolean(hero) && stage === '3d' && Boolean(wide)
}
