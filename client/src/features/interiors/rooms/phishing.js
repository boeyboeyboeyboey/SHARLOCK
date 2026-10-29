import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { glowMaterial, toonMaterial } from '../../hub/scenes/wharf/toon.js'
import { hemi, labelAtlas, lamp, resident, shell } from './kit.js'

// royal mail post office sorting room, 1880: daylight through tall windows over red, gold and cream
const C = {
  wall: '#c9b48a',
  wainscot: '#6a2a24',
  floorA: '#6b4a32',
  floorB: '#5e4130',
  ceiling: '#7c6a4e',
  beam: '#3c2a1e',
  walnut: '#6a4430',
  brass: '#d4a840',
  trim: '#d4a840',
  red: '#b2262a',
  cream: '#f1e3b8',
  dark: '#1c1511',
  sack: '#b79a6a',
}
const ROOM_TOON = {
  shade: [0.4, 0.38, 0.4],
  mid: [0.74, 0.7, 0.66],
  lit: [1.2, 1.08, 0.88],
  rim: [0.5, 0.4, 0.25],
  t1: 0.28,
  t2: 0.8,
}
const PAPER = ['#f1e3b8', '#e8d4a0', '#f4ecd2', '#d9c08a', '#efc9c0']

// pigeonhole sorting frame filling the back wall
function sortingFrame(b) {
  const w = 5.4
  const h = 2.0
  const y0 = 0.95
  b.box({ c: [0, y0 + h / 2, 4.44], s: [w + 0.2, h + 0.2, 0.08], color: rgb(C.dark, 1.6) })
  for (let r = 0; r <= 5; r += 1)
    b.box({ c: [0, y0 + r * 0.4, 4.27], s: [w + 0.2, 0.05, 0.42], color: rgb(C.walnut, 0.9) })
  for (let c = 0; c <= 12; c += 1)
    b.box({
      c: [-w / 2 + c * 0.45, y0 + h / 2, 4.27],
      s: [0.04, h, 0.42],
      color: rgb(C.walnut, 0.8),
    })
  for (let r = 0; r < 5; r += 1)
    for (let c = 0; c < 12; c += 1) {
      const n = (r * 7 + c * 5) % 11
      if (n > 6) continue
      const x = -w / 2 + c * 0.45 + 0.225
      b.box({
        c: [x, y0 + r * 0.4 + 0.15, 4.2],
        s: [0.3, 0.2 + (n % 2) * 0.04, 0.05],
        color: rgb(PAPER[n % PAPER.length], 0.95),
        yaw: ((n % 3) - 1) * 0.1,
      })
    }
  b.box({ c: [0, y0 + h + 0.2, 4.3], s: [w + 0.5, 0.12, 0.5], color: rgb(C.walnut, 1.1) })
}

// tall windows flanking the frame, with mullions
function windows(b, g) {
  for (const x of [-3.7, 3.7]) {
    g.box({ c: [x, 2.3, 4.47], s: [0.95, 2.5, 0.03], color: rgb('#fff1c4', 1.6) })
    b.box({ c: [x, 2.3, 4.43], s: [0.05, 2.5, 0.04], color: rgb(C.beam, 1.6) })
    for (const y of [1.5, 2.3, 3.1])
      b.box({ c: [x, y, 4.43], s: [1.05, 0.05, 0.04], color: rgb(C.beam, 1.6) })
    b.box({ c: [x, 3.6, 4.44], s: [1.15, 0.1, 0.06], color: rgb(C.brass, 0.7) })
    // pools of light on the floor
    g.box({
      c: [x * 0.78, 0.02, 2.6],
      s: [0.95, 0.01, 1.8],
      color: rgb('#ffe2a0', 0.5),
      yaw: x > 0 ? 0.25 : -0.25,
    })
  }
}

