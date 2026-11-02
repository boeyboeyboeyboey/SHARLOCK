import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Batch } from '../shared/geometry.js'
import { outward } from './shapes.js'
import { rng } from '../shared/random.js'
import { glowMaterial } from './toon.js'
import { waterY } from './layout.js'

const rad = (deg) => (deg * Math.PI) / 180

// the opposite bank as one continuous river wall in front of the mid plates (r 300), so the painted quay walls, which differ in
// height from piece to piece, and the cross fades between pieces never reach the water line. the wall stands at r 296, its top
// is a paved deck that runs back to the plate cylinder, so the plated buildings stand on it
export const farBank = {
  r: 296,
  // the deck ends at the plate cylinder; the plates are fog free and so is the wall
  deckTo: 300.4,
  // wall top, coping included. the painted quay of the first piece is the tallest, so the wall is high up to the start of
  // the second piece and eases down to the height of the others over the next degrees
  top: 6.5,
  topWest: 7.2,
  easeFrom: -40,
  easeTo: -30,
  coping: 0.32,
  bottom: -1.9,
  // full height inside the plated arc, then it ramps down to the ground over the next degrees
  full: 86,
  reach: 96,
  // degrees per wall segment
  step: 0.6,
}
// the pieces of the mid ring overlap at these bearings, where two paintings blend; a warehouse stands over each
export const seams = [
  { az: -42, width: 36, wall: 8.4, rise: 3.4 },
  { az: 42, width: 33, wall: 9.6, rise: 3 },
]

// what the stone tile averages to; vertex colours are the wanted look divided by it, so the render lands on the wanted colour
const tileAvg = [1, 1, 0.95]
// the painted quay wall of the mid plates as it renders, by height above the ground line (sampled from the start shots, where
// the tone curve lifts the lit stone well above the raw plate pixels): wet dark foot, grey-brown courses, ochre toward the coping
const ramp = [
  [0, [0.22, 0.24, 0.2]],
  [0.8, [0.26, 0.27, 0.22]],
  [1.7, [0.26, 0.24, 0.18]],
  [3.1, [0.4, 0.31, 0.24]],
  [4.5, [0.66, 0.48, 0.33]],
  [6, [0.86, 0.58, 0.37]],
  [7.5, [0.95, 0.64, 0.4]],
]
// the painted coping, a golden lit ledge
const copingColor = [0.95, 0.7, 0.4]
const lift = (c, k = 1) => [
  (c[0] / tileAvg[0]) * k,
  (c[1] / tileAvg[1]) * k,
  (c[2] / tileAvg[2]) * k,
  0,
]
function wallColor(y, k = 1) {
  const h = y - waterY
  for (let i = 1; i < ramp.length; i += 1) {
    if (h <= ramp[i][0]) {
      const [h0, c0] = ramp[i - 1]
      const [h1, c1] = ramp[i]
      const t = Math.max(0, (h - h0) / (h1 - h0))
      // the foot stays wet and dark whatever the panel shade
      const shade = h < 1.7 ? 1 - (1 - k) * (h / 1.7) : k
      return lift(
        [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t],
        shade,
      )
    }
  }
  return lift(ramp[ramp.length - 1][1], k)
}
const rows = (top) =>
  [farBank.bottom, waterY, -0.4, 0.4, 1.8, 3.2, 4.8, top].filter(
    (y, i, all) => i === all.length - 1 || y < top - 0.05,
  )

