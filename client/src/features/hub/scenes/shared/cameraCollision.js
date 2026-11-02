// spring arm for the arc rotate follow camera: casts from the target toward the wanted camera spot and pulls the camera in
// in front of the first building box. boxes are { min: [x, y, z], max: [x, y, z] }

const within = (origin, min, max) => origin.every((o, axis) => o > min[axis] && o < max[axis])

// slab test against many boxes; returns the nearest entry distance within maxDist, or Infinity
// a box grown by pad that holds the origin only in its padding is tested at its real walls instead,
// and one that holds it inside the real walls is ignored, since there is no way to pull out of it
export function rayBoxDistance(origin, dir, maxDist, boxes) {
  let best = Infinity
  for (const box of boxes) {
    const shrink = box.pad && within(origin, box.min, box.max) ? box.pad : 0
    let near = 0
    let far = Math.min(maxDist, best)
    let inside = true
    let miss = false
    for (let axis = 0; axis < 3; axis += 1) {
      const o = origin[axis]
      const d = dir[axis]
      const lo = box.min[axis] + shrink
      const hi = box.max[axis] - shrink
      if (o <= lo || o >= hi) inside = false
      if (Math.abs(d) < 1e-9) {
        // parallel to this slab: a miss unless the origin lies between its planes
        if (o < lo || o > hi) {
          miss = true
          break
        }
        continue
      }
      let t0 = (lo - o) / d
      let t1 = (hi - o) / d
      if (t0 > t1) [t0, t1] = [t1, t0]
      if (t0 > near) near = t0
      if (t1 < far) far = t1
      if (near > far) {
        miss = true
        break
      }
    }
    if (miss || inside) continue
    if (near < best && near <= maxDist) best = near
  }
  return best
}

// the camera keeps the radius the player asked for (camera.radius at the start of update). update() then writes the pulled in
// radius for rendering and restore() puts the asked for one back before the next frame's inputs, so wheel and pinch never
// build on a collision pull
// pullIn and easeOut are the seconds the move takes to settle
export function createSpringArm({
  camera,
  boxes,
  minRadius = 1,
  margin = 0.6,
  pullIn = 0.08,
  easeOut = 0.4,
  reduced = () => false,
  active = () => true,
}) {
  let desired = camera.radius
  let effective = null
  let applied = null
  const origin = [0, 0, 0]
  const dir = [0, 0, 0]

  function update(dt) {
    desired = camera.radius
    if (!active()) {
      effective = null
      applied = null
      return
    }
    const sinB = Math.sin(camera.beta)
    dir[0] = Math.cos(camera.alpha) * sinB
    dir[1] = Math.cos(camera.beta)
    dir[2] = Math.sin(camera.alpha) * sinB
    origin[0] = camera.target.x
    origin[1] = camera.target.y
    origin[2] = camera.target.z
    const hit = rayBoxDistance(origin, dir, desired + margin, boxes)
    const goal = Math.min(desired, Math.max(minRadius, hit - margin))
    if (effective === null || reduced()) {
      effective = goal
    } else {
      const seconds = goal < effective ? pullIn : easeOut
      effective += (goal - effective) * (1 - Math.exp((-3 * dt) / seconds))
      if (Math.abs(goal - effective) < 0.005) effective = goal
      // zooming in by hand must not wait for the ease
      if (effective > desired) effective = desired
    }
    camera.radius = effective
    applied = effective
  }

  // anything else that wrote the radius since update (a flight, the debug camera) wins
  function restore() {
    if (applied !== null && camera.radius === applied) camera.radius = desired
    applied = null
  }

  return {
    update,
    restore,
    state: () => ({ desired, effective, active: applied !== null }),
  }
}