// counter along the right wall with a brass grille and teller gap
function counter(b) {
  b.box({ c: [3.3, 0.52, 0.8], s: [0.9, 1.04, 3.4], color: rgb(C.walnut, 0.85) })
  b.box({ c: [3.2, 1.07, 0.8], s: [1.05, 0.08, 3.5], color: rgb(C.walnut, 1.2) })
  b.box({ c: [3.12, 0.5, 0.8], s: [0.04, 0.8, 3.0], color: rgb(C.dark, 1.5) })
  for (let i = 0; i < 12; i += 1) {
    if (i === 5 || i === 6) continue
    b.cylinder({
      c: [3.38, 1.55, -0.6 + i * 0.28],
      r: 0.014,
      h: 0.9,
      seg: 5,
      color: rgb(C.brass, 1),
    })
  }
  b.box({ c: [3.38, 2.02, 0.8], s: [0.06, 0.06, 3.3], color: rgb(C.brass, 0.85) })
  b.box({ c: [3.38, 1.12, 0.8], s: [0.06, 0.05, 3.3], color: rgb(C.brass, 0.85) })
  b.box({ c: [3.38, 2.12, 0.8], s: [0.05, 0.12, 1.0], color: rgb(C.red, 1.2) })
  b.cylinder({
    c: [3.15, 1.15, -0.5],
    r: 0.07,
    rTop: 0.03,
    h: 0.1,
    seg: 8,
    color: rgb(C.brass, 1.1),
  })
}

// scales base, post and weighing pan; the beam is animated
function scalesStatic(b) {
  b.box({ c: [3.2, 1.14, 1.9], s: [0.3, 0.05, 0.3], color: rgb(C.brass, 0.85) })
  b.cylinder({ c: [3.2, 1.34, 1.9], r: 0.025, h: 0.4, seg: 6, color: rgb(C.brass, 1) })
}

function pillarBox(b, g) {
  const x = -3.3
  const z = 2.3
  b.cylinder({ c: [x, 0.08, z], r: 0.34, h: 0.16, seg: 10, color: rgb('#3a1410', 1.1) })
  b.cylinder({ c: [x, 0.76, z], r: 0.28, h: 1.2, seg: 10, color: rgb(C.red, 1) })
  b.cylinder({ c: [x, 1.46, z], r: 0.2, rTop: 0.05, h: 0.22, seg: 10, color: rgb(C.red, 0.9) })
  b.cylinder({ c: [x, 1.4, z], r: 0.31, h: 0.1, seg: 10, color: rgb('#8a1c20', 1) })
  b.box({ c: [x, 1.08, z - 0.27], s: [0.34, 0.05, 0.04], color: rgb(C.dark, 1.4) })
  b.box({ c: [x, 1.22, z - 0.285], s: [0.2, 0.1, 0.02], color: rgb(C.brass, 1) })
  g.box({ c: [x, 0.78, z - 0.285], s: [0.18, 0.2, 0.02], color: rgb(C.cream, 0.9) })
}

function sacks(b) {
  const spots = [
    [-1.9, 3.7, 1],
    [-1.4, 3.3, 0.85],
    [1.9, 3.6, 0.95],
    [2.4, 3.1, 0.8],
    [-3.6, 0.3, 0.9],
    [-3.2, -0.2, 0.75],
  ]
  for (const [x, z, k] of spots) {
    b.cylinder({
      c: [x, 0.3 * k, z],
      r: 0.28 * k,
      rTop: 0.2 * k,
      h: 0.6 * k,
      seg: 9,
      color: rgb(C.sack, 0.9 + (x % 0.2)),
    })
    b.cylinder({
      c: [x, 0.64 * k, z],
      r: 0.07 * k,
      rTop: 0.12 * k,
      h: 0.12 * k,
      seg: 7,
      color: rgb(C.sack, 0.7),
    })
    b.box({ c: [x, 0.5 * k, z - 0.26 * k], s: [0.14 * k, 0.1 * k, 0.02], color: rgb(C.red, 1) })
  }
}

