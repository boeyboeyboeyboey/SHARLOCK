import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { glowMaterial, toonMaterial } from '../../hub/scenes/wharf/toon.js'
import { createCapybaraStatic, furStyles } from '../../hub/scenes/shared/capybara.js'
import { socialHero } from './heroes.js'
import { hemi, heroBoard, labelAtlas, lamp, resident, shell, toon } from './kit.js'

// the capybara & crown snug, 1880: firelight on cream plaster, timber and sky green upholstery
const C = {
  wall: '#a8906a',
  wainscot: '#4a3020',
  floorA: '#4e3624',
  floorB: '#45301f',
  ceiling: '#6a5038',
  beam: '#2b1d14',
  trim: '#c79a43',
  brass: '#c79a43',
  walnut: '#5a3a26',
  green: '#6fbf9a',
  greenDark: '#3c7a5e',
  stone: '#8a7a68',
  dark: '#16100c',
  cream: '#f1e6c4',
}
const ROOM_TOON = {
  shade: [0.38, 0.34, 0.34],
  mid: [0.74, 0.66, 0.58],
  lit: [1.25, 1.0, 0.72],
  rim: [0.55, 0.35, 0.2],
  t1: 0.28,
  t2: 0.8,
}

function fireplace(b, g) {
  const x = 0.6
  b.box({ c: [x, 1.2, 4.3], s: [2.8, 2.4, 0.4], color: rgb(C.stone, 0.95) })
  b.box({ c: [x, 2.7, 4.35], s: [1.8, 1.8, 0.3], color: rgb(C.stone, 0.85) })
  for (let r = 0; r < 6; r += 1)
    for (let i = 0; i < 6; i += 1)
      if ((r + i) % 2 === 0)
        b.box({
          c: [x - 1.2 + i * 0.48, 0.1 + r * 0.38, 4.09],
          s: [0.44, 0.02, 0.02],
          color: rgb(C.dark, 1.5),
        })
  // opening, hearth and mantel
  g.box({ c: [x, 0.62, 4.1], s: [1.3, 0.95, 0.02], color: rgb('#1a0e08', 0.9) })
  b.box({ c: [x, 0.03, 3.7], s: [2.2, 0.06, 1.0], color: rgb(C.stone, 1.1) })
  b.box({ c: [x, 1.35, 4.0], s: [3.0, 0.14, 0.6], color: rgb(C.walnut, 1.15) })
  for (const s of [-1, 1])
    b.box({ c: [x + s * 0.72, 0.6, 4.05], s: [0.16, 1.2, 0.2], color: rgb(C.stone, 1.15) })
  // logs
  b.bar([x - 0.45, 0.14, 3.95], [x + 0.45, 0.2, 3.95], 0.12, { color: rgb('#3a2418', 1) })
  b.bar([x - 0.35, 0.2, 3.88], [x + 0.4, 0.14, 3.88], 0.1, { color: rgb('#46291a', 1) })
  // mantel clock and candlesticks
  b.box({ c: [x, 1.6, 4.0], s: [0.3, 0.34, 0.14], color: rgb(C.brass, 0.85) })
  for (const s of [-0.7, 0.7]) {
    b.cylinder({ c: [x + s, 1.55, 4.0], r: 0.04, h: 0.24, seg: 6, color: rgb(C.cream, 1) })
    g.box({ c: [x + s, 1.7, 4.0], s: [0.03, 0.06, 0.03], color: rgb('#ffcf70', 1.6) })
  }
}

function door(b, labels, atlas) {
  b.box({ c: [-3.2, 1.1, 4.44], s: [1.1, 2.4, 0.1], color: rgb(C.walnut, 0.7) })
  b.box({ c: [-3.2, 1.1, 4.38], s: [0.9, 2.2, 0.05], color: rgb(C.walnut, 1.05) })
  for (const y of [0.55, 1.65])
    b.box({ c: [-3.2, y, 4.35], s: [0.7, 0.7, 0.03], color: rgb(C.walnut, 0.8) })
  b.cylinder({ c: [-2.8, 1.0, 4.3], r: 0.04, h: 0.05, seg: 8, color: rgb(C.brass, 1.1) })
  labels.box({
    c: [-3.2, 2.0, 4.34],
    s: [0.5, 0.2, 0.03],
    uv: atlas.uv(1),
    color: rgb('#ffffff', 0.9),
  })
}

