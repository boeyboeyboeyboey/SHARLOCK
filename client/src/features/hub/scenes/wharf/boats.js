import { Constants } from '@babylonjs/core/Engines/constants.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { Batch } from '../shared/geometry.js'
import { rng } from '../shared/random.js'
import { makeSmoke, puffTexture } from '../shared/particles.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { glowMaterial } from './toon.js'
import { glowTexture } from './textures.js'
import { quayZ, waterY } from './layout.js'

const TAU = Math.PI * 2
const dark = [0.16, 0.14, 0.17, 1]
const tar = [0.2, 0.15, 0.16, 1]

// tapered hull: stations along +z (bow), half beam per station, flat deck on top, near vertical sides
function hull(
  batch,
  {
    length,
    beam,
    depth = 0.7,
    freeboard = 0.55,
    bow = 0.35,
    side = tar,
    deck = [0.78, 0.6, 0.42, 1],
    stripe = [0.7, 0.18, 0.14, 1],
  },
) {
  const stations = 9
  const shape = (t) => {
    const stern = 0.82 + 0.18 * Math.min(1, t / 0.18)
    const start = 1 - bow
    const k = t > start ? Math.pow(1 - (t - start) / bow, 0.7) : 1
    return (beam / 2) * stern * Math.max(k, 0.03)
  }
  const zAt = (t) => -length / 2 + t * length
  const mid = (a, b2, f) => [
    a[0] + (b2[0] - a[0]) * f,
    a[1] + (b2[1] - a[1]) * f,
    a[2] + (b2[2] - a[2]) * f,
  ]
  for (let i = 0; i < stations - 1; i += 1) {
    const t0 = i / (stations - 1)
    const t1 = (i + 1) / (stations - 1)
    const w0 = shape(t0)
    const w1 = shape(t1)
    const z0 = zAt(t0)
    const z1 = zAt(t1)
    const sheer0 = freeboard + t0 * 0.35
    const sheer1 = freeboard + t1 * 0.35
    for (const s of [-1, 1]) {
      // corners run bottom-first-station, bottom-second, top-second, top-first; the order flips with the side to keep the face outward
      const pts =
        s > 0
          ? [
              [w0, -depth, z0],
              [w1, -depth, z1],
              [w1, sheer1, z1],
              [w0, sheer0, z0],
            ]
          : [
              [-w1, -depth, z1],
              [-w0, -depth, z0],
              [-w0, sheer0, z0],
              [-w1, sheer1, z1],
            ]
      batch.quad(pts, { color: side, normal: [s, 0, 0] })
      const lo0 = mid(pts[0], pts[3], 0.62)
      const lo1 = mid(pts[1], pts[2], 0.62)
      const o = s * 0.012
      const lift = (p) => [p[0] + o, p[1], p[2]]
      batch.quad([lift(lo0), lift(lo1), lift(pts[2]), lift(pts[3])], {
        color: stripe,
        normal: [s, 0, 0],
      })
    }
    batch.quad(
      [
        [-w0, sheer0, z0],
        [w0, sheer0, z0],
        [w1, sheer1, z1],
        [-w1, sheer1, z1],
      ],
      { color: deck, normal: [0, 1, 0] },
    )
  }
  const wS = shape(0)
  batch.quad(
    [
      [-wS, -depth, -length / 2],
      [wS, -depth, -length / 2],
      [wS, freeboard, -length / 2],
      [-wS, freeboard, -length / 2],
    ],
    { color: side, normal: [0, 0, -1] },
  )
}

function sail(
  batch,
  { tack, clew, peak, throat, nx = 7, ny = 5, bulge = 0.5, color, seams = true },
) {
  const lerp3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
  const at = (s, t) => {
    const bottom = lerp3(tack, clew, s)
    const top = lerp3(throat, peak, s)
    const p = lerp3(bottom, top, t)
    p[0] += Math.sin(Math.PI * s) * Math.sin(Math.PI * t) * bulge
    return p
  }
  for (let i = 0; i < nx; i += 1) {
    const tone = seams ? (i % 2 ? 0.93 : 1.04) : 1
    for (let j = 0; j < ny; j += 1) {
      const p = [
        at(i / nx, j / ny),
        at((i + 1) / nx, j / ny),
        at((i + 1) / nx, (j + 1) / ny),
        at(i / nx, (j + 1) / ny),
      ]
      batch.quad(p, {
        color: [color[0] * tone, color[1] * tone, color[2] * tone, 1],
        normal: [1, 0, 0],
      })
    }
  }
}

