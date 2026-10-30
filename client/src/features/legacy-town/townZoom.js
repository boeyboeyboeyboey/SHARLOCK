export const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2]
export const MAX_ZOOM = 2
const EPS = 0.001

// smallest scale at which the whole world is visible; never above the maximum zoom
export function fitScale(view, world) {
  if (!view.width || !view.height) return 1
  return Math.min(MAX_ZOOM, view.width / world.width, view.height / world.height)
}

// fit first, then every preset above it
export function zoomLadder(fit) {
  return [fit, ...ZOOM_STEPS.filter((step) => step > fit + EPS)]
}

export function stepZoom(current, direction, fit) {
  const ladder = zoomLadder(fit)
  if (direction > 0)
    return ladder.find((step) => step > current + EPS) ?? Math.max(current, ladder.at(-1))
  return [...ladder].reverse().find((step) => step < current - EPS) ?? Math.min(current, fit)
}

// panzoom uses a 50% 50% origin, so the visual offset is (size - size * s) / 2 + pan * s;
// a world smaller than the view on an axis is centred, a larger one stays edge to edge
export function clampPan(pan, scale, view, world) {
  const axis = (value, viewSize, worldSize) => {
    const scaled = worldSize * scale
    const origin = (worldSize - scaled) / 2
    const offset =
      scaled <= viewSize
        ? (viewSize - scaled) / 2
        : Math.min(0, Math.max(viewSize - scaled, origin + value * scale))
    return (offset - origin) / scale
  }
  return { x: axis(pan.x, view.width, world.width), y: axis(pan.y, view.height, world.height) }
}