// dead letter shelves on the left wall
function deadLetters(b, atlas) {
  for (let i = 0; i < 4; i += 1)
    b.box({ c: [-4.25, 0.5 + i * 0.5, 2.0], s: [0.5, 0.05, 2.6], color: rgb(C.walnut, 0.9) })
  b.box({ c: [-4.45, 1.2, 2.0], s: [0.06, 1.8, 2.6], color: rgb(C.dark, 1.5) })
  for (const z of [0.7, 3.3])
    b.box({ c: [-4.25, 1.2, z], s: [0.5, 1.9, 0.06], color: rgb(C.walnut, 0.8) })
  for (let r = 0; r < 4; r += 1)
    for (let i = 0; i < 6; i += 1) {
      if ((r + i) % 5 === 4) continue
      b.box({
        c: [-4.22, 0.6 + r * 0.5 + 0.1, 0.95 + i * 0.4],
        s: [0.3, 0.2 + ((i + r) % 2) * 0.05, 0.3],
        color: rgb(PAPER[(i + r) % PAPER.length], 0.85),
        yaw: ((i + r) % 3) * 0.05,
      })
      b.box({
        c: [-4.22, 0.6 + r * 0.5 + 0.1, 0.95 + i * 0.4],
        s: [0.32, 0.04, 0.05],
        color: rgb(C.red, 0.9),
      })
    }
  atlas.plaque(1, [-4.42, 2.75, 3.1], [0.04, 0.42, 1.7], Math.PI / 2)
}

// inspection desk in the foreground with the magnifier
function desk(b) {
  b.box({ c: [-0.6, 0.76, -0.3], s: [3.4, 0.08, 1.3], color: rgb(C.walnut, 1.1) })
  b.box({ c: [-0.6, 0.38, 0.28], s: [3.3, 0.74, 0.08], color: rgb(C.walnut, 0.8) })
  for (const x of [-2.2, 1.0])
    b.box({ c: [x, 0.38, -0.3], s: [0.1, 0.74, 1.2], color: rgb(C.walnut, 0.8) })
  b.box({ c: [-0.6, 0.81, -0.4], s: [1.8, 0.01, 0.8], color: rgb('#3a5a46', 1.2) })
  for (let i = 0; i < 5; i += 1)
    b.box({
      c: [-1.2 + i * 0.22, 0.83 + i * 0.004, -0.35 + (i % 2) * 0.1],
      s: [0.22, 0.01, 0.15],
      color: rgb(PAPER[i], 1),
      yaw: i * 0.5 - 1,
    })
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2
    const a2 = ((i + 1) / 10) * Math.PI * 2
    b.bar(
      [0.1 + Math.sin(a) * 0.14, 0.88, -0.45 + Math.cos(a) * 0.14],
      [0.1 + Math.sin(a2) * 0.14, 0.88, -0.45 + Math.cos(a2) * 0.14],
      0.02,
      { color: rgb(C.brass, 1.1) },
    )
  }
  b.bar([0.1, 0.88, -0.59], [0.1, 0.9, -0.82], 0.03, { color: rgb(C.walnut, 1.3) })
  b.cylinder({
    c: [-1.9, 0.85, -0.6],
    r: 0.07,
    rTop: 0.03,
    h: 0.09,
    seg: 8,
    color: rgb(C.brass, 1.1),
  })
}