function chalkboard(b, labels, atlas) {
  b.box({ c: [3.1, 2.15, 4.44], s: [2.1, 1.35, 0.06], color: rgb(C.walnut, 0.9) })
  labels.box({
    c: [3.1, 2.15, 4.4],
    s: [1.9, 1.15, 0.04],
    uv: atlas.uv(0),
    color: rgb('#ffffff', 0.95),
  })
  b.box({ c: [3.1, 1.45, 4.38], s: [1.9, 0.04, 0.08], color: rgb(C.walnut, 0.9) })
}

// green booth: high-backed bench, table with a cloth
function booth(b, z, yaw = 0) {
  const sx = (x) => x
  b.box({ c: [sx(-4.1), 0.5, z], s: [0.5, 1.0, 1.7], color: rgb(C.green, 0.75) })
  b.box({ c: [sx(-4.35), 1.1, z], s: [0.1, 1.8, 1.8], color: rgb(C.greenDark, 0.8) })
  for (const s of [-1, 1])
    b.box({ c: [-4.0, 0.55, z + s * 0.9], s: [0.7, 1.1, 0.08], color: rgb(C.walnut, 0.85) })
  b.cylinder({ c: [-2.9, 0.4, z], r: 0.07, h: 0.8, seg: 6, color: rgb(C.walnut, 0.8) })
  b.cylinder({ c: [-2.9, 0.82, z], r: 0.6, h: 0.05, seg: 14, color: rgb(C.walnut, 1.1) })
  b.cylinder({
    c: [-2.9, 0.78, z],
    r: 0.66,
    rTop: 0.62,
    h: 0.09,
    seg: 14,
    color: rgb('#efe4c6', 1),
  })
  b.box({ c: [-2.1 + yaw, 0.28, z], s: [0.4, 0.56, 0.4], color: rgb(C.walnut, 0.75) })
}

function pint(b, x, y, z) {
  b.cylinder({
    c: [x, y + 0.07, z],
    r: 0.05,
    rTop: 0.06,
    h: 0.14,
    seg: 8,
    color: rgb('#c58a2a', 1.1),
  })
  b.cylinder({ c: [x, y + 0.155, z], r: 0.06, h: 0.03, seg: 8, color: rgb('#f6efd8', 1.2) })
}

// bar counter along the right wall with pumps and a back shelf
function bar(b, g) {
  b.box({ c: [3.15, 0.55, 1.4], s: [0.8, 1.1, 3.8], color: rgb(C.walnut, 0.8) })
  b.box({ c: [3.1, 1.13, 1.4], s: [1.0, 0.07, 3.9], color: rgb(C.walnut, 1.25) })
  b.box({ c: [2.72, 0.12, 1.4], s: [0.06, 0.06, 3.8], color: rgb(C.brass, 0.8) })
  for (const z of [0.4, 1.2, 2.0]) {
    b.cylinder({ c: [3.1, 1.3, z], r: 0.04, h: 0.34, seg: 6, color: rgb(C.brass, 1) })
    b.cylinder({
      c: [3.1, 1.55, z],
      r: 0.05,
      rTop: 0.035,
      h: 0.2,
      seg: 7,
      color: rgb(z === 1.2 ? C.green : C.cream, 1),
    })
    b.bar([3.1, 1.34, z], [2.94, 1.28, z], 0.025, { color: rgb(C.brass, 1) })
  }
  pint(b, 2.95, 1.17, 2.8)
  pint(b, 3.2, 1.17, 3.0)
  // back shelf with bottles and a mirror
  b.box({ c: [4.46, 2.0, 1.4], s: [0.06, 1.6, 3.2], color: rgb(C.dark, 1.5) })
  g.box({ c: [4.42, 2.45, 1.4], s: [0.02, 0.7, 2.6], color: rgb('#a8c8c0', 0.65) })
  for (const y of [1.45, 1.85])
    b.box({ c: [4.3, y, 1.4], s: [0.3, 0.05, 3.0], color: rgb(C.walnut, 0.9) })
  for (let i = 0; i < 12; i += 1) {
    const z = 0.05 + i * 0.25
    b.cylinder({
      c: [4.3, 1.62, z],
      r: 0.05,
      h: 0.3,
      seg: 6,
      color: rgb(['#2a5a3a', '#7a4a1a', '#3a2a1a', '#5a2a30'][i % 4], 1),
    })
    if (i % 2)
      b.cylinder({
        c: [4.3, 2.02, z + 0.05],
        r: 0.055,
        h: 0.3,
        seg: 6,
        color: rgb(['#c58a2a', '#2a5a3a'][(i >> 1) % 2], 1),
      })
  }
}