// ashlar tile with visible courses: dark mortar joints, stone blocks that vary a little, rows 0 and 3 unshifted so the tile joins
function courseTexture(scene) {
  const size = 256
  const texture = new DynamicTexture(
    'far-bank-courses',
    size,
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  const ctx = texture.getContext()
  const rand = rng(77)
  ctx.fillStyle = 'rgb(78,68,62)'
  ctx.fillRect(0, 0, size, size)
  const shift = [0, 0.5, 0.5, 0]
  for (let row = 0; row < 4; row += 1) {
    for (let c = -1; c < 2; c += 1) {
      const x = (c + shift[row]) * 128
      const k = 0.86 + rand() * 0.16
      ctx.fillStyle = `rgb(${Math.round(246 * k)},${Math.round(232 * k)},${Math.round(208 * k)})`
      ctx.fillRect(x + 3, row * 64 + 3, 122, 58)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(x + 3, row * 64 + 50, 122, 11)
    }
  }
  texture.update(true)
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 8
  return texture
}

// height of the bank at an azimuth in degrees
export function bankTop(az) {
  const { top, topWest, easeFrom, easeTo, full, reach } = farBank
  const t = Math.min(1, Math.max(0, (az - easeFrom) / (easeTo - easeFrom)))
  const here = topWest + (top - topWest) * t
  const over = Math.abs(az) - full
  if (over <= 0) return here
  return Math.max(0.5, here - ((here - 0.5) * over) / (reach - full))
}

const at = (az, r, y) => [Math.sin(rad(az)) * r, y, Math.cos(rad(az)) * r]

// fills the stone batch with the wall, coping, deck, buttresses and mooring posts, and both batches with the warehouses over
// the seams; the lighters are left out on the low tier
export function fillFarBank(b, brick, { lighters = true, seed = 5309 } = {}) {
  const rand = rng(seed)
  const { r, deckTo, coping, step, reach } = farBank
  // one tile is four courses of 0.9 m
  const tile = 3.6
  const mPerDeg = (r * Math.PI) / 180
  // buttresses every twenty metres or so, like the piers painted on the plates; the wall between them is a recessed panel
  const piers = []
  for (let pa = -reach + 3; pa < reach - 3; pa += (18 + rand() * 9) / mPerDeg)
    piers.push({ az: pa, w: 1.5 + rand() * 0.5 })
  const panel = (az) => {
    const d = Math.min(...piers.map((q) => Math.abs(az - q.az) * mPerDeg - q.w / 2))
    const t = Math.min(1, Math.max(0, d / 3))
    return 1 - 0.12 * t * t * (3 - 2 * t)
  }
  const arcLen = (az) => rad(az) * r
  const count = Math.round((2 * reach) / step)
  for (let i = 0; i < count; i += 1) {
    const a0 = -reach + i * step
    const a1 = a0 + step
    const h0 = bankTop(a0)
    const h1 = bankTop(a1)
    const u0 = arcLen(a0) / tile
    const u1 = arcLen(a1) / tile
    const k0 = panel(a0)
    const k1 = panel(a1)
    // wall face, banded so the colour can follow the height
    const r0 = rows(h0)
    const r1 = rows(h1)
    const bands = Math.min(r0.length, r1.length) - 1
    for (let k = 0; k < bands; k += 1) {
      const lo0 = r0[k]
      const lo1 = r1[k]
      const hi0 = k === bands - 1 ? h0 : r0[k + 1]
      const hi1 = k === bands - 1 ? h1 : r1[k + 1]
      b.quad([at(a0, r, lo0), at(a1, r, lo1), at(a1, r, hi1), at(a0, r, hi0)], {
        colors: [wallColor(lo0, k0), wallColor(lo1, k1), wallColor(hi1, k1), wallColor(hi0, k0)],
        uv: [u0, lo0 / tile, u1, hi0 / tile],
      })
    }
    // coping: a front face and a top that overhangs the wall a little
    const rc = r - 0.34
    const cope = lift(copingColor, 1.08)
    b.quad([at(a0, rc, h0 - coping), at(a1, rc, h1 - coping), at(a1, rc, h1), at(a0, rc, h0)], {
      color: lift([0.75, 0.55, 0.4]),
      uv: [u0, 0, u1, 0.05],
    })
    b.quad([at(a0, rc, h0), at(a1, rc, h1), at(a1, r + 1.2, h1), at(a0, r + 1.2, h0)], {
      color: cope,
      uv: [u0, 0, u1, 0.2],
      normal: [0, 1, 0],
    })
    // paved deck behind the coping, running back to the plate cylinder
    b.quad([at(a0, r + 1.2, h0), at(a1, r + 1.2, h1), at(a1, deckTo, h1), at(a0, deckTo, h0)], {
      color: lift([0.72, 0.58, 0.46]),
      uv: [u0, 0, u1, 0.7],
      normal: [0, 1, 0],
    })
  }

  for (const q of piers) {
    const top = bankTop(q.az)
    b.box({
      c: at(q.az, r - 0.15, (top - 2.1) / 2),
      s: [q.w, top + 2.3, 0.8],
      yaw: rad(q.az),
      color: lift([0.7, 0.5, 0.34]),
      top: true,
      uv: [0, 0, 0.5, 2],
    })
  }

  // mooring posts on the deck, a bit apart, and a dark cap on each
  const iron = [0.12, 0.1, 0.1, 0]
  let az = -reach + 5
  while (az < reach - 5) {
    const top = bankTop(az)
    const p = at(az, r + 2.3 + rand() * 0.6, top + 0.55)
    b.cylinder({ c: p, r: 0.36, rTop: 0.27, h: 1.1, seg: 6, color: iron })
    b.cylinder({ c: [p[0], p[1] + 0.6, p[2]], r: 0.46, rTop: 0.46, h: 0.16, seg: 6, color: iron })
    az += (9 + rand() * 9) / mPerDeg
  }

  // a few lighters moored along the wall, low in the water with hatch covers, so the foot of the wall is broken up
  if (lighters) {
    const barges = [-74, -61, -23, -9, 17, 28, 51, 66]
    for (const deg of barges) {
      const length = 13 + rand() * 6
      const width = 4 + rand() * 0.8
      const rr = r - 2.8 - rand() * 1.5
      const yaw = rad(deg)
      const centre = at(deg, rr, 0)
      b.box({
        c: [centre[0], -1, centre[2]],
        s: [length, 1.6, width],
        yaw,
        color: [0.2, 0.15, 0.12, 0],
      })
      b.box({
        c: [centre[0], 0.1, centre[2]],
        s: [length * 0.62, 0.6, width * 0.7],
        yaw,
        color: [0.46, 0.34, 0.24, 0],
      })
      b.box({
        c: [centre[0], 0.6, centre[2]],
        s: [length * 0.5, 0.4, width * 0.55],
        yaw,
        color: [0.34, 0.27, 0.2, 0],
      })
    }
  }

  // a brick warehouse over each seam of the mid plates: both paintings fade behind it, so no half transparent building shows.
  // it stands on the deck against the plate cylinder, its front a metre or two inside it
  const roof = [0.52, 0.5, 0.64, 0]
  const lit = [1.05, 0.8, 0.46, 0]
  const dark = [0.2, 0.16, 0.2, 0]
  const swatch = [0.25, 0.125, 0.25, 0.125]
  for (const { az: c, width: W, wall, rise } of seams) {
    const a = rad(c)
    const base = at(c, 297.5, 0)
    const y0 = bankTop(c) - 0.1
    const D = 2.6
    const yE = y0 + wall
    const yR = yE + rise
    const pt = (u, y, w) => [
      base[0] + Math.cos(a) * u + Math.sin(a) * w,
      y,
      base[2] - Math.sin(a) * u + Math.cos(a) * w,
    ]
    const dir = (u, y, w) => [
      Math.cos(a) * u + Math.sin(a) * w,
      y,
      -Math.sin(a) * u + Math.cos(a) * w,
    ]
    const shade = (k) => [0.98 * k, 0.86 * k, 0.8 * k, 0]
    // front: warmer toward the top, like the lit walls on the plates
    brick.quad([pt(-W / 2, y0, 0), pt(W / 2, y0, 0), pt(W / 2, yE, 0), pt(-W / 2, yE, 0)], {
      colors: [shade(0.72), shade(0.72), shade(1.05), shade(1.05)],
      uv: [0, 0, W / 3, wall / 3],
    })
    for (const sgn of [-1, 1]) {
      outward(
        brick,
        [
          pt((sgn * W) / 2, y0, 0),
          pt((sgn * W) / 2, y0, D),
          pt((sgn * W) / 2, yE, D),
          pt((sgn * W) / 2, yE, 0),
        ],
        dir(sgn, 0, 0),
        { color: shade(0.7), uv: [0, 0, 1, wall / 3] },
      )
      outward(
        brick,
        [
          pt((sgn * W) / 2, yE, 0),
          pt((sgn * W) / 2, yE, D),
          pt((sgn * W) / 2, yR, D / 2),
          pt((sgn * W) / 2, yR, D / 2),
        ],
        dir(sgn, 0, 0),
        { color: shade(0.78), uv: [0, 0, 1, 1] },
      )
    }
    // slate roof with the ridge along the wharf, eaves overhanging the front and the stone cornice under it
    const over = 0.5
    outward(
      b,
      [
        pt(-W / 2 - over, yE, -0.6),
        pt(W / 2 + over, yE, -0.6),
        pt(W / 2 + over, yR, D / 2),
        pt(-W / 2 - over, yR, D / 2),
      ],
      dir(0, 1, -1),
      { color: roof, uv: swatch },
    )
    outward(
      b,
      [
        pt(-W / 2 - over, yE, D + 0.6),
        pt(W / 2 + over, yE, D + 0.6),
        pt(W / 2 + over, yR, D / 2),
        pt(-W / 2 - over, yR, D / 2),
      ],
      dir(0, 1, 1),
      { color: [0.4, 0.38, 0.5, 0], uv: swatch },
    )
    b.box({
      c: pt(0, yE - 0.1, -0.1),
      s: [W + 0.6, 0.35, 0.5],
      yaw: a,
      color: [0.86, 0.64, 0.5, 0],
    })
    // windows in two rows, doors at the foot; every third window is lit
    const bays = Math.round(W / 4.4)
    for (let i = 0; i < bays; i += 1) {
      const u = -W / 2 + (W / bays) * (i + 0.5)
      const door = i % 3 === 1
      if (door) {
        b.quad(
          [
            pt(u - 1.3, y0, -0.08),
            pt(u + 1.3, y0, -0.08),
            pt(u + 1.3, y0 + 3.4, -0.08),
            pt(u - 1.3, y0 + 3.4, -0.08),
          ],
          { color: [0.2, 0.15, 0.13, 0], uv: swatch },
        )
      } else {
        b.quad(
          [
            pt(u - 0.55, y0 + 1.5, -0.08),
            pt(u + 0.55, y0 + 1.5, -0.08),
            pt(u + 0.55, y0 + 3.3, -0.08),
            pt(u - 0.55, y0 + 3.3, -0.08),
          ],
          { color: rand() < 0.35 ? lit : dark, uv: swatch },
        )
      }
      if (wall > 7)
        b.quad(
          [
            pt(u - 0.55, y0 + 5.2, -0.08),
            pt(u + 0.55, y0 + 5.2, -0.08),
            pt(u + 0.55, y0 + 7, -0.08),
            pt(u - 0.55, y0 + 7, -0.08),
          ],
          { color: rand() < 0.35 ? lit : dark, uv: swatch },
        )
    }
    // a stack on the roof, well above the ridge
    brick.box({
      c: pt(-W * 0.2, yR + 1.2, D / 2),
      s: [1.8, 7.5, 1.8],
      yaw: a,
      color: shade(0.95),
      uv: [0, 0, 0.6, 2],
    })
    b.box({
      c: pt(-W * 0.2, yR + 5.1, D / 2),
      s: [2.3, 0.5, 2.3],
      yaw: a,
      color: [0.86, 0.64, 0.5, 0],
    })
  }
  return b
}

export function buildFarBank({ scene, brick, tier }) {
  const courses = courseTexture(scene)
  const batches = { stone: new Batch(), brick: new Batch() }
  fillFarBank(batches.stone, batches.brick, { lighters: tier.name !== 'low' })
  const materials = [
    glowMaterial(scene, 'far-bank-stone', { texture: courses, fog: false }),
    glowMaterial(scene, 'far-bank-brick', { texture: brick, fog: false }),
  ]
  const meshes = [
    batches.stone.build(scene, 'far-bank', materials[0]),
    batches.brick.build(scene, 'far-bank-brick', materials[1]),
  ]
  for (const mesh of meshes) {
    mesh.alwaysSelectAsActiveMesh = true
    mesh.applyFog = false
    mesh.freezeWorldMatrix()
    mesh.doNotSyncBoundingInfo = true
  }
  return {
    meshes,
    triangles: batches.stone.triangles + batches.brick.triangles,
    dispose() {
      meshes.forEach((m) => m.dispose())
      materials.forEach((m) => m.dispose())
      courses.dispose()
    },
  }
}
