import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { glowMaterial, toonMaterial } from '../../hub/scenes/wharf/toon.js'
import { hemi, labelAtlas, lamp, resident, shell } from './kit.js'

// thames river police clearance tower records room, 1880: cool lamplight and police blue
const C = {
  wall: '#2f4474',
  wainscot: '#1c2a4e',
  floorA: '#3a2d26',
  floorB: '#33281f',
  ceiling: '#1a2238',
  beam: '#121a2c',
  trim: '#9fb8f0',
  brass: '#c9a860',
  steel: '#7a8aa6',
  dark: '#10141e',
  paper: '#e8e0c4',
  walnut: '#4a3626',
}
const ROOM_TOON = {
  shade: [0.3, 0.34, 0.46],
  mid: [0.62, 0.68, 0.8],
  lit: [1.0, 1.0, 0.95],
  rim: [0.3, 0.45, 0.8],
  t1: 0.28,
  t2: 0.8,
}
// clearance levels shown on the tabs
const TABS = ['#3fae6a', '#3f7ad8', '#e0a43a', '#c8403a']

// filing cabinets across the back wall, each drawer with a coloured clearance tab
function cabinets(b) {
  for (let i = 0; i < 6; i += 1) {
    const x = -4.0 + i * 0.9
    b.box({ c: [x, 1.0, 4.2], s: [0.86, 2.0, 0.6], color: rgb(C.steel, 0.65) })
    for (let d = 0; d < 5; d += 1) {
      const y = 0.22 + d * 0.38
      b.box({ c: [x, y, 3.9], s: [0.78, 0.33, 0.03], color: rgb(C.steel, 0.9 + (d % 2) * 0.08) })
      b.box({ c: [x, y + 0.03, 3.87], s: [0.2, 0.025, 0.03], color: rgb(C.brass, 1) })
      b.box({ c: [x, y - 0.08, 3.875], s: [0.2, 0.09, 0.02], color: rgb(TABS[(i + d) % 4], 1) })
    }
  }
}

// wire cage with a padlocked door and document boxes inside
function cage(b, labels, atlas) {
  const x = -4.2
  for (let z = 0.5; z <= 3.3; z += 0.2)
    b.cylinder({ c: [x, 1.1, z], r: 0.012, h: 2.2, seg: 4, color: rgb(C.steel, 0.9) })
  for (const y of [0.05, 0.7, 1.4, 2.2])
    b.box({ c: [x, y, 1.9], s: [0.05, 0.04, 2.9], color: rgb(C.steel, 0.8) })
  for (const z of [0.5, 3.3])
    b.box({ c: [x, 1.1, z], s: [0.06, 2.2, 0.06], color: rgb(C.steel, 0.8) })
  // shelves and document boxes behind the wire
  for (const y of [0.6, 1.2, 1.8])
    b.box({ c: [x - 0.22, y, 1.9], s: [0.4, 0.04, 2.8], color: rgb(C.walnut, 0.9) })
  for (let r = 0; r < 3; r += 1)
    for (let i = 0; i < 6; i += 1)
      b.box({
        c: [x - 0.22, 0.75 + r * 0.6, 0.7 + i * 0.45],
        s: [0.3, 0.26, 0.34],
        color: rgb(['#d8cfa8', '#c9b98a', '#b8a578'][(i + r) % 3], 0.9),
      })
  // door with padlock
  b.box({ c: [x + 0.03, 1.0, 1.9], s: [0.04, 0.05, 0.7], color: rgb(C.steel, 0.8) })
  b.box({ c: [x + 0.08, 1.05, 2.2], s: [0.1, 0.14, 0.1], color: rgb(C.brass, 1) })
  labels.box({
    c: [x + 0.08, 2.5, 1.9],
    s: [0.03, 0.34, 1.4],
    uv: atlas.uv(4),
    color: rgb('#ffffff', 0.9),
  })
}