function lanterns(b, g) {
  for (const [x, z] of [
    [-1.2, 2.2],
    [1.6, 1.0],
  ]) {
    b.bar([x, 3.8, z], [x, 3.3, z], 0.02, { color: rgb(C.dark, 1.4) })
    b.cylinder({ c: [x, 3.2, z], r: 0.15, rTop: 0.1, h: 0.22, seg: 6, color: rgb(C.brass, 0.9) })
    g.box({ c: [x, 3.2, z], s: [0.16, 0.18, 0.16], color: rgb('#ffcf80', 1.3) })
  }
}

// the landlord's notice board: a parchment face in a walnut frame, with a message book, candles and a pint on the ledge
function noticeBoard(b, g) {
  const { z, bottom, top } = heroBoard(b, socialHero, {
    face: C.cream,
    faceGain: 1.4,
    frame: C.walnut,
    brass: C.brass,
  })
  const ly = bottom - 0.27
  b.box({ c: [-0.8, ly + 0.02, z - 0.2], s: [0.5, 0.03, 0.3], color: rgb('#5a2a24', 1) })
  b.box({ c: [-0.8, ly + 0.045, z - 0.2], s: [0.46, 0.012, 0.26], color: rgb(C.cream, 0.7) })
  pint(b, 0.9, ly, z - 0.2)
  for (const x of [-1.3, 1.3]) {
    b.cylinder({ c: [x, ly + 0.1, z - 0.2], r: 0.035, h: 0.2, seg: 6, color: rgb(C.cream, 1) })
    g.box({ c: [x, ly + 0.24, z - 0.2], s: [0.03, 0.07, 0.03], color: rgb('#ffcf70', 1.7) })
  }
  // lantern brackets over the top rail
  for (const x of [-1, 1]) {
    b.bar([x * 1.3, top + 0.24, z], [x * 1.3, top + 0.4, z - 0.12], 0.025, {
      color: rgb(C.brass, 1),
    })
    g.box({ c: [x * 1.3, top + 0.46, z - 0.14], s: [0.16, 0.12, 0.16], color: rgb('#ffb347', 1.5) })
  }
}