function barge(scene, materials) {
  const hullBatch = new Batch({ worldUv: 4 })
  const sailBatch = new Batch({ worldUv: 4 })
  hull(hullBatch, { length: 17, beam: 4.6, side: tar, stripe: [0.62, 0.16, 0.12, 1] })
  // cabin, hatch coamings, windlass, mast, boom, sprit, bowsprit, leeboards
  hullBatch.box({ c: [0, 1.15, -6], s: [2.6, 1.1, 3.2], color: [0.82, 0.74, 0.62, 1] })
  hullBatch.box({ c: [0, 1.0, 0.5], s: [2.4, 0.9, 5.8], color: [0.5, 0.36, 0.3, 1] })
  hullBatch.cylinder({
    c: [0, 7.2, 0.4],
    r: 0.16,
    rTop: 0.09,
    h: 13.4,
    seg: 7,
    color: [0.6, 0.48, 0.4, 1],
  })
  hullBatch.bar([0, 2.2, 0.2], [0, 2.3, -7.4], 0.18, { color: [0.62, 0.5, 0.42, 1] })
  hullBatch.bar([0.05, 2.0, 0.4], [0.05, 13.3, -4.2], 0.14, { color: [0.62, 0.5, 0.42, 1] })
  hullBatch.bar([0, 0.9, 8], [0, 2.6, 12.4], 0.16, { color: [0.62, 0.5, 0.42, 1] })
  hullBatch.cylinder({
    c: [0, 5.2, -7.6],
    r: 0.1,
    rTop: 0.07,
    h: 8.4,
    seg: 6,
    color: [0.6, 0.48, 0.4, 1],
  })
  for (const s of [-1, 1])
    hullBatch.box({
      c: [s * 2.55, 0.6, 1.5],
      s: [0.1, 2.0, 3.4],
      color: [0.7, 0.34, 0.24, 1],
      yaw: s * 0.06,
    })
  // sails in two-sided cloth
  sail(sailBatch, {
    tack: [0, 2.4, 0.5],
    clew: [0, 2.4, -7.3],
    peak: [0, 13.2, -4.0],
    throat: [0, 11.8, 0.5],
    color: [0.56, 0.21, 0.13],
  })
  sail(sailBatch, {
    tack: [0, 11.8, 0.55],
    clew: [0, 13.2, -3.8],
    peak: [0, 16.2, -2.0],
    throat: [0, 15.4, 0.55],
    nx: 4,
    ny: 3,
    color: [0.62, 0.25, 0.15],
    bulge: 0.25,
  })
  sail(sailBatch, {
    tack: [0, 2.2, -7.5],
    clew: [0, 2.2, -9.2],
    peak: [0, 7.6, -8.2],
    throat: [0, 7.4, -7.6],
    nx: 3,
    ny: 3,
    color: [0.6, 0.23, 0.14],
    bulge: 0.2,
  })
  sail(sailBatch, {
    tack: [0, 2.4, 8.2],
    clew: [0, 3.0, 12.2],
    peak: [0, 9.2, 7.6],
    throat: [0, 9.2, 7.4],
    nx: 4,
    ny: 4,
    color: [0.54, 0.2, 0.12],
    bulge: 0.35,
  })
  const hullMesh = hullBatch.build(scene, 'barge-hull', materials.wash)
  const sailMesh = sailBatch.build(scene, 'barge-sail', materials.cloth)
  return { hullMesh, sailMesh }
}

function dinghy(scene, materials, { length = 3.6, beam = 1.3, color = [0.2, 0.34, 0.5, 1] } = {}) {
  const batch = new Batch({ worldUv: 4 })
  hull(batch, {
    length,
    beam,
    depth: 0.28,
    freeboard: 0.28,
    bow: 0.4,
    side: color,
    deck: [0.84, 0.68, 0.5, 1],
    stripe: [0.92, 0.88, 0.8, 1],
  })
  batch.box({ c: [0, 0.34, 0.1], s: [beam * 0.9, 0.06, 0.34], color: [0.78, 0.62, 0.44, 1] })
  return batch.build(scene, 'dinghy', materials.wash)
}

