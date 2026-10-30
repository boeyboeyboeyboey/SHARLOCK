import { Scene } from '@babylonjs/core/scene.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import {
  cobbleTexture,
  glowTexture,
  plankTexture,
  stoneTexture,
  windowTexture,
} from '../../../features/hub/scenes/wharf/textures.js'
import { glowMaterial, toonMaterial } from '../../../features/hub/scenes/wharf/toon.js'
import { ARENA } from './arenaData.js'
import { stationView } from './arenaRules.js'

export const KIND_LABEL = {
  firewall: 'Firewall',
  patch: 'Patch',
  process: 'Process',
  hash: 'Hash',
  spoof: 'Spoof',
  account: 'Account',
}

// what each tier draws; counts only, the hub tier supplies shadows, post and render scale
const WORLD_BY_TIER = {
  desktop: { lamps: 10, sides: 4, skyline: 20, trim: true },
  compact: { lamps: 8, sides: 4, skyline: 12, trim: true },
  low: { lamps: 6, sides: 2, skyline: 0, trim: false },
}

const rgb = (c, k = 1) => new Color3(c[0] * k, c[1] * k, c[2] * k)

// boxes and cylinders are gathered per material and merged, so the whole yard is a handful of draws
function createKit() {
  const groups = new Map()
  return {
    add(mesh, material) {
      mesh.material = material
      if (!groups.has(material)) groups.set(material, [])
      groups.get(material).push(mesh)
      return mesh
    },
    finish(name, { pickable = false } = {}) {
      const out = []
      let i = 0
      for (const list of groups.values()) {
        const merged = list.length > 1 ? Mesh.MergeMeshes(list, true, true) : list[0]
        merged.name = `${name}-${i}`
        i += 1
        merged.isPickable = pickable
        merged.freezeWorldMatrix()
        out.push(merged)
      }
      groups.clear()
      return out
    },
  }
}

function draw(scene, name, w, h, paint) {
  const texture = new DynamicTexture(name, { width: w, height: h }, scene, true)
  paint(texture.getContext(), w, h)
  texture.update()
  texture.hasAlpha = true
  return texture
}

function drawIcon(g, kind, w, h, col) {
  g.strokeStyle = col
  g.fillStyle = col
  g.lineWidth = 7
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const cx = w / 2
  const cy = h / 2 - 8
  if (kind === 'firewall') {
    for (let r = 0; r < 4; r += 1)
      for (let c = 0; c < 4; c += 1)
        g.strokeRect(cx - 52 + c * 26 + (r % 2) * 13 - 6, cy - 44 + r * 22, 26, 22)
  } else if (kind === 'patch') {
    g.save()
    g.translate(cx, cy)
    g.rotate(-0.6)
    g.beginPath()
    g.roundRect(-52, -20, 104, 40, 18)
    g.stroke()
    for (const [x, y] of [
      [-12, -6],
      [6, -6],
      [-12, 4],
      [6, 4],
    ])
      g.fillRect(x, y, 6, 6)
    g.restore()
  } else if (kind === 'process') {
    for (let i = 0; i < 3; i += 1) {
      g.strokeRect(cx - 50, cy - 40 + i * 30, 20, 20)
      g.beginPath()
      g.moveTo(cx - 18, cy - 30 + i * 30)
      g.lineTo(cx + 50, cy - 30 + i * 30)
      g.stroke()
    }
  } else if (kind === 'hash') {
    g.font = '800 100px ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('#', cx, cy + 4)
  } else if (kind === 'spoof') {
    g.font = '800 96px system-ui'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('@', cx, cy + 4)
    g.beginPath()
    g.moveTo(cx - 52, cy + 44)
    g.lineTo(cx + 52, cy - 44)
    g.stroke()
  } else {
    g.strokeRect(cx - 36, cy - 6, 72, 54)
    g.beginPath()
    g.arc(cx, cy - 6, 24, Math.PI, 0)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy + 20, 7, 0, 7)
    g.fill()
  }
}

