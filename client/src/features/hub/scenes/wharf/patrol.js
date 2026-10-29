// pure patrol stepping for the townsfolk wanderers, kept free of babylon so it can be unit tested
export const WALK_SPEED = 1.4

// patrol state starts at the first waypoint, the npc's post, heading for the second
export function createPatrol(route) {
  return {
    x: route[0][0],
    z: route[0][1],
    next: 1 % route.length,
    wait: 0,
    heading: 0,
    moving: false,
  }
}

// advances the patrol in place; no allocation. yaw convention: sin = x, cos = z
export function stepPatrol(state, route, pause, dt, speed = WALK_SPEED) {
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - dt)
    state.moving = false
    return
  }
  const target = route[state.next]
  const dx = target[0] - state.x
  const dz = target[1] - state.z
  const dist = Math.hypot(dx, dz)
  const reach = speed * dt
  if (dist <= reach) {
    state.x = target[0]
    state.z = target[1]
    state.next = (state.next + 1) % route.length
    state.wait = pause
    state.moving = false
    return
  }
  state.x += (dx / dist) * reach
  state.z += (dz / dist) * reach
  state.heading = Math.atan2(dx, dz)
  state.moving = true
}

// a wanderer stays put while frozen, under reduced motion, out of range, close to the player or in a talk with them
export function holdsStill({ frozen, calm, dist, range, near, talking }) {
  return frozen || calm || dist > range || dist < near || talking
}
