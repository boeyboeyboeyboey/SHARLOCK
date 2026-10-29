import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { glowMaterial, toonMaterial } from '../../hub/scenes/wharf/toon.js'
import { hemi, labelAtlas, lamp, resident, shell } from './kit.js'

// h.m. customs house bonded registry, 1880: dusk through blue windows, brass and cyan accents
const C = {
  wall: '#34465c',
  wainscot: '#2a2018',
  floorA: '#3d2e22',
  floorB: '#352920',
  ceiling: '#1c2430',
  beam: '#171310',
  walnut: '#4e3626',
  brass: '#c9a04a',
  trim: '#c9a04a',
  dark: '#12161c',
  cyan: '#4fd6ea',
  plank: '#8a6a40',
}
const ROOM_TOON = {
  shade: [0.3, 0.36, 0.46],
  mid: [0.6, 0.68, 0.78],
  lit: [1.05, 1.0, 0.9],
  rim: [0.25, 0.5, 0.65],
  t1: 0.28,
  t2: 0.8,
}
const SPINES = ['#3a2a1e', '#5a2428', '#1f3558', '#6a5a3a', '#244a3a', '#4a3a58']

function skylight(b, g) {
  g.box({ c: [0, 2.3, 4.47], s: [1.9, 2.8, 0.03], color: rgb('#6a96dc', 1.25) })
  for (const x of [-0.95, 0, 0.95])
    b.box({ c: [x, 2.3, 4.43], s: [0.07, 2.9, 0.05], color: rgb(C.dark, 1.5) })
  for (const y of [1.2, 2.0, 2.8, 3.7])
    b.box({ c: [0, y, 4.43], s: [2.05, 0.06, 0.05], color: rgb(C.dark, 1.5) })
  b.box({ c: [0, 0.82, 4.35], s: [2.3, 0.1, 0.3], color: rgb(C.walnut, 1) })
  // a cool pool of dusk on the floor
  g.box({ c: [0, 0.02, 3.2], s: [1.5, 0.01, 2.0], color: rgb('#5a86c8', 0.4) })
}

// tall ledger shelves either side of the window
function ledgerShelves(b) {
  for (const side of [-1, 1]) {
    const cx = side * 2.95
    b.box({ c: [cx, 1.9, 4.44], s: [3.3, 3.5, 0.08], color: rgb(C.dark, 1.5) })
    for (let r = 0; r <= 6; r += 1)
      b.box({ c: [cx, 0.3 + r * 0.55, 4.3], s: [3.4, 0.05, 0.4], color: rgb(C.walnut, 0.85) })
    for (const x of [-1.65, 1.65])
      b.box({ c: [cx + x, 1.9, 4.3], s: [0.06, 3.5, 0.4], color: rgb(C.walnut, 0.75) })
    for (let r = 0; r < 6; r += 1) {
      let x = cx - 1.55
      for (let i = 0; x < cx + 1.5; i += 1) {
        const w = 0.07 + ((i * 3 + r) % 4) * 0.02
        const tall = 0.34 + ((i + r * 2) % 3) * 0.05
        if ((i + r * 5) % 13 !== 0) {
          b.box({
            c: [x + w / 2, 0.33 + r * 0.55 + tall / 2, 4.2],
            s: [w, tall, 0.26],
            color: rgb(SPINES[(i * 5 + r * 3) % SPINES.length], 0.95),
          })
          if ((i + r) % 4 === 0)
            b.box({
              c: [x + w / 2, 0.33 + r * 0.55 + tall * 0.7, 4.07],
              s: [w + 0.005, 0.05, 0.01],
              color: rgb(C.brass, 0.9),
            })
        }
        x += w + 0.01
      }
    }
    b.box({ c: [cx, 3.78, 4.3], s: [3.5, 0.1, 0.5], color: rgb(C.walnut, 0.9) })
  }
}