// key board with one hook per role
function keyBoard(b, labels, atlas) {
  const roles = [5, 6, 7, 8]
  b.box({ c: [3.1, 2.0, 4.44], s: [2.6, 1.7, 0.06], color: rgb(C.walnut, 0.95) })
  b.box({ c: [3.1, 2.0, 4.4], s: [2.4, 1.5, 0.03], color: rgb('#1d2a22', 1) })
  roles.forEach((cell, i) => {
    const x = 2.25 + i * 0.57
    b.cylinder({ c: [x, 2.3, 4.34], r: 0.02, h: 0.06, seg: 5, color: rgb(C.brass, 1) })
    b.bar([x, 2.3, 4.34], [x, 1.95, 4.3], 0.015, { color: rgb(C.brass, 0.9) })
    b.cylinder({ c: [x, 1.85, 4.3], r: 0.06, h: 0.03, seg: 8, color: rgb(TABS[i], 1.1) })
    b.box({ c: [x, 1.65, 4.3], s: [0.03, 0.2, 0.015], color: rgb(C.brass, 1) })
    b.box({ c: [x + 0.03, 1.58, 4.3], s: [0.06, 0.04, 0.015], color: rgb(C.brass, 1) })
    labels.box({
      c: [x, 1.35, 4.36],
      s: [0.5, 0.17, 0.02],
      uv: atlas.uv(cell),
      color: rgb('#ffffff', 0.9),
    })
  })
}

// four desks in a row, each with a nameplate and lamp
function desks(b, g, labels, atlas) {
  ;[0, 1, 2, 3].forEach((i) => {
    const x = -2.5 + i * 1.65
    const z = 1.9
    b.box({ c: [x, 0.74, z], s: [1.3, 0.07, 0.8], color: rgb(C.walnut, 1.1) })
    b.box({ c: [x, 0.37, z + 0.35], s: [1.2, 0.74, 0.06], color: rgb(C.walnut, 0.75) })
    for (const s of [-1, 1])
      b.box({ c: [x + s * 0.58, 0.37, z], s: [0.08, 0.74, 0.7], color: rgb(C.walnut, 0.75) })
    b.box({ c: [x, 0.785, z - 0.02], s: [0.7, 0.01, 0.45], color: rgb('#1b2c4a', 1.3) })
    b.box({
      c: [x - 0.25, 0.8, z - 0.05],
      s: [0.22, 0.03, 0.16],
      color: rgb(C.paper, 0.95),
      yaw: 0.2 + i * 0.1,
    })
    b.box({ c: [x, 0.9, z - 0.38], s: [0.4, 0.1, 0.03], color: rgb(C.brass, 0.9) })
    labels.box({
      c: [x, 0.9, z - 0.405],
      s: [0.36, 0.08, 0.01],
      uv: atlas.uv(i),
      color: rgb('#ffffff', 0.95),
    })
    // chair
    b.box({ c: [x, 0.42, z + 0.75], s: [0.4, 0.05, 0.4], color: rgb(C.walnut, 0.9) })
    b.box({ c: [x, 0.75, z + 0.95], s: [0.4, 0.55, 0.05], color: rgb(C.walnut, 0.8) })
    // lamp
    b.cylinder({ c: [x + 0.4, 0.8, z + 0.1], r: 0.06, h: 0.03, seg: 8, color: rgb(C.brass, 0.9) })
    b.cylinder({ c: [x + 0.4, 0.98, z + 0.1], r: 0.012, h: 0.3, seg: 5, color: rgb(C.brass, 1) })
    g.box({ c: [x + 0.4, 1.16, z + 0.1], s: [0.22, 0.1, 0.12], color: rgb('#cfe0ff', 0.95) })
  })
  // confidential stamp and ink pad on the first desk
  b.box({ c: [-2.05, 0.82, 1.85], s: [0.14, 0.04, 0.12], color: rgb('#2a1c14', 1.2) })
  b.cylinder({ c: [-2.05, 0.92, 1.85], r: 0.025, h: 0.16, seg: 6, color: rgb(C.walnut, 1.3) })
  b.box({ c: [-2.3, 0.805, 1.75], s: [0.16, 0.012, 0.1], color: rgb('#a02a30', 1.1) })
  labels.box({
    c: [-2.6, 0.81, 1.8],
    s: [0.3, 0.012, 0.12],
    uv: atlas.uv(9),
    color: rgb('#ffffff', 0.85),
    yaw: 0.2,
  })
}

