import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { cliHero } from './heroes.js'
import { heroBoard, labelAtlas } from './kit.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { applyToon, glowMaterial, toonMaterial } from '../../hub/scenes/wharf/toon.js'
import {
  createCapybaraRig,
  createCapybaraStatic,
  furStyles,
} from '../../hub/scenes/shared/capybara.js'

// telegraph office instrument room, 1880: green banker's lamps and amber gaslight over brass and walnut
// the room is x right, y up, z away from the camera; the camera sits at the front wall
const C = {
  wall: '#2e4038',
  wainscot: '#3b2a1d',
  floorA: '#4b3626',
  floorB: '#432f21',
  ceiling: '#1e1814',
  walnut: '#5a3d28',
  brass: '#c79a43',
  dark: '#17120f',
  cream: '#e3d4a6',
  rug: '#5a2a2a',
}

const toon = (m) => applyToon(m, { rimGain: 0.9 })
const ROOM_TOON = {
  shade: [0.32, 0.38, 0.44],
  mid: [0.68, 0.7, 0.66],
  lit: [1.15, 1.02, 0.8],
  rim: [0.25, 0.55, 0.35],
  t1: 0.28,
  t2: 0.8,
}

function shell(b) {
  b.box({ c: [0, -0.05, 0.5], s: [9.2, 0.1, 9.4], color: rgb(C.floorA) })
  for (let i = 0; i < 12; i += 1)
    b.box({
      c: [-4.1 + i * 0.75, 0.002, 0.5],
      s: [0.7, 0.01, 9],
      color: rgb(i % 2 ? C.floorB : C.floorA, 1.05),
    })
  b.box({ c: [0, 3.85, 0.5], s: [9.2, 0.1, 9.4], color: rgb(C.ceiling) })
  b.box({ c: [0, 1.9, 4.55], s: [9.2, 3.8, 0.1], color: rgb(C.wall) })
  b.box({ c: [-4.55, 1.9, 0.5], s: [0.1, 3.8, 9.4], color: rgb(C.wall, 0.92) })
  b.box({ c: [4.55, 1.9, 0.5], s: [0.1, 3.8, 9.4], color: rgb(C.wall, 0.92) })
  b.box({ c: [0, 1.9, -4.2], s: [9.2, 3.8, 0.1], color: rgb(C.wall, 0.8) })
  // wainscot and rail
  b.box({ c: [0, 0.55, 4.5], s: [9, 1.1, 0.06], color: rgb(C.wainscot) })
  b.box({ c: [-4.5, 0.55, 0.5], s: [0.06, 1.1, 9], color: rgb(C.wainscot) })
  b.box({ c: [4.5, 0.55, 0.5], s: [0.06, 1.1, 9], color: rgb(C.wainscot) })
  b.box({ c: [0, 1.12, 4.48], s: [9, 0.06, 0.1], color: rgb(C.brass, 0.7) })
  for (const z of [-1.2, 1.6, 4.1])
    b.box({ c: [0, 3.65, z], s: [9, 0.22, 0.28], color: rgb(C.dark, 1.6) })
  b.box({ c: [0, 0.012, 0.6], s: [3.8, 0.012, 5.2], color: rgb(C.rug) })
  // gas main along the ceiling with drops to the sconces
  b.bar([-4.4, 3.45, 2.2], [4.4, 3.45, 2.2], 0.05, { color: rgb(C.brass, 0.8) })
}

// back wall switchboard: walnut panel, a grid of jacks, patch cords
function switchboard(b, g) {
  b.box({ c: [0, 1.9, 4.42], s: [4.6, 2.1, 0.12], color: rgb(C.walnut, 0.85) })
  b.box({ c: [0, 1.9, 4.34], s: [4.3, 1.8, 0.05], color: rgb(C.dark, 1.5) })
  const cols = 10
  const rows = 5
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = -1.8 + c * 0.4
      const y = 1.2 + r * 0.34
      b.box({ c: [x, y, 4.3], s: [0.1, 0.1, 0.05], color: rgb(C.brass, 0.9) })
      if ((r * 7 + c * 3) % 5 === 0)
        g.box({
          c: [x, y + 0.11, 4.3],
          s: [0.045, 0.045, 0.03],
          color: rgb((r + c) % 2 ? '#7dff9a' : '#ffb347', 1.4),
        })
    }
  }
  const cords = [
    [[-1.8, 1.2], [-0.6, 1.88], '#9a2a2a'],
    [[-0.2, 1.54], [1.4, 2.22], '#2a5a9a'],
    [[0.6, 1.2], [1.8, 1.54], '#c8b050'],
    [[-1.4, 2.22], [0.2, 1.2], '#2a8a4a'],
    [[1.0, 1.88], [-0.2, 2.56], '#9a2a2a'],
  ]
  for (const [a, z, col] of cords)
    b.bar([a[0], a[1], 4.26], [z[0], z[1], 4.26], 0.018, { color: rgb(col, 1.1) })
}