function steamer(scene, materials) {
  const batch = new Batch({ worldUv: 4 })
  hull(batch, {
    length: 24,
    beam: 5.2,
    depth: 0.9,
    freeboard: 0.9,
    bow: 0.3,
    side: [0.16, 0.16, 0.2, 1],
    stripe: [0.82, 0.74, 0.5, 1],
  })
  batch.box({ c: [0, 2.0, -1.5], s: [3.8, 2.2, 10], color: [0.96, 0.92, 0.84, 1] })
  batch.box({ c: [0, 3.4, -1.5], s: [4.4, 0.25, 10.6], color: [0.62, 0.2, 0.18, 1] })
  batch.box({ c: [0, 4.35, -2.2], s: [2.8, 1.7, 4.4], color: [0.98, 0.95, 0.88, 1] })
  batch.box({ c: [0, 5.3, -2.2], s: [3.2, 0.2, 4.8], color: [0.3, 0.3, 0.36, 1] })
  batch.box({ c: [0, 5.2, 1.2], s: [0.12, 0.12, 0.12], color: dark })
  batch.cylinder({
    c: [0, 6.9, -3.8],
    r: 0.78,
    rTop: 0.62,
    h: 4.4,
    seg: 10,
    color: [0.14, 0.13, 0.16, 1],
  })
  batch.cylinder({
    c: [0, 8.8, -3.8],
    r: 0.66,
    rTop: 0.66,
    h: 0.5,
    seg: 10,
    color: [0.14, 0.13, 0.16, 1],
  })
  batch.cylinder({
    c: [0, 7.1, -3.8],
    r: 0.8,
    rTop: 0.8,
    h: 0.5,
    seg: 10,
    color: [0.78, 0.2, 0.16, 1],
  })
  batch.cylinder({
    c: [0, 5.3, 4.6],
    r: 0.08,
    rTop: 0.08,
    h: 6.6,
    seg: 6,
    color: [0.62, 0.5, 0.42, 1],
  })
  // paddle boxes either side
  for (const s of [-1, 1])
    batch.box({ c: [s * 3.0, 1.9, -2.4], s: [0.7, 2.6, 4.6], color: [0.62, 0.2, 0.18, 1] })
  const body = batch.build(scene, 'steamer', materials.wash)
  // paddle wheel: eight floats around an axle along x
  const wheelBatch = new Batch({ worldUv: 4 })
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU
    wheelBatch.bar([0, 0, 0], [0, Math.sin(a) * 1.7, Math.cos(a) * 1.7], 0.12, {
      color: [0.5, 0.36, 0.28, 1],
    })
    wheelBatch.box({
      c: [0, Math.sin(a) * 1.7, Math.cos(a) * 1.7],
      s: [0.55, 0.12 + Math.abs(Math.cos(a)) * 0.28, 0.12 + Math.abs(Math.sin(a)) * 0.28],
      color: [0.78, 0.6, 0.42, 1],
    })
  }
  const wheel = wheelBatch.build(scene, 'paddle-wheel', materials.wash)
  return { body, wheel }
}

function wherry(scene, materials) {
  const batch = new Batch({ worldUv: 4 })
  hull(batch, {
    length: 5.6,
    beam: 1.5,
    depth: 0.3,
    freeboard: 0.32,
    bow: 0.45,
    side: [0.78, 0.7, 0.55, 1],
    deck: [0.86, 0.7, 0.5, 1],
    stripe: [0.2, 0.36, 0.5, 1],
  })
  batch.box({ c: [0, 0.4, -0.2], s: [1.1, 0.06, 0.3], color: [0.7, 0.55, 0.4, 1] })
  // a capybara rower: round body, head and a flat cap
  batch.cylinder({
    c: [0, 0.78, -0.2],
    r: 0.3,
    rTop: 0.26,
    h: 0.7,
    seg: 8,
    color: [0.72, 0.5, 0.3, 1],
  })
  batch.cylinder({
    c: [0, 1.28, -0.1],
    r: 0.22,
    rTop: 0.2,
    h: 0.32,
    seg: 8,
    color: [0.7, 0.48, 0.3, 1],
  })
  batch.cylinder({
    c: [0, 1.5, -0.1],
    r: 0.26,
    rTop: 0.22,
    h: 0.1,
    seg: 8,
    color: [0.3, 0.3, 0.38, 1],
  })
  const body = batch.build(scene, 'wherry', materials.wash)
  const oarBatch = new Batch({ worldUv: 4 })
  oarBatch.bar([0, 0, 0], [0, -0.35, 1.3], 0.05, { color: [0.8, 0.66, 0.46, 1] })
  oarBatch.box({ c: [0, -0.4, 1.5], s: [0.06, 0.1, 0.42], color: [0.8, 0.66, 0.46, 1] })
  oarBatch.bar([0, 0, 0], [0, 0.18, -0.5], 0.05, { color: [0.8, 0.66, 0.46, 1] })
  const oar = oarBatch.build(scene, 'oar', materials.wash)
  return { body, oar }
}