// a-z card-index cabinets on the left wall
function cabinets(b, labels, atlas) {
  const x = -4.25
  b.box({ c: [x, 1.0, 2.4], s: [0.55, 2.0, 3.4], color: rgb(C.walnut, 0.8) })
  for (let col = 0; col < 4; col += 1)
    for (let row = 0; row < 5; row += 1) {
      const z = 1.2 + col * 0.8 + 0.4
      const y = 0.22 + row * 0.38
      b.box({ c: [x + 0.29, y, z], s: [0.04, 0.33, 0.74], color: rgb(C.walnut, 1.15) })
      b.box({ c: [x + 0.32, y + 0.03, z], s: [0.03, 0.03, 0.14], color: rgb(C.brass, 1) })
      if (!(col === 1 && row === 2)) {
        labels.box({
          c: [x + 0.315, y - 0.07, z],
          s: [0.02, 0.07, 0.18],
          color: rgb('#ffffff', 0.9),
          uv: atlas.uv(col),
        })
      }
    }
  b.box({ c: [x, 2.05, 2.4], s: [0.6, 0.08, 3.5], color: rgb(C.walnut, 1.1) })
  // one index per letter band along the top
  b.box({ c: [x + 0.1, 2.3, 2.4], s: [0.2, 0.4, 3.0], color: rgb(C.dark, 1.6) })
  labels.box({
    c: [x + 0.215, 2.3, 2.4],
    s: [0.02, 0.34, 2.4],
    uv: atlas.uv(7),
    color: rgb('#ffffff', 0.85),
  })
}

// gate turnstile and badge-scanner booth on the right
function gate(b, g, labels, atlas) {
  b.box({ c: [3.9, 0.7, 3.0], s: [1.1, 1.4, 1.2], color: rgb(C.walnut, 0.85) })
  b.box({ c: [3.9, 1.45, 3.0], s: [1.2, 0.08, 1.3], color: rgb(C.brass, 0.7) })
  g.box({ c: [3.32, 1.9, 3.0], s: [0.03, 0.8, 0.95], color: rgb('#6fd3e4', 0.7) })
  for (const y of [1.5, 2.3])
    b.box({ c: [3.32, y, 3.0], s: [0.05, 0.05, 1.05], color: rgb(C.brass, 0.85) })
  for (const z of [2.5, 3.5])
    b.box({ c: [3.32, 1.9, z], s: [0.05, 0.85, 0.05], color: rgb(C.brass, 0.85) })
  b.box({ c: [3.9, 2.55, 3.0], s: [1.2, 0.1, 1.3], color: rgb(C.walnut, 0.7) })
  g.box({ c: [3.3, 1.55, 3.0], s: [0.04, 0.05, 0.3], color: rgb(C.cyan, 1.3) })
  labels.box({
    c: [3.3, 2.8, 3.0],
    s: [0.04, 0.34, 1.2],
    uv: atlas.uv(8),
    color: rgb('#ffffff', 0.9),
  })
  // fixed turnstile posts and barrier rails to the wall
  b.cylinder({ c: [3.0, 0.5, 1.0], r: 0.1, h: 1.0, seg: 8, color: rgb(C.brass, 0.8) })
  b.cylinder({ c: [3.0, 1.03, 1.0], r: 0.13, h: 0.06, seg: 8, color: rgb(C.brass, 1) })
  for (const z of [0.0, 2.0])
    b.cylinder({ c: [3.3, 0.55, z], r: 0.04, h: 1.1, seg: 6, color: rgb(C.brass, 0.9) })
  b.bar([3.3, 1.05, 0.0], [3.3, 1.05, 0.9], 0.04, { color: rgb(C.brass, 0.9) })
  b.bar([3.3, 1.05, 1.1], [3.3, 1.05, 2.0], 0.04, { color: rgb(C.brass, 0.9) })
}

function crates(b, atlas) {
  const crate = (x, y, z, s, yaw) => {
    b.box({
      c: [x, y + s / 2, z],
      s: [s, s, s],
      yaw,
      color: rgb(C.plank, 0.85),
      uv: atlas.uv(15),
      faces: {
        '0,0,-1': atlas.uv(4 + (((Math.round(x * 3) % 3) + 3) % 3)),
        '0,0,-1:color': rgb('#ffffff', 0.8),
      },
    })
    b.bar(
      [x - s / 2 - 0.01, y + 0.05, z - s / 2 - 0.01],
      [x + s / 2 + 0.01, y + 0.05, z - s / 2 - 0.01],
      0.05,
      { color: rgb(C.walnut, 0.8) },
    )
    b.bar(
      [x - s / 2 - 0.01, y + s - 0.05, z - s / 2 - 0.01],
      [x + s / 2 + 0.01, y + s - 0.05, z - s / 2 - 0.01],
      0.05,
      { color: rgb(C.walnut, 0.8) },
    )
  }
  crate(-3.4, 0, 0.0, 0.8, 0.1)
  crate(-3.5, 0.8, 0.05, 0.62, -0.08)
  crate(-2.7, 0, 0.1, 0.62, 0.2)
  crate(2.1, 0, 3.7, 0.75, -0.12)
  crate(1.5, 0, 3.35, 0.6, 0.15)
  crate(2.15, 0.75, 3.7, 0.55, 0.05)
}