// left wall: the Empire wire map with pins on the cable stations
function wireMap(b, g) {
  b.box({ c: [-4.46, 2.05, 0.6], s: [0.08, 2.3, 3.8], color: rgb(C.walnut, 0.9) })
  b.box({ c: [-4.41, 2.05, 0.6], s: [0.03, 2.1, 3.6], color: rgb('#6f8a96', 1.1) })
  const land = [
    [1.6, 1.7, 0.9, 0.6],
    [1.9, 0.5, 0.5, 1.0],
    [2.7, 0.0, 0.7, 0.9],
    [2.5, -0.45, 0.4, 0.3],
    [1.1, 0.9, 0.4, 0.4],
    [2.5, 1.35, 0.5, 0.5],
    [1.45, 1.9, 0.5, 0.25],
  ]
  for (const [y, z, h, w] of land)
    b.box({ c: [-4.385, y + 0.2, 0.6 + z - 0.7], s: [0.02, h, w], color: rgb('#b9a56a', 1.05) })
  const pins = [
    [2.55, -0.6, '#ff5040'],
    [2.5, 0.2, '#ffb347'],
    [2.4, 0.95, '#ff5040'],
    [1.95, 0.55, '#ffb347'],
    [1.55, 1.15, '#ff5040'],
    [1.2, 0.4, '#ffb347'],
    [2.0, 1.6, '#ff5040'],
    [1.4, 1.95, '#ffb347'],
  ]
  for (let i = 0; i < pins.length - 1; i += 1) {
    const [y1, z1] = pins[i]
    const [y2, z2] = pins[i + 1]
    b.bar([-4.36, y1, 0.6 + z1 - 0.7], [-4.36, y2, 0.6 + z2 - 0.7], 0.012, {
      color: rgb('#8a2020', 1.0),
    })
  }
  for (const [y, z, col] of pins)
    g.box({ c: [-4.35, y, 0.6 + z - 0.7], s: [0.03, 0.07, 0.07], color: rgb(col, 1.2) })
}

// right wall: brass relay rack, plus a night window beyond it
function relayRack(b, g) {
  b.box({ c: [4.46, 1.6, -0.1], s: [0.08, 2.5, 2.9], color: rgb(C.dark, 1.7) })
  for (const z of [-1.55, 1.35])
    b.box({ c: [4.3, 1.6, z], s: [0.3, 2.6, 0.1], color: rgb(C.brass, 0.6) })
  for (let r = 0; r < 4; r += 1) {
    const y = 0.75 + r * 0.62
    b.box({ c: [4.28, y, -0.1], s: [0.34, 0.05, 2.8], color: rgb(C.walnut, 0.8) })
    for (let i = 0; i < 7; i += 1) {
      const z = -1.2 + i * 0.4
      b.cylinder({
        c: [4.27, y + 0.17, z],
        r: 0.075,
        h: 0.28,
        seg: 8,
        color: rgb(C.brass, 0.95 + (i % 3) * 0.05),
      })
      b.box({ c: [4.27, y + 0.36, z], s: [0.12, 0.04, 0.12], color: rgb(C.dark, 1.4) })
      if ((i + r) % 3 === 0)
        g.box({ c: [4.4, y + 0.17, z], s: [0.02, 0.04, 0.04], color: rgb('#7dff9a', 1.3) })
    }
  }
  g.box({ c: [4.5, 2.4, 3.0], s: [0.03, 1.3, 1.0], color: rgb('#27406a', 1.0) })
  b.box({ c: [4.47, 2.4, 3.0], s: [0.05, 1.3, 0.05], color: rgb(C.dark, 1.5) })
  b.box({ c: [4.47, 2.4, 3.0], s: [0.05, 0.05, 1.0], color: rgb(C.dark, 1.5) })
}