// closed loops on the river: an ellipse with per-boat speed, heading follows the tangent
const loop =
  (cx, cz, rx, rz, period, phase, dir = 1) =>
  (t) => {
    const a = phase + (dir * t * TAU) / period
    const x = cx + Math.cos(a) * rx
    const z = cz + Math.sin(a) * rz
    const dx = -Math.sin(a) * rx * dir
    const dz = Math.cos(a) * rz * dir
    return { x, z, yaw: Math.atan2(dx, dz) }
  }

export function buildBoats({ scene, world, tier, reduced }) {
  const materials = world.materials
  const rand = rng(1066)
  const disposers = []
  const boats = []
  const nodes = []
  const reflected = []

  // sailing barges share one hull and one sail mesh through instances
  const b = barge(scene, materials)
  b.hullMesh.isVisible = false
  b.sailMesh.isVisible = false
  const bargeCount = tier.barges
  const bargeLoops = [
    loop(-36, 108, 74, 30, 150, 0.4, 1),
    loop(30, 142, 95, 22, 190, 2.4, -1),
    loop(-52, 80, 30, 14, 110, 4.1, 1),
  ]
  for (let i = 0; i < bargeCount; i += 1) {
    const node = new TransformNode(`barge-${i}`, scene)
    const hullI = b.hullMesh.createInstance(`barge-hull-${i}`)
    const sailI = b.sailMesh.createInstance(`barge-sail-${i}`)
    hullI.parent = node
    sailI.parent = node
    for (const inst of [hullI, sailI]) {
      inst.isPickable = false
      inst.alwaysSelectAsActiveMesh = true
    }
    reflected.push(hullI, sailI)
    nodes.push(node)
    boats.push({
      node,
      path: bargeLoops[i],
      clock: rand() * 30,
      bob: 0.1,
      roll: 0.025,
      sail: sailI,
      base: 0.2,
      foam: [8.4, 23],
    })
  }

  // paddle steamer with turning wheels and funnel smoke
  const s = steamer(scene, materials)
  const steamerNode = new TransformNode('steamer', scene)
  s.body.parent = steamerNode
  const wheels = [-1, 1].map((side) => {
    const w = side < 0 ? s.wheel : s.wheel.clone('paddle-wheel-r')
    w.parent = steamerNode
    w.position.set(side * 3.2, 1.3, -2.4)
    return w
  })
  nodes.push(steamerNode)
  boats.push({
    node: steamerNode,
    path: loop(26, 166, 105, 14, 160, 3.3, -1),
    clock: 0,
    bob: 0.07,
    roll: 0.012,
    base: 0.3,
    foam: [10, 32],
    wheels,
  })
  const puff = puffTexture(scene, 909)
  const funnel = new TransformNode('funnel', scene)
  funnel.parent = steamerNode
  funnel.position.set(0, 9.2, -3.8)
  const smoke = makeSmoke(scene, {
    name: 'funnel-smoke',
    texture: puff,
    emitter: funnel,
    rate: tier.funnelSmoke,
    capacity: 120,
    color1: new Color4(0.2, 0.17, 0.22, 0.5),
    color2: new Color4(0.45, 0.35, 0.34, 0.4),
    life: [3, 5.5],
    size: [0.9, 1.6],
    grow: 4.5,
    power: [0.8, 1.4],
    wind: [-0.5, 0.35, 0.2],
  })
  disposers.push(() => {
    smoke.dispose()
    puff.dispose()
  })

  // rowing wherry
  const w = wherry(scene, materials)
  const wherryNode = new TransformNode('wherry', scene)
  w.body.parent = wherryNode
  const oars = [-1, 1].map((side) => {
    const oar = side < 0 ? w.oar : w.oar.clone('oar-r')
    oar.parent = wherryNode
    oar.position.set(side * 0.78, 0.5, -0.2)
    oar.rotation.y = side * 0.4
    return oar
  })
  nodes.push(wherryNode)
  boats.push({
    node: wherryNode,
    path: loop(24, 64, 14, 6.5, 70, 1.4, 1),
    clock: 0,
    bob: 0.05,
    roll: 0.04,
    base: 0.12,
    foam: [3, 8],
    oars,
  })

  // moored boats against the quay, bobbing on their lines
  const dingy = dinghy(scene, materials)
  dingy.isVisible = false
  const moors = [
    [-6.5, quayZ + 1.7, 0.08],
    [9, quayZ + 1.6, -0.05],
    [26, quayZ + 1.8, 0.1],
    [-19, quayZ + 1.7, -0.07],
    [5.4, 62, Math.PI / 2 + 0.05],
    [-5.2, 70, -Math.PI / 2 + 0.04],
  ]
  const mooredCount = Math.min(tier.moored, moors.length)
  const moored = []
  for (let i = 0; i < mooredCount; i += 1) {
    const inst = dingy.createInstance(`moored-${i}`)
    inst.isPickable = false
    inst.alwaysSelectAsActiveMesh = true
    inst.position.set(moors[i][0], waterY + 0.12, moors[i][1])
    inst.rotation.y = moors[i][2] + (i % 2 ? 0 : Math.PI)
    reflected.push(inst)
    moored.push({ inst, phase: rand() * TAU })
  }

  // foam decals under every moving hull and the moored boats
  const foamTexture = glowTexture(
    scene,
    'foam',
    [
      [0, 'rgba(255,248,230,0)'],
      [0.55, 'rgba(255,248,230,0.0)'],
      [0.72, 'rgba(255,248,230,0.85)'],
      [0.84, 'rgba(255,248,230,0.4)'],
      [1, 'rgba(255,248,230,0)'],
    ],
    256,
  )
  const foamMaterial = glowMaterial(scene, 'foam', {
    texture: foamTexture,
    alphaMode: Constants.ALPHA_COMBINE,
    fog: false,
  })
  foamMaterial.disableDepthWrite = true
  foamMaterial.zOffset = -2
  const foamMesh = CreatePlane('hull-foam', { size: 1 }, scene)
  foamMesh.rotation.x = Math.PI / 2
  foamMesh.bakeCurrentTransformIntoVertices()
  foamMesh.material = foamMaterial
  foamMesh.isPickable = false
  foamMesh.alwaysSelectAsActiveMesh = true
  foamMesh.alphaIndex = 6
  const foamCount = boats.length + moored.length
  const foamMatrices = new Float32Array(foamCount * 16)
  const foamColors = new Float32Array(foamCount * 4).fill(1)
  foamMesh.thinInstanceSetBuffer('matrix', foamMatrices, 16, false)
  foamMesh.thinInstanceSetBuffer('color', foamColors, 4, false)

  const setFoam = (i, x, z, yaw, w, l) => {
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    // scale (w, 1, l) rotated by yaw about y
    foamMatrices.set(
      [c * w, 0, -sn * w, 0, 0, 1, 0, 0, sn * l, 0, c * l, 0, x, waterY + 0.04, z, 1],
      i * 16,
    )
  }

  let time = 0
  const update = (dt) => {
    if (!reduced()) time += dt
    smoke.updateSpeed = reduced() ? 0 : 0.016
    const t = time
    let f = 0
    for (const boat of boats) {
      const p = boat.path(t + boat.clock)
      boat.node.position.set(
        p.x,
        waterY + boat.base + Math.sin(t * 1.3 + boat.clock) * boat.bob,
        p.z,
      )
      boat.node.rotation.set(
        Math.sin(t * 0.9 + boat.clock * 2) * boat.roll * 0.5,
        p.yaw,
        Math.sin(t * 1.1 + boat.clock) * boat.roll,
      )
      if (boat.wheels) for (const wh of boat.wheels) wh.rotation.x = -t * 2.4
      if (boat.oars)
        boat.oars.forEach((oar, i) => {
          oar.rotation.x = Math.sin(t * 2.2) * 0.45
          oar.rotation.y = (i ? 1 : -1) * (0.5 + Math.sin(t * 2.2 + 1) * 0.25)
        })
      if (boat.sail) boat.sail.rotation.y = Math.sin(t * 0.5 + boat.clock) * 0.04
      setFoam(f, p.x, p.z, p.yaw, boat.foam[0], boat.foam[1])
      f += 1
    }
    for (const m of moored) {
      m.inst.position.y = waterY + 0.12 + Math.sin(time * 1.4 + m.phase) * 0.05
      m.inst.rotation.z = Math.sin(time * 1.2 + m.phase) * 0.03
      m.inst.rotation.x = Math.sin(time * 0.9 + m.phase * 2) * 0.025
      setFoam(f, m.inst.position.x, m.inst.position.z, m.inst.rotation.y, 2.8, 6.2)
      f += 1
    }
    foamMesh.thinInstanceBufferUpdated('matrix')
  }
  update(0)

  const sources = [b.hullMesh, b.sailMesh, s.body, dingy, w.body]
  return {
    update,
    // meshes worth reflecting in the river
    reflect: [...reflected, s.body, ...wheels, w.body, ...oars],
    meshes: [b.hullMesh, b.sailMesh, s.body, ...wheels, w.body, ...oars, dingy, foamMesh],
    dispose() {
      for (const fn of disposers) fn()
      for (const m of [...sources, ...wheels, ...oars, foamMesh]) m.dispose()
      for (const n of [...nodes, funnel]) n.dispose()
      foamMaterial.dispose()
      foamTexture.dispose()
    },
  }
}