function screenTexture(scene, station, ready) {
  const col = ready ? '#7fe6ff' : '#8a93a0'
  return draw(scene, `scr-${station.id}-${ready ? 'on' : 'off'}`, 256, 192, (g, w, h) => {
    g.fillStyle = ready ? '#06202c' : '#12171d'
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 6) {
      g.fillStyle = 'rgba(255,255,255,.04)'
      g.fillRect(0, y, w, 2)
    }
    drawIcon(g, station.kind, w, h - 20, col)
    g.font = '700 26px system-ui'
    g.textAlign = 'center'
    g.fillStyle = col
    g.fillText(ready ? KIND_LABEL[station.kind].toUpperCase() : 'COOLING', w / 2, h - 14)
  })
}

const container = [
  [0.7, 0.22, 0.16],
  [0.2, 0.42, 0.6],
  [0.2, 0.5, 0.42],
  [0.82, 0.58, 0.18],
  [0.32, 0.36, 0.6],
]

// the night dockyard: ground, fence, stacks that fill the server wall rects exactly, lamps, warehouses and six kiosks
export function buildArenaWorld({ engine, tier, reduced }) {
  const cfg = WORLD_BY_TIER[tier.name] ?? WORLD_BY_TIER.compact
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.09, 0.1, 0.22, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogColor = new Color3(0.1, 0.11, 0.24)
  scene.fogDensity = 0.0105
  scene.ambientColor = new Color3(0.4, 0.42, 0.6)

  const hemi = new HemisphericLight('arena-hemi', new Vector3(0.2, 1, 0.1), scene)
  hemi.intensity = 0.8
  hemi.diffuse = new Color3(0.58, 0.62, 0.95)
  hemi.groundColor = new Color3(0.26, 0.2, 0.34)
  const moon = new DirectionalLight('arena-moon', new Vector3(-0.5, -1, 0.35), scene)
  moon.position = new Vector3(20, 40, -14)
  moon.intensity = 0.85
  moon.diffuse = new Color3(1, 0.82, 0.62)
  let shadow = null
  if (tier.shadowSize) {
    shadow = new ShadowGenerator(tier.shadowSize, moon)
    shadow.usePercentageCloserFiltering = true
    shadow.filteringQuality = ShadowGenerator.QUALITY_LOW
    shadow.bias = 0.002
    shadow.normalBias = 0.02
  }

  const { bounds, walls, stations } = ARENA
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const kit = createKit()
  const solid = (name, color) => {
    const m = toonMaterial(scene, name)
    m.diffuseColor = rgb(color)
    return m
  }
  const textured = (name, texture, tint = 1) => {
    const m = toonMaterial(scene, name, { texture })
    m.diffuseColor = new Color3(tint, tint, tint)
    return m
  }
  const box = (w, h, d, x, y, z, ry = 0) => {
    const b = CreateBox('b', { width: w, height: h, depth: d }, scene)
    b.position.set(x, y, z)
    b.rotation.y = ry
    return b
  }
  const cyl = (dTop, dBottom, h, x, y, z, tess = 10) => {
    const c = CreateCylinder(
      'c',
      { diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation: tess },
      scene,
    )
    c.position.set(x, y, z)
    return c
  }

  // ground: the hub's cobbles over the fenced yard, plain dark water-side earth beyond
  const cobble = cobbleTexture(scene, 'arena-cobble')
  cobble.uScale = width / 4
  cobble.vScale = depth / 4
  const ground = CreateGround('arena-ground', { width, height: depth }, scene)
  ground.material = textured('arena-ground', cobble, 0.82)
  ground.receiveShadows = true
  ground.isPickable = false
  ground.freezeWorldMatrix()
  const outer = CreateGround('arena-outer', { width: 220, height: 160 }, scene)
  outer.position.y = -0.3
  outer.material = solid('arena-outer', [0.06, 0.09, 0.2])
  outer.isPickable = false

  // painted lane dashes, plank rim along the long fences
  const paint = glowMaterial(scene, 'arena-paint', { color: new Color3(0.42, 0.34, 0.1) })
  for (let x = -20; x <= 20; x += 4) kit.add(box(2, 0.02, 0.22, x, 0.015, 0), paint)
  for (let z = -13; z <= 13; z += 4) kit.add(box(0.22, 0.02, 2, 0, 0.015, z), paint)
  const planks = plankTexture(scene, 'arena-planks')
  planks.uScale = 14
  planks.vScale = 1
  const deck = textured('arena-deck', planks, 0.85)
  for (const sz of [-1, 1]) kit.add(box(width, 0.12, 1.8, 0, 0.06, sz * (depth / 2 - 0.9)), deck)

  // fence: posts, rail and a faint mesh just inside the bounds
  const post = solid('arena-post', [0.25, 0.27, 0.35])
  const meshMat = new StandardMaterial('arena-fence-mesh', scene)
  meshMat.diffuseColor = rgb([0.5, 0.58, 0.7])
  meshMat.emissiveColor = rgb([0.12, 0.14, 0.2])
  meshMat.alpha = 0.18
  meshMat.backFaceCulling = false
  meshMat.specularColor = Color3.Black()
  const fence = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const n = Math.round(len / 2.5)
    const ang = Math.atan2(x2 - x1, z2 - z1)
    for (let i = 0; i <= n; i += 1)
      kit.add(
        cyl(0.14, 0.14, 2.6, x1 + ((x2 - x1) * i) / n, 1.3, z1 + ((z2 - z1) * i) / n, 6),
        post,
      )
    kit.add(box(0.1, 0.1, len, (x1 + x2) / 2, 2.6, (z1 + z2) / 2, ang), post)
    kit.add(box(0.05, 2.3, len, (x1 + x2) / 2, 1.3, (z1 + z2) / 2, ang), meshMat)
  }
  fence(bounds.minX, bounds.minZ, bounds.maxX, bounds.minZ)
  fence(bounds.minX, bounds.maxZ, bounds.maxX, bounds.maxZ)
  fence(bounds.minX, bounds.minZ, bounds.minX, bounds.maxZ)
  fence(bounds.maxX, bounds.minZ, bounds.maxX, bounds.maxZ)

  // stacks: one body per server wall rect, so the drawn edge is the collision edge
  const hoop = solid('arena-hoop', [0.12, 0.13, 0.16])
  const dark = solid('arena-dark', [0.16, 0.12, 0.1])
  const crateWood = textured('arena-crate', plankTexture(scene, 'arena-crate-planks'), 0.85)
  const barrelA = solid('arena-barrel-a', [0.2, 0.4, 0.55])
  const barrelB = solid('arena-barrel-b', [0.5, 0.2, 0.18])
  const mats = container.map((c, i) => solid(`arena-container-${i}`, c))
  const ribs = container.map((c, i) =>
    solid(
      `arena-rib-${i}`,
      c.map((v) => v * 0.65),
    ),
  )
  const roofClutter = []
  // boxes for the camera spring arm, one per server wall rect
  const blockers = []
  walls.forEach((w, i) => {
    const sx = w.maxX - w.minX
    const sz = w.maxZ - w.minZ
    const cx = (w.minX + w.maxX) / 2
    const cz = (w.minZ + w.maxZ) / 2
    if (Math.max(sx, sz) < 5) {
      // plank crate pile filling the centre block
      const h = 2
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        kit.add(
          box(sx / 2 - 0.02, h, sz / 2 - 0.02, cx + dx * (sx / 4), h / 2, cz + dz * (sz / 4)),
          crateWood,
        )
      kit.add(box(sx / 2, 1.6, sz / 2, cx, h + 0.8, cz, 0.3), crateWood)
      for (const sy of [0.1, h - 0.1]) kit.add(box(sx + 0.06, 0.14, sz + 0.06, cx, sy, cz), dark)
      blockers.push({ min: [w.minX, 0, w.minZ], max: [w.maxX, h + 1.6, w.maxZ] })
      roofClutter.push({ x: cx, y: h + 1.6, z: cz })
      return
    }
    const along = sx > sz
    const high = 2.6
    const levels = i % 3 === 0 ? 2 : 1
    for (let level = 0; level < levels; level += 1) {
      const idx = (i + level * 2) % mats.length
      const y = level * high
      kit.add(box(sx, high, sz, cx, y + high / 2, cz), mats[idx])
      if (cfg.trim) {
        for (let r = -2; r <= 2; r += 1) {
          const rib = along
            ? box(0.12, high - 0.1, sz + 0.08, cx + r * (sx / 5), y + high / 2, cz)
            : box(sx + 0.08, high - 0.1, 0.12, cx, y + high / 2, cz + r * (sz / 5))
          kit.add(rib, ribs[idx])
        }
        kit.add(
          along
            ? box(0.12, 0.12, sz + 0.1, cx, y + high * 0.5, cz)
            : box(sx + 0.1, 0.12, 0.12, cx, y + high * 0.5, cz),
          hoop,
        )
      }
    }
    blockers.push({ min: [w.minX, 0, w.minZ], max: [w.maxX, levels * high, w.maxZ] })
    roofClutter.push({ x: cx, y: levels * high, z: cz, along, sx, sz })
  })
  // clutter stays on top of the stacks and outside the fence so nothing looks solid that is not
  roofClutter.forEach((spot, i) => {
    if (!spot.sx) return
    const dx = spot.along ? 1.5 : 0
    const dz = spot.along ? 0 : 1.5
    kit.add(box(0.9, 0.9, 0.9, spot.x - dx, spot.y + 0.45, spot.z - dz, 0.3 * i), crateWood)
    kit.add(
      cyl(0.8, 0.8, 1.1, spot.x + dx, spot.y + 0.55, spot.z + dz, 12),
      i % 2 ? barrelA : barrelB,
    )
  })
  const outsideX = bounds.maxX + 1.4
  const outsideZ = bounds.maxZ + 1.4
  for (const [x, z] of [
    [-12, -outsideZ],
    [10, outsideZ],
    [outsideX, -6],
    [-outsideX, 8],
  ]) {
    kit.add(box(1.4, 1.4, 1.4, x, 0.7, z, 0.4), crateWood)
    kit.add(cyl(0.9, 0.9, 1.2, x + 1.5, 0.6, z + 0.4, 12), barrelB)
  }
  // bollards with a yellow cap just outside the long fences
  const yellow = glowMaterial(scene, 'arena-yellow', { color: new Color3(0.55, 0.42, 0.12) })
  for (let i = 0; i < 12; i += 1) {
    const x = -19.8 + i * 3.6
    const z = (i % 2 ? 1 : -1) * (depth / 2 + 0.7)
    kit.add(cyl(0.28, 0.38, 0.7, x, 0.35, z), hoop)
    kit.add(cyl(0.4, 0.4, 0.12, x, 0.72, z), yellow)
  }

  // lamps stand outside the fence; their pools of light fall inside it
  const lampSpots = [
    [-20, -1],
    [-7, -1],
    [7, -1],
    [20, -1],
    [-20, 1],
    [-7, 1],
    [7, 1],
    [20, 1],
  ]
    .map(([x, s]) => ({ x, z: s * (depth / 2 + 0.6), inward: -s }))
    .concat([
      { x: -(width / 2 + 0.6), z: 0, inward: 0, side: 1 },
      { x: width / 2 + 0.6, z: 0, inward: 0, side: -1 },
    ])
    .slice(0, cfg.lamps)
  const bulb = glowMaterial(scene, 'arena-bulb', { color: new Color3(1, 0.85, 0.5) })
  const haloMat = glowMaterial(scene, 'arena-halo', {
    texture: glowTexture(scene, 'arena-halo', [
      [0, 'rgba(255,200,110,0.9)'],
      [0.4, 'rgba(255,190,100,0.28)'],
      [1, 'rgba(255,190,100,0)'],
    ]),
    alphaMode: 1,
  })
  haloMat.disableDepthWrite = true
  const poolMat = glowMaterial(scene, 'arena-pool', {
    texture: glowTexture(
      scene,
      'arena-pool',
      [
        [0, 'rgba(255,190,100,0.85)'],
        [0.4, 'rgba(255,180,90,0.3)'],
        [1, 'rgba(255,180,90,0)'],
      ],
      256,
    ),
    alphaMode: 1,
  })
  poolMat.disableDepthWrite = true
  poolMat.zOffset = -2
  const additive = createKit()
  for (const lamp of lampSpots) {
    kit.add(cyl(0.14, 0.18, 4.4, lamp.x, 2.2, lamp.z, 8), post)
    kit
      .add(CreateSphere('bulb', { diameter: 0.4, segments: 8 }, scene), bulb)
      .position.set(lamp.x, 4.5, lamp.z)
    const halo = CreateSphere('halo', { diameter: 2.4, segments: 6 }, scene)
    halo.position.set(lamp.x, 4.5, lamp.z)
    additive.add(halo, haloMat)
    const pool = CreateDisc('pool', { radius: 4.6, tessellation: 24 }, scene)
    pool.rotation.x = Math.PI / 2
    pool.position.set(lamp.x + (lamp.side ?? 0) * 2.5, 0.03, lamp.z + lamp.inward * 2.5)
    additive.add(pool, poolMat)
  }

  // warehouses beyond the fence with lit windows, then a dark skyline
  const stone = stoneTexture(scene, 'arena-warehouse')
  stone.uScale = 3
  stone.vScale = 1.5
  const wallMat = textured('arena-warehouse', stone, 0.62)
  const roofMat = solid('arena-roof', [0.2, 0.15, 0.2])
  const windows = windowTexture(scene, 'arena-windows', true)
  windows.uScale = 4
  windows.vScale = 1.2
  const windowMat = glowMaterial(scene, 'arena-windows', {
    texture: windows,
    color: new Color3(0.62, 0.55, 0.42),
  })
  const sides = [
    { dir: [0, -1], row: [-26, -6, 14, 32] },
    { dir: [0, 1], row: [-30, -12, 10, 28] },
    { dir: [-1, 0], row: [-10, 8] },
    { dir: [1, 0], row: [-8, 10] },
  ].slice(0, cfg.sides)
  for (const side of sides) {
    side.row.forEach((offset, i) => {
      const w = 11 + ((i * 5) % 6)
      const h = 6 + ((i * 3) % 3) * 1.4
      const d = 8
      const horizontal = side.dir[1] !== 0
      const ox = horizontal ? offset : side.dir[0] * (width / 2 + 6 + d / 2)
      const oz = horizontal ? side.dir[1] * (depth / 2 + 6 + d / 2) : offset
      kit.add(box(horizontal ? w : d, h, horizontal ? d : w, ox, h / 2, oz), wallMat)
      kit.add(
        box(horizontal ? w + 1 : d + 1, 0.8, horizontal ? d + 1 : w + 1, ox, h + 0.3, oz),
        roofMat,
      )
      const face = CreatePlane('face', { width: w - 1.2, height: h - 2 }, scene)
      face.position.set(
        ox - (horizontal ? 0 : side.dir[0] * (d / 2 + 0.05)),
        h / 2 + 0.2,
        oz - (horizontal ? side.dir[1] * (d / 2 + 0.05) : 0),
      )
      face.rotation.y = horizontal
        ? side.dir[1] < 0
          ? Math.PI
          : 0
        : side.dir[0] < 0
          ? -Math.PI / 2
          : Math.PI / 2
      kit.add(face, windowMat)
    })
  }
  const skyline = solid('arena-skyline', [0.07, 0.08, 0.17])
  for (let i = 0; i < cfg.skyline; i += 1) {
    const w = 6 + ((i * 7) % 5)
    const h = 8 + ((i * 13) % 14)
    const ring = (i / cfg.skyline) * Math.PI * 2
    const r = 70 + (i % 3) * 8
    kit.add(box(w, h, 6, Math.cos(ring) * r * 1.3, h / 2 - 0.3, Math.sin(ring) * r), skyline)
  }
  const moonDisc = CreateDisc('arena-moon', { radius: 5, tessellation: 32 }, scene)
  moonDisc.position.set(-30, 38, 90)
  moonDisc.billboardMode = Mesh.BILLBOARDMODE_ALL
  moonDisc.material = glowMaterial(scene, 'arena-moon', {
    color: new Color3(1, 0.93, 0.78),
    fog: false,
  })
  moonDisc.isPickable = false

  // six kiosks: slim console, glowing screen with the kind icon, a ring that greys out while cooling
  const consoleMat = solid('arena-console', [0.22, 0.25, 0.34])
  const consoleTop = solid('arena-console-top', [0.16, 0.18, 0.26])
  const kiosks = stations.map((station) => {
    const face = Math.atan2(-station.x, -station.z)
    const place = (mesh, lx, ly, lz) => {
      mesh.position.set(
        station.x + lx * Math.cos(face) + lz * Math.sin(face),
        ly,
        station.z - lx * Math.sin(face) + lz * Math.cos(face),
      )
      mesh.rotation.y = face
      return mesh
    }
    kit.add(
      place(CreateBox('base', { width: 1.2, height: 1.1, depth: 0.7 }, scene), 0, 0.55, 0),
      consoleMat,
    )
    const top = place(
      CreateBox('top', { width: 1.4, height: 0.9, depth: 0.4 }, scene),
      0,
      1.45,
      0.05,
    )
    top.rotation.x = -0.2
    kit.add(top, consoleTop)
    const screen = CreatePlane(`screen-${station.id}`, { width: 1.2, height: 0.8 }, scene)
    screen.position.set(station.x + Math.sin(face) * 0.3, 1.5, station.z + Math.cos(face) * 0.3)
    screen.rotation.y = face + Math.PI
    screen.rotation.x = 0.2
    screen.isPickable = false
    const on = screenTexture(scene, station, true)
    const off = screenTexture(scene, station, false)
    const material = glowMaterial(scene, `screen-${station.id}`, {
      texture: on,
      backFaceCulling: false,
    })
    screen.material = material
    const ringMat = glowMaterial(scene, `ring-${station.id}`, {
      color: new Color3(0.3, 0.85, 1),
      alphaMode: 1,
    })
    ringMat.alpha = 0.22
    ringMat.disableDepthWrite = true
    const ring = CreateDisc(`ring-${station.id}`, { radius: 2.4, tessellation: 40 }, scene)
    ring.rotation.x = Math.PI / 2
    ring.position.set(station.x, 0.05, station.z)
    ring.material = ringMat
    ring.isPickable = false
    const coolMat = glowMaterial(scene, `cool-${station.id}`, {
      color: new Color3(0.55, 0.58, 0.64),
      alphaMode: 1,
    })
    coolMat.alpha = 0.4
    coolMat.disableDepthWrite = true
    const cool = CreateDisc(`cool-${station.id}`, { radius: 2.4, tessellation: 40 }, scene)
    cool.rotation.x = Math.PI / 2
    cool.position.set(station.x, 0.06, station.z)
    cool.material = coolMat
    cool.isPickable = false
    cool.setEnabled(false)
    return { station, screen, material, on, off, ring, ringMat, cool, cooling: null }
  })

  const statics = [...kit.finish('arena'), ...additive.finish('arena-glow')]
  for (const mesh of statics) {
    if (/^arena-\d+$/.test(mesh.name)) {
      mesh.receiveShadows = Boolean(shadow)
      if (shadow) shadow.addShadowCaster(mesh)
    }
  }

  const flicker = !reduced()
  return {
    scene,
    moon,
    shadow,
    kiosks,
    blockers,
    stationCenter: (id) => stations.find((s) => s.id === id),
    // station views from the snapshot; serverNow is the server clock in ms
    setStations(list, serverNow) {
      for (const kiosk of kiosks) {
        const snap = list.find((s) => s.id === kiosk.station.id)
        const view = stationView(snap, serverNow)
        if (kiosk.cooling !== view.cooling) {
          kiosk.cooling = view.cooling
          kiosk.material.diffuseTexture = view.cooling ? kiosk.off : kiosk.on
          kiosk.ring.setEnabled(!view.cooling)
        }
        if (view.cooling) {
          kiosk.cool.setEnabled(true)
          kiosk.cool.scaling.setAll(Math.max(0.05, view.progress))
        } else kiosk.cool.setEnabled(false)
        kiosk.cooling = view.cooling
      }
    },
    update(t) {
      if (flicker) {
        poolMat.alpha = 0.92 + Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.3) * 0.03
        for (const kiosk of kiosks)
          kiosk.ring.scaling.setAll(1 + Math.sin(t * 2 + kiosk.station.x) * 0.04)
      }
    },
    dispose() {
      shadow?.dispose()
    },
  }
}