function desk(b, g) {
  b.box({ c: [0, 0.76, -0.3], s: [4.6, 0.08, 1.3], color: rgb(C.walnut, 1.1) })
  b.box({ c: [0, 0.38, 0.28], s: [4.5, 0.74, 0.08], color: rgb(C.walnut, 0.8) })
  for (const x of [-2.2, 2.2])
    b.box({ c: [x, 0.38, -0.3], s: [0.1, 0.74, 1.2], color: rgb(C.walnut, 0.8) })
  b.box({ c: [0, 0.81, -0.4], s: [2.2, 0.01, 0.8], color: rgb('#243a2c', 1.2) })
  // keys
  for (const x of [-0.5, 0.5]) {
    b.box({ c: [x, 0.84, -0.6], s: [0.22, 0.03, 0.12], color: rgb(C.brass, 0.9) })
    b.bar([x - 0.1, 0.88, -0.6], [x + 0.1, 0.91, -0.6], 0.025, { color: rgb(C.brass, 1.1) })
    b.box({ c: [x + 0.11, 0.93, -0.6], s: [0.045, 0.045, 0.045], color: rgb(C.dark, 2) })
  }
  // sounder bodies
  for (const x of [-1.0, 1.0]) {
    b.box({ c: [x, 0.84, -0.2], s: [0.4, 0.05, 0.2], color: rgb(C.brass, 0.8) })
    b.cylinder({ c: [x - 0.08, 0.92, -0.2], r: 0.04, h: 0.11, seg: 6, color: rgb('#8a4a28', 1.2) })
    b.cylinder({ c: [x + 0.04, 0.92, -0.2], r: 0.04, h: 0.11, seg: 6, color: rgb('#8a4a28', 1.2) })
  }
  // banker's lamps: brass stem, green glass shade
  for (const x of [-1.9, 1.9]) {
    b.cylinder({ c: [x, 0.83, -0.35], r: 0.1, h: 0.05, seg: 8, color: rgb(C.brass, 0.9) })
    b.cylinder({ c: [x, 0.98, -0.35], r: 0.015, h: 0.25, seg: 5, color: rgb(C.brass, 1) })
    g.box({ c: [x, 1.18, -0.35], s: [0.38, 0.14, 0.16], color: rgb('#33d070', 0.9) })
    b.box({ c: [x, 1.27, -0.35], s: [0.4, 0.025, 0.18], color: rgb(C.brass, 0.9) })
  }
}

// ticker stand with a spool; the tape itself is animated
function tickerStand(b) {
  b.box({ c: [-3.3, 0.7, -1.4], s: [0.8, 0.06, 0.55], color: rgb(C.walnut, 1) })
  for (const [x, z] of [
    [-3.65, -1.6],
    [-2.95, -1.6],
    [-3.65, -1.2],
    [-2.95, -1.2],
  ])
    b.box({ c: [x, 0.35, z], s: [0.05, 0.7, 0.05], color: rgb(C.walnut, 0.8) })
  b.box({ c: [-3.3, 0.82, -1.4], s: [0.3, 0.18, 0.22], color: rgb(C.brass, 0.75) })
  b.cylinder({ c: [-3.3, 1.0, -1.4], r: 0.22, h: 0.16, seg: 12, color: rgb(C.cream, 0.9) })
  b.cylinder({ c: [-3.3, 1.0, -1.4], r: 0.07, h: 0.2, seg: 8, color: rgb(C.brass, 1) })
  for (let i = 0; i < 5; i += 1)
    b.box({
      c: [-3.1 + (i % 3) * 0.18, 0.04, -1.9 + i * 0.12],
      s: [0.14, 0.02, 0.06],
      color: rgb(C.cream, 0.8),
      yaw: i * 0.9,
    })
  b.cylinder({ c: [-2.2, 0.28, -2.2], r: 0.24, h: 0.55, seg: 8, color: rgb('#6a4a30', 0.9) })
}

// the operator's console: a brass-framed slate face, with the sounder and key on the ledge below
function operatorConsole(b, g) {
  const { z, bottom, top } = heroBoard(b, cliHero, {
    face: '#16201d',
    faceGain: 1.2,
    frame: C.walnut,
    brass: C.brass,
  })
  const ly = bottom - 0.27
  // key
  b.box({ c: [-0.9, ly + 0.03, z - 0.2], s: [0.26, 0.03, 0.14], color: rgb(C.brass, 0.9) })
  b.bar([-1.0, ly + 0.07, z - 0.2], [-0.8, ly + 0.11, z - 0.2], 0.025, { color: rgb(C.brass, 1.1) })
  b.box({ c: [-0.79, ly + 0.13, z - 0.2], s: [0.05, 0.05, 0.05], color: rgb(C.dark, 2) })
  // sounder
  b.box({ c: [0.9, ly + 0.04, z - 0.2], s: [0.42, 0.05, 0.2], color: rgb(C.brass, 0.8) })
  for (const dx of [-0.09, 0.05])
    b.cylinder({
      c: [0.9 + dx, ly + 0.12, z - 0.2],
      r: 0.04,
      h: 0.11,
      seg: 6,
      color: rgb('#8a4a28', 1.2),
    })
  // gas bracket lamps over the top rail
  for (const x of [-1, 1]) {
    b.bar([x * 1.3, top + 0.24, z], [x * 1.3, top + 0.4, z - 0.12], 0.025, {
      color: rgb(C.brass, 1),
    })
    g.box({ c: [x * 1.3, top + 0.46, z - 0.14], s: [0.16, 0.12, 0.16], color: rgb('#ffb347', 1.5) })
  }
}

