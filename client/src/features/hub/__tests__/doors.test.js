import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoors, doorSpot } from '../scenes/shared/doors.js'

// the rings are real meshes, which need a gpu; the selection rules under test only touch the plain state
vi.mock('@babylonjs/core/Meshes/Builders/discBuilder.js', () => ({
  CreateDisc: () => ({
    rotation: {},
    position: { set() {} },
    getTotalVertices: () => 4,
    setVerticesData() {},
  }),
}))
vi.mock('@babylonjs/core/Meshes/mesh.js', () => ({
  Mesh: {
    MergeMeshes: () => ({
      getTotalVertices: () => 8,
      setVerticesData() {},
      updateVerticesData() {},
      dispose() {},
    }),
  },
}))
vi.mock('@babylonjs/core/Materials/standardMaterial.js', () => ({
  StandardMaterial: class {
    dispose() {}
  },
}))
vi.mock('@babylonjs/core/Materials/Textures/dynamicTexture.js', () => ({
  DynamicTexture: class {
    getContext() {
      return new Proxy(
        {},
        {
          get: (_target, key) =>
            key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
          set: () => true,
        },
      )
    }
    update() {}
    dispose() {}
  },
}))

const infos = [
  { id: 'a', title: 'A', accent: '#112233', x: 0, z: 0, face: 0, reach: 2 },
  { id: 'b', title: 'B', accent: '#112233', x: 30, z: 0, face: 0, reach: 2 },
]

function makeControl() {
  const control = {
    at: { x: 100, z: 100, y: 0 },
    walking: false,
    held: false,
    stalled: false,
    serial: 0,
    routes: [],
    enabled: true,
    position: () => control.at,
    isWalking: () => control.walking,
    isHeld: () => control.held,
    wasStalled: () => control.stalled,
    routeSerial: () => control.serial,
    routeToDoor(id) {
      control.routes.push(id)
      control.serial += 1
      control.walking = true
    },
    cancelRoute() {
      control.walking = false
    },
    flyTo() {
      control.held = true
      return Promise.resolve()
    },
    releaseCamera() {
      control.held = false
    },
    setEnabled(value) {
      control.enabled = value
    },
  }
  return control
}

let state
let control
let doors
let notify
const on = (id) => {
  const info = infos.find((item) => item.id === id)
  const spot = doorSpot(info, info.reach)
  control.at = { x: spot.x, z: spot.z, y: 0 }
}
const away = () => {
  control.at = { x: 100, z: 100, y: 0 }
}
const frame = () => doors.update(0.016, 0)

beforeEach(() => {
  state = { selected: null, nearDoor: null, mode: 'explore', panelFor: null }
  control = makeControl()
  notify = vi.fn()
  doors = createDoors({
    scene: {},
    state,
    notify,
    infos,
    control,
    camera: { alpha: 0, beta: 1, radius: 10, lowerRadiusLimit: 9 },
    reduced: () => true,
  })
  frame()
})

describe('door selection', () => {
  it('routes to a picked door and frames it', () => {
    doors.select('a')
    expect(state.selected).toBe('a')
    expect(control.routes).toEqual(['a'])
    expect(doors.framedId()).toBe('a')
  })

  it('keeps the pick while the walk crosses another ring', () => {
    doors.select('a')
    on('b')
    frame()
    expect(state.selected).toBe('a')
    away()
    frame()
    expect(state.selected).toBe('a')
  })

  it('drops the pick when the player steers away before arriving', () => {
    doors.select('a')
    control.walking = false
    frame()
    expect(state.selected).toBeNull()
  })

  it('keeps the pick when the route only stalled on an obstacle', () => {
    doors.select('a')
    control.walking = false
    control.stalled = true
    frame()
    expect(state.selected).toBe('a')
  })

  it('selects a door by walking onto its ring and deselects by walking off', () => {
    on('a')
    frame()
    expect(state.nearDoor).toBe('a')
    expect(state.selected).toBe('a')
    away()
    frame()
    expect(state.selected).toBeNull()
  })

  it('does not count starting on a ring as walking onto it', () => {
    on('b')
    const fresh = { selected: null, nearDoor: null, mode: 'explore', panelFor: null }
    const second = createDoors({
      scene: {},
      state: fresh,
      notify,
      infos,
      control,
      camera: { alpha: 0, beta: 1, radius: 10, lowerRadiusLimit: 9 },
      reduced: () => true,
    })
    second.update(0.016, 0)
    expect(fresh.nearDoor).toBe('b')
    expect(fresh.selected).toBeNull()
  })

  it('does not walk away from a ring the player already stands on', () => {
    on('a')
    frame()
    control.routes.length = 0
    doors.select('a')
    expect(control.routes).toEqual([])
    expect(state.selected).toBe('a')
  })

  it('ignores an id the scene does not know, leaving the state as it was', () => {
    doors.select('missing')
    expect(state.selected).toBeNull()
    expect(control.routes).toEqual([])
    notify.mockClear()
    return expect(doors.enter('missing'))
      .resolves.toBe(false)
      .then(() => {
        expect(state.mode).toBe('explore')
        expect(control.enabled).toBe(true)
        expect(doors.isEntering()).toBe(false)
        expect(notify).not.toHaveBeenCalled()
      })
  })
})

describe('entering and coming back', () => {
  it('locks input, ignores picks during the swoop and restores everything on back', async () => {
    doors.select('a')
    const entering = doors.enter('a')
    expect(control.enabled).toBe(false)
    expect(state.mode).toBe('entering')
    doors.select('b')
    expect(state.selected).toBe('a')
    await expect(entering).resolves.toBe(true)
    expect(state).toMatchObject({ mode: 'panel', panelFor: 'a' })
    await expect(doors.back()).resolves.toBe(true)
    expect(state).toMatchObject({ mode: 'explore', panelFor: null, selected: null })
    expect(control.enabled).toBe(true)
    expect(doors.isEntering()).toBe(false)
  })

  it('has nothing to go back from when not entering', async () => {
    await expect(doors.back()).resolves.toBe(false)
  })

  it('will not enter without a pick', async () => {
    await expect(doors.enter()).resolves.toBe(false)
  })
})
