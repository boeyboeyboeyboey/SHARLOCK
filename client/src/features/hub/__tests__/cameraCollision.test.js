import { describe, expect, it } from 'vitest'
import { createSpringArm, rayBoxDistance } from '../scenes/shared/cameraCollision.js'

const wall = { min: [10, 0, -5], max: [12, 20, 5] }

describe('rayBoxDistance', () => {
  it('returns the entry distance of the nearest box', () => {
    const far = { min: [20, 0, -5], max: [22, 20, 5] }
    expect(rayBoxDistance([0, 1, 0], [1, 0, 0], 50, [far, wall])).toBeCloseTo(10)
  })

  it('misses when the box is off to the side, behind, or beyond maxDist', () => {
    expect(rayBoxDistance([0, 1, 0], [0, 0, 1], 50, [{ min: [10, 0, 6], max: [12, 20, 9] }])).toBe(
      Infinity,
    )
    expect(rayBoxDistance([0, 1, 0], [-1, 0, 0], 50, [wall])).toBe(Infinity)
    expect(rayBoxDistance([0, 1, 0], [1, 0, 0], 9.9, [wall])).toBe(Infinity)
    expect(rayBoxDistance([0, 1, 0], [1, 0, 0], 10, [wall])).toBeCloseTo(10)
  })

  it('ignores a box that already contains the origin', () => {
    expect(rayBoxDistance([11, 1, 0], [1, 0, 0], 50, [wall])).toBe(Infinity)
    const next = { min: [14, 0, -5], max: [16, 20, 5] }
    expect(rayBoxDistance([11, 1, 0], [1, 0, 0], 50, [wall, next])).toBeCloseTo(3)
  })

  it('tests a padded box at its real walls when the origin is only in the padding', () => {
    const padded = { min: [9.7, 0, -5.3], max: [12.3, 20.3, 5.3], pad: 0.3 }
    // standing in the padding, the wall is still hit 0.2 away
    expect(rayBoxDistance([9.8, 1, 0], [1, 0, 0], 50, [padded])).toBeCloseTo(0.2)
    expect(rayBoxDistance([9.8, 1, 0], [-1, 0, 0], 50, [padded])).toBe(Infinity)
    // inside the real walls it is still ignored
    expect(rayBoxDistance([11, 1, 0], [1, 0, 0], 50, [padded])).toBe(Infinity)
  })

  it('handles rays parallel to a slab', () => {
    // parallel to y and z planes: only the x slab limits it
    expect(rayBoxDistance([0, 5, 0], [1, 0, 0], 50, [wall])).toBeCloseTo(10)
    // parallel and outside the y slab
    expect(rayBoxDistance([0, 25, 0], [1, 0, 0], 50, [wall])).toBe(Infinity)
    // parallel and exactly on a face still misses cleanly
    expect(rayBoxDistance([0, 1, 5.01], [1, 0, 0], 50, [wall])).toBe(Infinity)
  })

  it('hits on a slanted ray', () => {
    const d = Math.SQRT1_2
    // 45 degrees up: reaches x 10 at y 11, inside the wall height
    expect(rayBoxDistance([0, 1, 0], [d, d, 0], 50, [wall])).toBeCloseTo(10 / d)
    // steeper ray clears the 20 m top before x 10
    expect(rayBoxDistance([0, 1, 0], [0.3, 0.954, 0], 50, [wall])).toBe(Infinity)
  })
})

// camera looking along +x from the target: alpha 0, beta 90 degrees
const makeCamera = (radius = 16) => ({
  alpha: 0,
  beta: Math.PI / 2,
  radius,
  target: { x: 0, y: 1, z: 0 },
})
const frames = (arm, count, dt = 1 / 60) => {
  for (let i = 0; i < count; i += 1) {
    arm.restore()
    arm.update(dt)
  }
}