function sconces(b, g) {
  for (const x of [-3.2, 3.2]) {
    b.box({ c: [x, 2.4, 4.4], s: [0.12, 0.3, 0.12], color: rgb(C.brass, 0.85) })
    g.box({ c: [x, 2.65, 4.36], s: [0.2, 0.2, 0.2], color: rgb('#ffb347', 1.5) })
    b.bar([x, 3.0, 4.4], [x, 3.45, 2.2], 0.04, { color: rgb(C.brass, 0.7) })
  }
}

export function buildCliRoom({ scene, budget, reduced }) {
  scene.clearColor = new Color4(0.04, 0.05, 0.05, 1)
  scene.ambientColor = new Color3(0, 0, 0)

  const hemi = new HemisphericLight('fill', new Vector3(0, 1, 0), scene)
  hemi.intensity = 0.6
  hemi.diffuse = new Color3(0.62, 0.72, 0.8)
  hemi.groundColor = new Color3(0.28, 0.2, 0.15)
  hemi.specular = Color3.Black()
  const lampL = new PointLight('lamp-left', new Vector3(-1.9, 1.5, -0.6), scene)
  const lampR = new PointLight('lamp-right', new Vector3(1.9, 1.5, -0.6), scene)
  for (const l of [lampL, lampR]) {
    l.diffuse = new Color3(0.3, 1, 0.55)
    l.specular = Color3.Black()
    l.intensity = 1.5
    l.range = 8
  }
  const gas = new PointLight('gas', new Vector3(0, 3.1, 1.6), scene)
  gas.diffuse = new Color3(1, 0.68, 0.3)
  gas.specular = Color3.Black()
  gas.intensity = 1.7
  gas.range = 11

  const solid = new Batch()
  const glow = new Batch()
  shell(solid)
  switchboard(solid, glow)
  wireMap(solid, glow)
  relayRack(solid, glow)
  desk(solid, glow)
  operatorConsole(solid, glow)
  tickerStand(solid)
  sconces(solid, glow)
  // clock hands at ten past three
  const hand = (angle, len, thick) =>
    solid.bar([0, 3.2, 4.3], [Math.sin(angle) * len, 3.2 + Math.cos(angle) * len, 4.3], thick, {
      color: rgb(C.dark, 1.5),
    })
  hand(Math.PI * 2 * (3.17 / 12), 0.16, 0.025)
  hand(Math.PI * 2 * (10 / 60), 0.26, 0.018)
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2
    glow.box({
      c: [Math.sin(a) * 0.31, 3.2 + Math.cos(a) * 0.31, 4.32],
      s: [0.025, 0.025, 0.02],
      color: rgb('#f2e6b8', 1),
    })
  }

  const material = toonMaterial(scene, 'cli-room', { twoSided: true, options: ROOM_TOON })
  material.maxSimultaneousLights = 4
  const glowMat = glowMaterial(scene, 'cli-glow', { fog: false })
  const atlas = labelAtlas(scene, 'cli-atlas', [[['INSTRUMENT ROOM'], '#16201d', '#e4b84a']])
  const labels = new Batch()
  labels.box({
    c: [0, cliHero.corners[0][1] + 0.12, cliHero.corners[0][2] - 0.09],
    s: [1.5, 0.17, 0.02],
    uv: atlas.uv(0),
    color: rgb('#ffffff', 0.85),
  })
  const labelMat = glowMaterial(scene, 'cli-labels', { texture: atlas.texture, fog: false })
  const meshes = [
    solid.build(scene, 'cli-solid', material),
    glow.build(scene, 'cli-glow', glowMat),
    labels.build(scene, 'cli-labels', labelMat),
  ]

  const clockMat = toonMaterial(scene, 'cli-clock', { options: ROOM_TOON })
  clockMat.diffuseColor = new Color3(0.9, 0.84, 0.66)
  const clock = CreateCylinder(
    'cli-clock-face',
    { diameter: 0.72, height: 0.05, tessellation: 24 },
    scene,
  )
  clock.rotation.x = Math.PI / 2
  clock.position.set(0, 3.2, 4.36)
  clock.material = clockMat
  meshes.push(clock)

  // second hand and sounder arms swing on pivots
  const secPivot = new TransformNode('cli-second', scene)
  secPivot.position.set(0, 3.2, 4.28)
  const sec = new Batch()
  sec.bar([0, -0.05, 0], [0, 0.29, 0], 0.008, { color: rgb('#c0392b', 1.4) })
  const secMesh = sec.build(scene, 'cli-second-hand', glowMat)
  secMesh.parent = secPivot
  meshes.push(secMesh)

  const arms = [0.75].map((x) => {
    const pivot = new TransformNode('cli-arm', scene)
    pivot.position.set(x, 0.6, -1.3)
    const a = new Batch()
    a.bar([0, 0, 0], [0.3, 0, 0], 0.025, { color: rgb(C.brass, 1.2) })
    a.box({ c: [0.3, 0, 0], s: [0.04, 0.04, 0.1], color: rgb(C.brass, 1) })
    const mesh = a.build(scene, 'cli-sounder-arm', material)
    mesh.parent = pivot
    meshes.push(mesh)
    return pivot
  })

  const tape = new Batch()
  tape.box({ c: [0, 0, 0], s: [0.55, 0.004, 0.05], color: rgb(C.cream, 1.2) })
  const tapeMesh = tape.build(scene, 'cli-tape', glowMat)
  tapeMesh.position.set(-2.95, 0.94, -1.4)
  meshes.push(tapeMesh)

  // the resident clerk
  let rig = null
  let clerk = null
  if (budget.rig) {
    rig = createCapybaraRig(scene, {
      name: 'clerk',
      style: { ...furStyles.dockA, scarf: [0.22, 0.34, 0.5] },
      size: 1.2,
      hat: 'cap',
      monocle: false,
      capColor: [0.5, 0.4, 0.14],
      toon,
      reduced,
      idleSeed: 23,
    })
    clerk = rig.node
  } else {
    clerk = createCapybaraStatic(scene, {
      style: furStyles.dockA,
      cap: [0.5, 0.4, 0.14],
      name: 'clerk',
      toon,
    })
    clerk.scaling.setAll(1.2)
  }
  clerk.position.set(3.5, 0, 0.4)
  clerk.rotation.y = Math.PI + 0.55

  let tapeAt = 0
  let lastSec = -1
  let nextTap = 1
  let tapLeft = 0
  const animate = budget.animate && !reduced()

  return {
    camera: { ...cliHero.camera, drift: [0, 0, 44] },
    update(dt, time) {
      if (!animate) return
      rig?.update(dt, 0)
      // lamps breathe, gas flickers faster
      lampL.intensity = 1.5 + Math.sin(time * 2.1) * 0.05 + Math.sin(time * 9.3) * 0.04
      lampR.intensity = 1.5 + Math.sin(time * 1.7 + 1) * 0.05 + Math.sin(time * 8.1) * 0.04
      gas.intensity = 1.7 + Math.sin(time * 7.3) * 0.12 + Math.sin(time * 13.1) * 0.08
      const s = Math.floor(time) % 60
      if (s !== lastSec) {
        lastSec = s
        secPivot.rotation.z = -(s / 60) * Math.PI * 2
      }
      // sounder taps in short bursts
      if (time > nextTap && tapLeft <= 0) {
        tapLeft = 2 + Math.floor(((Math.sin(time * 12.9898) + 1) / 2) * 4)
        nextTap = time + 3 + ((Math.sin(time * 78.233) + 1) / 2) * 3
      }
      const phase = (time * 7) % 1
      if (tapLeft > 0 && phase < 0.2) arms.forEach((a, i) => (a.rotation.z = i ? 0 : -0.14))
      else arms.forEach((a) => (a.rotation.z = 0))
      if (phase > 0.9 && tapLeft > 0) tapLeft -= 0.1
      tapeAt = (tapeAt + dt * 0.1) % 0.4
      tapeMesh.position.x = -2.95 + Math.floor(tapeAt / 0.05) * 0.05
    },
    dispose() {
      rig?.dispose()
      for (const m of meshes) m.dispose()
      clerk?.dispose?.()
      for (const l of [hemi, lampL, lampR, gas]) l.dispose()
      for (const m of [material, glowMat, clockMat, labelMat]) m.dispose()
      atlas.texture.dispose()
    },
  }
}