// clerk's high desk and stool
function highDesk(b) {
  b.box({ c: [-0.4, 1.0, -0.3], s: [2.6, 0.06, 0.9], color: rgb(C.walnut, 1.1) })
  b.box({ c: [-0.4, 0.5, 0.1], s: [2.5, 1.0, 0.08], color: rgb(C.walnut, 0.8) })
  for (const x of [-1.6, 0.8])
    b.box({ c: [x, 0.5, -0.3], s: [0.1, 1.0, 0.85], color: rgb(C.walnut, 0.8) })
  b.box({ c: [-0.4, 1.06, -0.3], s: [1.4, 0.015, 0.6], color: rgb('#1d3a30', 1.2) })
  b.bar([-1.0, 1.06, -0.25], [-0.2, 1.18, -0.2], 0.03, { color: rgb(C.brass, 0.9) })
  b.cylinder({ c: [0.45, 1.09, -0.4], r: 0.05, h: 0.1, seg: 8, color: rgb('#10151c', 1.2) })
  b.cylinder({ c: [-1.4, 0.42, -1.1], r: 0.2, h: 0.04, seg: 8, color: rgb(C.walnut, 1) })
  b.cylinder({ c: [-1.4, 0.2, -1.1], r: 0.03, h: 0.4, seg: 6, color: rgb(C.brass, 0.8) })
}