export function buildPostRoom({ scene, budget, reduced }) {
  scene.clearColor = new Color4(0.06, 0.05, 0.04, 1)
  const fill = hemi(scene, {
    intensity: 0.75,
    diffuse: [1, 0.93, 0.78],
    ground: [0.38, 0.28, 0.22],
  })
  const sun = lamp(scene, 'sun', [0, 1.9, 3.0], [1, 0.9, 0.62], 1.6, 12)
  const front = lamp(scene, 'front', [0, 2.2, -2.5], [1, 0.82, 0.6], 0.8, 9)

  const solid = new Batch()
  const glow = new Batch()
  shell(solid, C)
  sortingFrame(solid)
  windows(solid, glow)
  counter(solid)
  scalesStatic(solid)
  pillarBox(solid, glow)
  sacks(solid)
  desk(solid)

  const atlas = labelAtlas(scene, 'post-atlas', [
    [['ROYAL MAIL', 'POST OFFICE'], C.red, '#fff0c0'],
    [['DEAD LETTER OFFICE'], '#2a1c16', '#e4b84a'],
    [['LETTERS & PARCELS'], '#f1e3b8', '#6a2a24'],
  ])
  const labels = new Batch()
  const plaque = (i, c, s, yaw) =>
    labels.box({ c, s, yaw, uv: atlas.uv(i), color: rgb('#ffffff', 0.85) })
  plaque(0, [0, 3.3, 4.42], [2.6, 0.42, 0.05], 0)
  plaque(2, [3.2, 2.45, 0.8], [0.05, 0.3, 1.1], Math.PI / 2)
  deadLetters(solid, { plaque })

  const material = toonMaterial(scene, 'post-room', { twoSided: true, options: ROOM_TOON })
  material.maxSimultaneousLights = 4
  const glowMat = glowMaterial(scene, 'post-glow', { fog: false })
  const labelMat = glowMaterial(scene, 'post-labels', { texture: atlas.texture, fog: false })
  const meshes = [
    solid.build(scene, 'post-solid', material),
    glow.build(scene, 'post-glow', glowMat),
    labels.build(scene, 'post-labels', labelMat),
  ]

  // scale beam rocks on its post
  const beamPivot = new TransformNode('post-beam', scene)
  beamPivot.position.set(3.2, 1.55, 1.9)
  const beam = new Batch()
  beam.bar([0, 0, -0.28], [0, 0, 0.28], 0.025, { color: rgb(C.brass, 1.1) })
  for (const z of [-0.28, 0.28]) {
    beam.cylinder({
      c: [0, -0.1, z],
      r: 0.11,
      rTop: 0.1,
      h: 0.03,
      seg: 8,
      color: rgb(C.brass, 0.95),
    })
    beam.bar([0, 0, z], [0, -0.09, z], 0.008, { color: rgb(C.brass, 0.9) })
  }
  const beamMesh = beam.build(scene, 'post-beam-mesh', material)
  beamMesh.parent = beamPivot
  meshes.push(beamMesh)

  // a letter drops into the pillar box slot
  const letter = new Batch()
  letter.box({ c: [0, 0, 0], s: [0.2, 0.13, 0.015], color: rgb(C.cream, 1.1) })
  const letterMesh = letter.build(scene, 'post-letter', glowMat)
  letterMesh.position.set(-3.3, 1.3, 2.0)
  meshes.push(letterMesh)

  // dust motes drift in the window light
  const motes = [0, 1].map((n) => {
    const m = new Batch()
    for (let i = 0; i < 24; i += 1) {
      const t = i * 12.9898 + n * 4.1
      const u = (k) => Math.abs(Math.sin(t * k)) % 1
      m.box({
        c: [(u(1.3) - 0.5) * 6, 1 + u(2.7) * 2.3, 0.5 + u(4.1) * 3.5],
        s: [0.025, 0.025, 0.025],
        color: rgb('#fff1c4', 1.3),
      })
    }
    const mesh = m.build(scene, `post-motes-${n}`, glowMat)
    meshes.push(mesh)
    return mesh
  })

  const postmaster = resident(
    scene,
    { budget, reduced },
    {
      name: 'postmaster',
      fur: 'dockB',
      hat: 'cap',
      cap: [0.55, 0.12, 0.14],
      scarf: [0.9, 0.82, 0.55],
      pos: [2.45, 0, 1.7],
      yaw: 2.3,
      seed: 5,
    },
  )

  const animate = budget.animate && !reduced()
  return {
    camera: { pos: [0, 1.55, -3.6], target: [0, 1.5, 3], fov: 1.1, drift: [0.22, 0.06, 44] },
    update(dt, time) {
      if (!animate) return
      postmaster.update(dt)
      sun.intensity = 1.6 + Math.sin(time * 0.35) * 0.12
      beamPivot.rotation.x = Math.sin(time * 0.9) * 0.07
      motes.forEach((m, i) => {
        m.position.y = Math.sin(time * 0.25 + i * 2) * 0.12
        m.position.x = Math.sin(time * 0.17 + i) * 0.18
      })
      // one drop every six seconds, falling in the first 0.7s
      const p = (time % 6) / 0.7
      letterMesh.isVisible = p < 1
      letterMesh.position.y = 1.32 - p * 0.28
      letterMesh.scaling.y = 1 - p * 0.5
    },
    dispose() {
      postmaster.dispose()
      for (const m of meshes) m.dispose()
      for (const l of [fill, sun, front]) l.dispose()
      for (const m of [material, glowMat, labelMat]) m.dispose()
      atlas.texture.dispose()
    },
  }
}