export function buildSnugRoom({ scene, budget, reduced }) {
  scene.clearColor = new Color4(0.05, 0.035, 0.03, 1)
  const fill = hemi(scene, { intensity: 0.38, diffuse: [1, 0.86, 0.7], ground: [0.32, 0.22, 0.16] })
  const fire = lamp(scene, 'fire', [0.6, 0.7, 3.2], [1, 0.55, 0.22], 2.0, 11)
  const hang = lamp(scene, 'hang', [0, 3.0, 1.6], [1, 0.8, 0.5], 1.0, 9)
  const tap = lamp(scene, 'tap', [-2.4, 1.6, 0.0], [0.75, 1, 0.85], 0.5, 6)
  // firelight on the front of the board
  const glowLamp = lamp(scene, 'board-fire', [0, 2.2, -2.6], [1, 0.62, 0.3], 1.1, 5)

  const solid = new Batch()
  const glow = new Batch()
  const labels = new Batch()
  shell(solid, C)
  const atlas = labelAtlas(
    scene,
    'snug-atlas',
    [
      [['Loose lips...', 'Ale 2d   Porter 1d'], '#1f2a26', '#f1ecd8'],
      [['PRIVATE'], '#2a1c12', '#e6c26a'],
      [['THE SNUG'], '#2a1c12', '#e6c26a'],
    ],
    [2048, 1024],
  )
  fireplace(solid, glow)
  door(solid, labels, atlas)
  chalkboard(solid, labels, atlas)
  booth(solid, 0.6)
  booth(solid, 2.9)
  bar(solid, glow)
  lanterns(solid, glow)
  noticeBoard(solid, glow)
  labels.box({
    c: [0, socialHero.corners[0][1] + 0.12, socialHero.corners[0][2] - 0.09],
    s: [1.5, 0.17, 0.02],
    uv: atlas.uv(2),
    color: rgb('#ffffff', 1.1),
  })
  // drinks on the tables
  pint(solid, -2.75, 0.85, 3.0)
  pint(solid, -3.05, 0.85, 2.75)
  solid.cylinder({
    c: [-2.8, 0.88, 0.55],
    r: 0.05,
    rTop: 0.065,
    h: 0.05,
    seg: 8,
    color: rgb('#f4efe2', 1.2),
  })
  solid.box({ c: [-2.8, 0.85, 0.55], s: [0.2, 0.01, 0.2], color: rgb('#f4efe2', 1.1) })
  // dim glow under the bar rail and the sconce above the door
  glow.box({ c: [-3.2, 2.6, 4.42], s: [0.18, 0.18, 0.1], color: rgb('#ffcf80', 1.2) })

  const material = toonMaterial(scene, 'snug-room', { twoSided: true, options: ROOM_TOON })
  material.maxSimultaneousLights = 4
  const glowMat = glowMaterial(scene, 'snug-glow', { fog: false })
  const labelMat = glowMaterial(scene, 'snug-labels', { texture: atlas.texture, fog: false })
  const meshes = [
    solid.build(scene, 'snug-solid', material),
    glow.build(scene, 'snug-glow', glowMat),
    labels.build(scene, 'snug-labels', labelMat),
  ]

  // flames: three tongues that flicker in height
  const flames = new Batch()
  flames.box({ c: [0, 0, 0], s: [0.3, 0.5, 0.12], color: rgb('#ff8a2a', 1.5) })
  flames.box({ c: [0.25, -0.08, 0.02], s: [0.2, 0.34, 0.1], color: rgb('#ffb347', 1.5) })
  flames.box({ c: [-0.25, -0.1, 0.02], s: [0.2, 0.3, 0.1], color: rgb('#ffc36a', 1.5) })
  const flameMesh = flames.build(scene, 'snug-flames', glowMat)
  flameMesh.position.set(0.6, 0.45, 3.95)
  meshes.push(flameMesh)

  // steam puffs rise off the teacup and fade out by shrinking
  const steam = new Batch()
  for (let i = 0; i < 3; i += 1)
    steam.box({
      c: [(i - 1) * 0.03, i * 0.09, 0],
      s: [0.045, 0.045, 0.045],
      color: rgb('#f4efe2', 1.2),
    })
  const steamMesh = steam.build(scene, 'snug-steam', glowMat)
  steamMesh.position.set(-2.8, 0.95, 0.55)
  meshes.push(steamMesh)

  // the patron in the far booth, with a pint on the table
  const patron = createCapybaraStatic(scene, {
    style: furStyles.dockB,
    cap: [0.32, 0.22, 0.16],
    name: 'patron',
    toon,
  })
  patron.scaling.setAll(1.0)
  patron.position.set(-3.7, 0.12, 2.9)
  patron.rotation.y = Math.PI / 2 + 0.15
  meshes.push(patron)

  const publican = resident(
    scene,
    { budget, reduced },
    {
      name: 'publican',
      fur: 'dockA',
      hat: null,
      cap: [0.3, 0.2, 0.14],
      scarf: [0.9, 0.9, 0.82],
      pos: [1.9, 0, 2.5],
      yaw: 2.9,
      size: 1.05,
      seed: 29,
    },
  )

  const animate = budget.animate && !reduced()
  return {
    camera: { ...socialHero.camera, drift: [0, 0, 44] },
    update(dt, time) {
      if (!animate) return
      publican.update(dt)
      fire.intensity = 2.0 + Math.sin(time * 9.1) * 0.25 + Math.sin(time * 15.7) * 0.18
      flameMesh.scaling.y = 1 + Math.sin(time * 11) * 0.14 + Math.sin(time * 19) * 0.08
      flameMesh.scaling.x = 1 + Math.sin(time * 7.3 + 1) * 0.06
      const rise = (time * 0.35) % 1
      steamMesh.position.y = 0.95 + rise * 0.25
      steamMesh.scaling.setAll(1 - rise * 0.6)
      hang.intensity = 1.0 + Math.sin(time * 1.3) * 0.04
    },
    dispose() {
      publican.dispose()
      for (const m of meshes) m.dispose()
      for (const l of [fill, fire, hang, tap, glowLamp]) l.dispose()
      for (const m of [material, glowMat, labelMat]) m.dispose()
      atlas.texture.dispose()
    },
  }
}