describe('createSpringArm', () => {
  it('leaves the camera alone when nothing is in the way', () => {
    const camera = makeCamera()
    const arm = createSpringArm({ camera, boxes: [{ min: [40, 0, -5], max: [42, 20, 5] }] })
    frames(arm, 10)
    expect(camera.radius).toBe(16)
  })

  it('pulls in to the wall minus the margin', () => {
    const camera = makeCamera()
    const arm = createSpringArm({ camera, boxes: [wall] })
    frames(arm, 1)
    expect(camera.radius).toBeCloseTo(9.4)
  })

  it('pulls in within about the pull in time and eases out over about the ease out time', () => {
    const camera = makeCamera()
    camera.target.x = -20
    const arm = createSpringArm({ camera, boxes: [wall], pullIn: 0.08, easeOut: 0.4 })
    frames(arm, 2)
    expect(camera.radius).toBe(16)

    // the wall is now 10 m ahead: 5 frames (0.083 s) cover at least 90 percent of the drop from 16 to 9.4
    camera.target.x = 0
    frames(arm, 5)
    expect(camera.radius).toBeLessThan(16 - (16 - 9.4) * 0.9)

    // moving back out is slower: 0.1 s later it is still short of halfway
    camera.target.x = -20
    frames(arm, 6)
    expect(camera.radius).toBeLessThan(9.4 + (16 - 9.4) * 0.6)
    frames(arm, 30)
    expect(camera.radius).toBeCloseTo(16, 0)
  })

  it('never goes below minRadius', () => {
    const camera = makeCamera()
    camera.target.x = 9.8
    // the origin is outside the box (x 10 is the wall face) but only 0.2 m away
    const arm = createSpringArm({ camera, boxes: [wall], minRadius: 2.5 })
    frames(arm, 30)
    expect(camera.radius).toBe(2.5)
  })

  it('keeps the asked for radius through collision pulls', () => {
    const camera = makeCamera(16)
    camera.target.x = 6
    const arm = createSpringArm({ camera, boxes: [wall] })
    frames(arm, 30)
    expect(arm.state().effective).toBeLessThan(5)
    arm.restore()
    expect(camera.radius).toBe(16)
    expect(arm.state().desired).toBe(16)
    // a wheel step from the asked for radius is applied to it, not to the pulled in one
    camera.radius = 14
    arm.update(1 / 60)
    expect(arm.state().desired).toBe(14)
  })

  it('does not let a stale restore override another writer', () => {
    const camera = makeCamera(16)
    camera.target.x = 6
    const arm = createSpringArm({ camera, boxes: [wall] })
    frames(arm, 5)
    camera.radius = 22
    arm.restore()
    expect(camera.radius).toBe(22)
  })

  it('snaps with reduced motion', () => {
    const camera = makeCamera()
    const arm = createSpringArm({ camera, boxes: [wall], reduced: () => true })
    frames(arm, 1)
    expect(camera.radius).toBeCloseTo(9.4)
    camera.target.x = 6
    frames(arm, 1)
    expect(camera.radius).toBeCloseTo(3.4)
    camera.target.x = 0
    frames(arm, 1)
    expect(camera.radius).toBeCloseTo(9.4)
  })

  it('does nothing while inactive and resumes from the live radius', () => {
    const camera = makeCamera(4.2)
    camera.target.x = 6
    let on = false
    const arm = createSpringArm({ camera, boxes: [wall], active: () => on })
    frames(arm, 5)
    expect(camera.radius).toBe(4.2)
    expect(arm.state().active).toBe(false)
    on = true
    camera.radius = 16
    frames(arm, 1)
    expect(arm.state().active).toBe(true)
  })

  it('follows a smaller asked for radius at once', () => {
    const camera = makeCamera(16)
    const arm = createSpringArm({ camera, boxes: [] })
    frames(arm, 2)
    camera.radius = 9
    arm.update(1 / 60)
    expect(camera.radius).toBe(9)
  })
})