export function buildCustomsRoom({ scene, budget, reduced }) {
  scene.clearColor = new Color4(0.03, 0.04, 0.06, 1)
  const fill = hemi(scene, {
    intensity: 0.55,
    diffuse: [0.55, 0.68, 0.9],
    ground: [0.22, 0.18, 0.16],
  })
  const dusk = lamp(scene, 'dusk', [0, 2.6, 3.3], [0.45, 0.65, 1], 1.5, 11)
  const pendant = lamp(scene, 'pendant', [0, 2.8, 0.8], [1, 0.8, 0.45], 1.5, 8)
  const cyan = lamp(scene, 'cyan', [3.0, 1.6, 2.4], [0.3, 0.9, 1], 0.8, 5)

  const solid = new Batch()
  const glow = new Batch()
  const labels = new Batch()
  shell(solid, C)
  glow.box({ c: [0, 1.15, 4.45], s: [9, 0.03, 0.03], color: rgb(C.cyan, 0.9) })
  const atlas = labelAtlas(scene, 'customs-atlas', [
    [['A - F'], '#e8dcb8', '#3a2a1e'],
    [['G - L'], '#e8dcb8', '#3a2a1e'],
    [['M - R'], '#e8dcb8', '#3a2a1e'],
    [['S - Z'], '#e8dcb8', '#3a2a1e'],
    [['H.M.C.', 'TEA'], '#d8b878', '#2a1c12'],
    [['BONDED', 'No. 4'], '#d8b878', '#2a1c12'],
    [['FRAGILE', 'THIS WAY UP'], '#d8b878', '#2a1c12'],
    [['BONDED REGISTRY  A - Z'], '#1b2a40', '#c9a04a'],
    [['SCAN BADGE'], '#0f2a33', '#4fd6ea'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
    [[], '#ffffff', '#ffffff'],
  ])
  skylight(solid, glow)
  ledgerShelves(solid)
  cabinets(solid, labels, atlas)
  gate(solid, glow, labels, atlas)
  crates(labels, atlas)
  highDesk(solid)
  labels.box({
    c: [0, 3.5, 4.4],
    s: [2.4, 0.4, 0.05],
    uv: atlas.uv(7),
    color: rgb('#ffffff', 0.85),
  })

  const material = toonMaterial(scene, 'customs-room', { twoSided: true, options: ROOM_TOON })
  material.maxSimultaneousLights = 4
  const glowMat = glowMaterial(scene, 'customs-glow', { fog: false })
  const labelMat = toonMaterial(scene, 'customs-labels', {
    texture: atlas.texture,
    twoSided: true,
    options: ROOM_TOON,
  })
  labelMat.maxSimultaneousLights = 4
  const meshes = [
    solid.build(scene, 'customs-solid', material),
    glow.build(scene, 'customs-glow', glowMat),
    labels.build(scene, 'customs-labels', labelMat),
  ]

  // one drawer slides out of the cabinet and back
  const drawer = new Batch()
  drawer.box({ c: [0, 0, 0], s: [0.04, 0.33, 0.74], color: rgb(C.walnut, 1.3) })
  drawer.box({ c: [-0.16, 0.0, 0], s: [0.3, 0.05, 0.62], color: rgb(C.walnut, 0.7) })
  for (let i = 0; i < 9; i += 1)
    drawer.box({
      c: [-0.16, 0.1, -0.26 + i * 0.065],
      s: [0.22, 0.14, 0.012],
      color: rgb('#e8dcb8', 1),
      yaw: 0,
    })
  const drawerMesh = drawer.build(scene, 'customs-drawer', material)
  drawerMesh.position.set(-3.96, 0.22 + 2 * 0.38, 1.2 + 1 * 0.8 + 0.4)
  meshes.push(drawerMesh)

  // pendant lamp swings from the ceiling
  const swing = new TransformNode('customs-swing', scene)
  swing.position.set(0, 3.75, 0.8)
  const lampBatch = new Batch()
  lampBatch.bar([0, 0, 0], [0, -0.7, 0], 0.02, { color: rgb(C.brass, 0.8) })
  lampBatch.cylinder({
    c: [0, -0.82, 0],
    r: 0.3,
    rTop: 0.08,
    h: 0.2,
    seg: 10,
    color: rgb('#1f6a58', 1),
  })
  const lampMesh = lampBatch.build(scene, 'customs-lamp', material)
  lampMesh.parent = swing
  const bulb = new Batch()
  bulb.box({ c: [0, -0.95, 0], s: [0.12, 0.12, 0.12], color: rgb('#ffd890', 1.5) })
  const bulbMesh = bulb.build(scene, 'customs-bulb', glowMat)
  bulbMesh.parent = swing
  meshes.push(lampMesh, bulbMesh)

  const officer = resident(
    scene,
    { budget, reduced },
    {
      name: 'customs-officer',
      fur: 'dockC',
      hat: 'detective-cap',
      cap: [0.1, 0.16, 0.32],
      scarf: [0.78, 0.62, 0.25],
      pos: [2.2, 0, 1.5],
      yaw: 2.5,
      seed: 17,
    },
  )

  const animate = budget.animate && !reduced()
  return {
    camera: { pos: [0, 1.55, -3.6], target: [0, 1.5, 3], fov: 1.1, drift: [0.22, 0.06, 44] },
    update(dt, time) {
      if (!animate) return
      officer.update(dt)
      // drawer slides out for a moment every nine seconds
      const t = (time % 9) / 9
      const out = t < 0.15 ? t / 0.15 : t < 0.45 ? 1 : t < 0.6 ? 1 - (t - 0.45) / 0.15 : 0
      drawerMesh.position.x = -3.96 + out * 0.34
      const a = Math.sin(time * 0.9) * 0.1
      swing.rotation.z = a
      pendant.position.x = -Math.sin(a) * 0.95
      pendant.position.y = 3.75 - Math.cos(a) * 0.95
      pendant.intensity = 1.5 + Math.sin(time * 5.1) * 0.04
      cyan.intensity = 0.8 + Math.sin(time * 2.4) * 0.15
    },
    dispose() {
      officer.dispose()
      for (const m of meshes) m.dispose()
      for (const l of [fill, dusk, pendant, cyan]) l.dispose()
      for (const m of [material, glowMat, labelMat]) m.dispose()
      atlas.texture.dispose()
    },
  }
}