// duty sergeant's desk in the foreground
function dutyDesk(b) {
  b.box({ c: [0, 0.76, -0.3], s: [4.4, 0.08, 1.2], color: rgb(C.walnut, 1.1) })
  b.box({ c: [0, 0.38, 0.25], s: [4.3, 0.74, 0.08], color: rgb(C.walnut, 0.8) })
  for (const x of [-2.1, 2.1])
    b.box({ c: [x, 0.38, -0.3], s: [0.1, 0.74, 1.1], color: rgb(C.walnut, 0.8) })
  b.box({ c: [0, 0.81, -0.4], s: [2.0, 0.01, 0.7], color: rgb('#1b2c4a', 1.3) })
}

// one gear as a ring of bars: rim, spokes and teeth in the xy plane
function gear(batch, r, teeth, color) {
  const n = teeth * 2
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2
    const a2 = ((i + 1) / n) * Math.PI * 2
    batch.bar(
      [Math.sin(a) * r, Math.cos(a) * r, 0],
      [Math.sin(a2) * r, Math.cos(a2) * r, 0],
      0.05,
      { color },
    )
  }
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * Math.PI * 2
    batch.bar(
      [Math.sin(a) * r, Math.cos(a) * r, 0],
      [Math.sin(a) * (r + 0.1), Math.cos(a) * (r + 0.1), 0],
      0.09,
      { color },
    )
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    batch.bar([0, 0, 0], [Math.sin(a) * r, Math.cos(a) * r, 0], 0.04, { color })
  }
  batch.box({ c: [0, 0, 0], s: [0.14, 0.14, 0.09], color })
}

export function buildClearanceRoom({ scene, budget, reduced }) {
  scene.clearColor = new Color4(0.03, 0.04, 0.07, 1)
  const fill = hemi(scene, { intensity: 0.55, diffuse: [0.6, 0.7, 0.95], ground: [0.2, 0.18, 0.2] })
  const cool = lamp(scene, 'cool', [0, 2.9, 1.8], [0.7, 0.8, 1], 1.5, 12)
  const lanternLight = lamp(scene, 'lantern', [3.6, 2.4, 0.2], [0.35, 0.55, 1], 1.4, 7)
  const warm = lamp(scene, 'warm', [-1, 1.7, 1.4], [1, 0.85, 0.55], 0.7, 6)

  const solid = new Batch()
  const glow = new Batch()
  const labels = new Batch()
  shell(solid, C)
  const atlas = labelAtlas(scene, 'clearance-atlas', [
    [['HALE'], '#c9a860', '#1c1408'],
    [['OKAFOR'], '#c9a860', '#1c1408'],
    [['VANCE'], '#c9a860', '#1c1408'],
    [['LIM'], '#c9a860', '#1c1408'],
    [['RESTRICTED', 'CLEARANCE ONLY'], '#1b2a4a', '#e8e0c4'],
    [['STUDENT'], '#e8e0c4', '#1c1408'],
    [['TEACHER'], '#e8e0c4', '#1c1408'],
    [['ADMIN'], '#e8e0c4', '#1c1408'],
    [['AUDIT'], '#e8e0c4', '#1c1408'],
    [['CONFIDENTIAL'], '#e8e0c4', '#b2262a'],
  ])
  cabinets(solid)
  cage(solid, labels, atlas)
  keyBoard(solid, labels, atlas)
  desks(solid, glow, labels, atlas)
  dutyDesk(solid)
  // police blue notice strip above the cabinets
  glow.box({ c: [0, 1.15, 4.46], s: [9, 0.025, 0.03], color: rgb('#6a96e8', 0.9) })

  const material = toonMaterial(scene, 'clearance-room', { twoSided: true, options: ROOM_TOON })
  material.maxSimultaneousLights = 4
  const glowMat = glowMaterial(scene, 'clearance-glow', { fog: false })
  const labelMat = glowMaterial(scene, 'clearance-labels', { texture: atlas.texture, fog: false })
  const meshes = [
    solid.build(scene, 'clearance-solid', material),
    glow.build(scene, 'clearance-glow', glowMat),
    labels.build(scene, 'clearance-labels', labelMat),
  ]

  // clock gears above the cabinets
  const gearMat = material
  const mk = (name, x, y, r, teeth, color) => {
    const pivot = new TransformNode(name, scene)
    pivot.position.set(x, y, 4.4)
    const g = new Batch()
    gear(g, r, teeth, color)
    const mesh = g.build(scene, `${name}-mesh`, gearMat)
    mesh.parent = pivot
    meshes.push(mesh)
    return pivot
  }
  const gearA = mk('gear-a', -1.4, 3.0, 0.5, 12, rgb(C.brass, 0.95))
  const gearB = mk('gear-b', -0.32, 3.2, 0.38, 9, rgb(C.brass, 0.8))
  const gearC = mk('gear-c', 0.52, 2.85, 0.28, 7, rgb('#8a9ab8', 0.9))

  // police lantern on the right wall, its glass pulses
  const lanternBatch = new Batch()
  lanternBatch.box({ c: [4.3, 2.5, 0.2], s: [0.28, 0.4, 0.28], color: rgb('#6aa0ff', 1.1) })
  const lanternMat = glowMaterial(scene, 'clearance-lantern', { fog: false })
  const lanternMesh = lanternBatch.build(scene, 'clearance-lantern-glass', lanternMat)
  const frame = new Batch()
  frame.box({ c: [4.3, 2.75, 0.2], s: [0.34, 0.06, 0.34], color: rgb(C.dark, 1.5) })
  frame.box({ c: [4.3, 2.25, 0.2], s: [0.34, 0.06, 0.34], color: rgb(C.dark, 1.5) })
  frame.bar([4.5, 2.5, 0.2], [4.3, 2.5, 0.2], 0.04, { color: rgb(C.dark, 1.5) })
  const frameMesh = frame.build(scene, 'clearance-lantern-frame', material)
  meshes.push(lanternMesh, frameMesh)

  const policeman = resident(
    scene,
    { budget, reduced },
    {
      name: 'policeman',
      fur: 'dockB',
      hat: 'cap',
      cap: [0.1, 0.18, 0.42],
      scarf: [0.16, 0.26, 0.55],
      pos: [2.85, 0, 0.7],
      yaw: -2.6,
      size: 1.05,
      seed: 41,
    },
  )

  const animate = budget.animate && !reduced()
  return {
    camera: { pos: [0, 1.55, -3.6], target: [0, 1.5, 3], fov: 1.1, drift: [0.22, 0.06, 44] },
    update(dt, time) {
      if (!animate) return
      policeman.update(dt)
      // meshing gears turn in opposite directions at matched tooth speed
      gearA.rotation.z = time * 0.2
      gearB.rotation.z = -time * 0.2 * (12 / 9) + 0.15
      gearC.rotation.z = time * 0.2 * (12 / 7) + 0.3
      const pulse = 0.8 + Math.sin(time * 1.6) * 0.2
      lanternMat.emissiveColor = new Color3(pulse, pulse, pulse)
      lanternLight.intensity = 1.4 * pulse
      cool.intensity = 1.5 + Math.sin(time * 6.1) * 0.03
    },
    dispose() {
      policeman.dispose()
      for (const m of meshes) m.dispose()
      for (const l of [fill, cool, lanternLight, warm]) l.dispose()
      for (const m of [material, glowMat, labelMat, lanternMat]) m.dispose()
      atlas.texture.dispose()
    },
  }
}
