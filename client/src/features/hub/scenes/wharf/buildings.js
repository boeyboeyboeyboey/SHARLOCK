import { frame } from '../shared/geometry.js'
import { rng } from '../shared/random.js'
import { outward, slab, tint } from './shapes.js'

const STONE = [0.95, 0.9, 0.82, 1]
const WHITE = [1.05, 1.02, 0.98, 1]
const IRON = [0.2, 0.2, 0.26, 1]
// fraction of upper windows that glow
const LIT = 0.55

// victorian brick terraces and warehouses. facade-local frame: u right, v up, w outward from the wall
export function createBuilder({ world, signs, seed = 1881 }) {
  const rand = rng(seed)
  const chimneys = []
  const b = world.batches
  const uvOf = (id) => signs.uv(id)

  // camera blocker around a box given in frame coordinates, grown by pad so a wall hugging player stays outside it
  const block = (f, [u0, u1], [w0, w1], [y0, y1], pad = 0.3) => {
    const xs = []
    const zs = []
    for (const u of [u0 - pad, u1 + pad]) {
      for (const w of [w0 - pad, w1 + pad]) {
        const p = f.point(u, 0, w)
        xs.push(p[0])
        zs.push(p[2])
      }
    }
    world.blockers.push({
      min: [Math.min(...xs), y0, Math.min(...zs)],
      max: [Math.max(...xs), y1 + pad, Math.max(...zs)],
      pad,
    })
  }

  // world bounds of a box given in frame coordinates (only right angle yaws are used)
  const boxArgs = (f, u, v, w, su, sv, sw) => {
    const a = f.point(u - su / 2, v - sv / 2, w - sw / 2)
    const c = f.point(u + su / 2, v + sv / 2, w + sw / 2)
    return [
      Math.min(a[0], c[0]),
      Math.max(a[0], c[0]),
      Math.min(a[1], c[1]),
      Math.max(a[1], c[1]),
      Math.min(a[2], c[2]),
      Math.max(a[2], c[2]),
    ]
  }
  const fbox = (batch, f, u, v, w, su, sv, sw, color) =>
    slab(batch, ...boxArgs(f, u, v, w, su, sv, sw), color)
  // frame of a neighbouring wall: offset in the parent frame, turned by a quarter
  const turned = (f, u, w, turn) => {
    const p = f.point(u, 0, w)
    return frame(p[0], p[2], f.yaw + turn)
  }

  // sash window on the wall plane of frame f: glass quad plus a stone sill and lintel
  const windowAt = (f, u, v, ww, wh, lit, gain = 1) => {
    // most windows stay dark, a few glow warm and the lit ones differ in strength, all below the bloom threshold
    lit = lit && rand() < 0.62
    const dim = 0.6 + 0.7 * rand()
    const color = lit
      ? [
          (0.74 + rand() * 0.3) * gain * dim,
          (0.54 + rand() * 0.2) * gain * dim,
          (0.34 + rand() * 0.14) * gain * dim,
          1,
        ]
      : [0.82 + rand() * 0.16, 0.82 + rand() * 0.14, 0.9 + rand() * 0.1, 1]
    ;(lit ? b.windowLit : b.windowDark).quad(
      [
        f.point(u - ww / 2, v, 0.05),
        f.point(u + ww / 2, v, 0.05),
        f.point(u + ww / 2, v + wh, 0.05),
        f.point(u - ww / 2, v + wh, 0.05),
      ],
      { color, uv: [0, 0, 1, 1], normal: f.dir(0, 0, 1) },
    )
    fbox(b.stone, f, u, v - 0.02, 0.12, ww + 0.34, 0.14, 0.3, STONE)
    fbox(b.stone, f, u, v + wh + 0.1, 0.1, ww + 0.34, 0.2, 0.22, STONE)
  }

  const board = (f, id, u, v, w, bw, bh, color = [1, 1, 1, 1]) => {
    b.signs.quad(
      [
        f.point(u - bw / 2, v - bh / 2, w),
        f.point(u + bw / 2, v - bh / 2, w),
        f.point(u + bw / 2, v + bh / 2, w),
        f.point(u - bw / 2, v + bh / 2, w),
      ],
      { color, uv: uvOf(id), normal: f.dir(0, 0, 1) },
    )
    fbox(b.wash, f, u, v, w - 0.07, bw + 0.2, bh + 0.2, 0.1, [0.18, 0.15, 0.16, 1])
  }

  // iron arm out from the wall with a painted board hanging beneath, plane across the street so the camera reads it face on
  const hanging = (f, id, u, v, size = [2.4, 1.8], scale = 1) => {
    size = [size[0] * scale, size[1] * scale]
    const arm = 0.45 + 2.35 * scale
    fbox(b.wash, f, u, v + size[1] / 2 + 0.1, arm / 2, 0.1, 0.1, arm, IRON)
    const p0 = f.point(u, v, 0.35)
    const p1 = f.point(u, v, arm - 0.1)
    const z = p0[2]
    const x0 = Math.min(p0[0], p1[0])
    const x1 = Math.max(p0[0], p1[0])
    const y0 = v - size[1] / 2
    const y1 = v + size[1] / 2
    const front = [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ]
    const uv = uvOf(id)
    b.signs.quad(front, { uv, color: [1.02, 1, 0.96, 1], normal: [0, 0, -1] })
    b.signs.quad([front[1], front[0], front[3], front[2]], {
      uv,
      color: [0.92, 0.9, 0.88, 1],
      normal: [0, 0, 1],
    })
    slab(b.wash, x0 - 0.04, x1 + 0.04, y1, y1 + 0.08, z - 0.06, z + 0.06, IRON)
    slab(b.wash, x0 - 0.04, x1 + 0.04, y0 - 0.08, y0, z - 0.06, z + 0.06, IRON)
  }

  const awning = (f, u, width, v, colorA, colorB, out = 1.7) => {
    const strips = Math.max(2, Math.round(width / 0.55))
    for (let i = 0; i < strips; i += 1) {
      const a = u - width / 2 + (width * i) / strips
      const c = u - width / 2 + (width * (i + 1)) / strips
      outward(
        b.cloth,
        [
          f.point(a, v - 0.55, out),
          f.point(c, v - 0.55, out),
          f.point(c, v, 0.05),
          f.point(a, v, 0.05),
        ],
        f.dir(0, 0.6, 1),
        { color: i % 2 ? colorA : colorB },
      )
    }
    fbox(b.wash, f, u, v - 0.58, out, width, 0.1, 0.1, [0.9, 0.85, 0.8, 1])
  }

  const chimney = (f, u, w, v0, top, brick) => {
    fbox(b[brick], f, u, (v0 + top) / 2, w, 0.95, top - v0, 0.95, [0.95, 0.9, 0.88, 1])
    fbox(b.stone, f, u, top + 0.08, w, 1.2, 0.18, 1.2, STONE)
    fbox(b.wash, f, u - 0.25, top + 0.4, w, 0.3, 0.55, 0.3, [0.85, 0.5, 0.35, 1])
    fbox(b.wash, f, u + 0.25, top + 0.4, w, 0.3, 0.55, 0.3, [0.85, 0.5, 0.35, 1])
    chimneys.push(f.point(u, top + 0.75, w))
  }

  // the generic victorian house or warehouse shell
  function house(spec) {
    const {
      x,
      z,
      yaw,
      W,
      D,
      floors = 3,
      wall = 'brickRed',
      color = [1, 1, 1, 1],
      gf = 4.1,
      fh = 3.3,
      roof = 'along',
      rise = 0.3,
      nChimney = 1,
      litBias = 0,
      shopFronts = true,
      doorU = null,
      doorColor = [0.16, 0.2, 0.33, 1],
      sides = true,
      back = false,
      roofColor = [1, 1, 1, 1],
      awn = null,
      fascia = null,
      hang = null,
      signScale = 1,
      quoins = true,
      doorFan = true,
    } = spec
    const f = frame(x, z, yaw)
    const H = gf + fh * floors
    const wallBatch = b[wall]
    const n = f.dir(0, 0, 1)
    outward(
      wallBatch,
      [f.point(-W / 2, 0, 0), f.point(W / 2, 0, 0), f.point(W / 2, H, 0), f.point(-W / 2, H, 0)],
      n,
      { color },
    )
    outward(
      wallBatch,
      [
        f.point(-W / 2, 0, 0),
        f.point(-W / 2, 0, -D),
        f.point(-W / 2, H, -D),
        f.point(-W / 2, H, 0),
      ],
      f.dir(-1, 0, 0),
      { color: tint(color, 0.95) },
    )
    outward(
      wallBatch,
      [f.point(W / 2, 0, 0), f.point(W / 2, 0, -D), f.point(W / 2, H, -D), f.point(W / 2, H, 0)],
      f.dir(1, 0, 0),
      { color: tint(color, 0.95) },
    )
    outward(
      wallBatch,
      [
        f.point(-W / 2, 0, -D),
        f.point(W / 2, 0, -D),
        f.point(W / 2, H, -D),
        f.point(-W / 2, H, -D),
      ],
      f.dir(0, 0, -1),
      { color: tint(color, 0.9) },
    )

    // plinth, string courses, cornice, stone quoins
    fbox(b.stone, f, 0, 0.3, 0.06, W + 0.1, 0.6, 0.12, [0.8, 0.76, 0.72, 1])
    fbox(b.stone, f, 0, gf - 0.05, 0.07, W + 0.1, 0.22, 0.14, STONE)
    for (let k = 1; k < floors; k += 1)
      fbox(b.stone, f, 0, gf + fh * k - 0.55, 0.05, W + 0.04, 0.12, 0.1, [0.92, 0.88, 0.8, 1])
    fbox(b.stone, f, 0, H - 0.2, 0.2, W + 0.5, 0.4, 0.5, WHITE)
    fbox(b.stone, f, 0, H + 0.05, 0.22, W + 0.5, 0.12, 0.62, STONE)
    if (quoins) {
      for (const s of [-1, 1])
        for (let q = 0; q < Math.floor(H / 1.3); q += 1)
          fbox(
            b.stone,
            f,
            s * (W / 2 - 0.2),
            0.7 + q * 1.3,
            0.04,
            q % 2 ? 0.55 : 0.4,
            0.58,
            0.1,
            [0.94, 0.9, 0.82, 1],
          )
    }

    // slate roof, eaves, gables, chimneys
    const rh = roof === 'along' ? D * rise : W * rise * 0.55
    const eave = 0.55
    if (roof === 'along') {
      outward(
        b.slate,
        [
          f.point(-W / 2 - 0.2, H, eave),
          f.point(W / 2 + 0.2, H, eave),
          f.point(W / 2 + 0.2, H + rh, -D / 2),
          f.point(-W / 2 - 0.2, H + rh, -D / 2),
        ],
        f.dir(0, 1.2, 0.6),
        { color: roofColor },
      )
      outward(
        b.slate,
        [
          f.point(-W / 2 - 0.2, H, -D - eave),
          f.point(W / 2 + 0.2, H, -D - eave),
          f.point(W / 2 + 0.2, H + rh, -D / 2),
          f.point(-W / 2 - 0.2, H + rh, -D / 2),
        ],
        f.dir(0, 1.2, -0.6),
        { color: tint(roofColor, 0.92) },
      )
      for (const s of [-1, 1])
        outward(
          wallBatch,
          [
            f.point((s * W) / 2, H, 0),
            f.point((s * W) / 2, H, -D),
            f.point((s * W) / 2, H + rh, -D / 2),
            f.point((s * W) / 2, H + rh, -D / 2),
          ],
          f.dir(s, 0, 0),
          { color: tint(color, 0.95) },
        )
      fbox(b.wash, f, 0, H + rh + 0.04, -D / 2, W + 0.4, 0.14, 0.34, [0.8, 0.45, 0.4, 1])
      for (let c = 0; c < nChimney; c += 1) {
        const u = -W / 2 + ((c + 0.5) / nChimney) * W + (rand() - 0.5) * 0.8
        chimney(
          f,
          u,
          -D / 2 + (rand() - 0.5) * 1.2,
          H + rh * 0.25,
          H + rh + 1.8 + rand() * 0.6,
          wall === 'brickYellow' ? 'brickYellow' : 'brickRed',
        )
      }
    } else {
      // ridge runs front to back, a triangular gable faces the street
      outward(
        b.slate,
        [
          f.point(-W / 2 - 0.4, H, eave),
          f.point(0, H + rh, eave),
          f.point(0, H + rh, -D - eave),
          f.point(-W / 2 - 0.4, H, -D - eave),
        ],
        f.dir(-0.6, 1.2, 0),
        { color: roofColor },
      )
      outward(
        b.slate,
        [
          f.point(W / 2 + 0.4, H, eave),
          f.point(0, H + rh, eave),
          f.point(0, H + rh, -D - eave),
          f.point(W / 2 + 0.4, H, -D - eave),
        ],
        f.dir(0.6, 1.2, 0),
        { color: tint(roofColor, 0.94) },
      )
      outward(
        wallBatch,
        [f.point(-W / 2, H, 0), f.point(W / 2, H, 0), f.point(0, H + rh, 0), f.point(0, H + rh, 0)],
        n,
        { color },
      )
      outward(
        wallBatch,
        [
          f.point(-W / 2, H, -D),
          f.point(W / 2, H, -D),
          f.point(0, H + rh, -D),
          f.point(0, H + rh, -D),
        ],
        f.dir(0, 0, -1),
        { color },
      )
      for (let c = 0; c < nChimney; c += 1)
        chimney(
          f,
          (c ? 1 : -1) * W * 0.18,
          -D * (0.3 + 0.4 * c),
          H + 1,
          H + rh * 0.6 + 2,
          'brickRed',
        )
    }

    // front windows, door and shop windows
    const bays = Math.max(1, Math.round(W / 3.1))
    const bay = W / bays
    const door = doorU ?? -W / 2 + bay * (Math.floor((bays - 1) / 2) + 0.5)
    for (let i = 0; i < bays; i += 1) {
      const u = -W / 2 + bay * (i + 0.5)
      for (let k = 0; k < floors; k += 1)
        windowAt(f, u, gf + fh * k + 0.55, Math.min(1.25, bay * 0.42), 1.95, rand() < LIT + litBias)
      if (Math.abs(u - door) < bay * 0.4) {
        fbox(b.wash, f, u, 1.3, 0.04, 1.35, 2.6, 0.08, doorColor)
        fbox(b.stone, f, u, 2.78, 0.1, 1.9, 0.26, 0.24, STONE)
        fbox(b.stone, f, u, 0.08, 0.4, 2.0, 0.16, 0.8, [0.88, 0.84, 0.8, 1])
        if (doorFan) {
          const lit = rand() < 0.7
          ;(lit ? b.windowLit : b.windowDark).quad(
            [
              f.point(u - 0.55, 2.95, 0.06),
              f.point(u + 0.55, 2.95, 0.06),
              f.point(u + 0.55, 3.55, 0.06),
              f.point(u - 0.55, 3.55, 0.06),
            ],
            { color: lit ? [2, 1.6, 1, 1] : [0.85, 0.85, 0.92, 1], uv: [0, 0.55, 1, 1], normal: n },
          )
        }
      } else if (shopFronts) {
        const ww = Math.min(1.9, bay * 0.62)
        windowAt(f, u, 0.9, ww, 2.2, rand() < 0.45 + litBias)
        fbox(b.wash, f, u, 0.45, 0.14, ww + 0.3, 0.9, 0.14, [0.3, 0.2, 0.16, 1])
      }
    }
    if (fascia) {
      const bw = Math.min(W - 1.2, 8.5) * signScale
      board(f, fascia, 0, gf - 0.42, 0.2, bw, bw * (176 / 1024), [1.05, 1.0, 0.95, 1])
    }
    if (awn)
      awning(
        f,
        0,
        Math.min(W - 1, 9) * signScale,
        gf - 1.2,
        awn[0],
        awn[1],
        1.7 * (0.5 + 0.5 * signScale),
      )
    if (hang) hanging(f, hang.id, hang.u ?? 0, hang.v ?? gf - 1.2, hang.size, signScale)

    // side and back windows
    const wallWindows = (g, length, dir) => {
      const nb = Math.max(1, Math.round(length / 3.4))
      for (let i = 0; i < nb; i += 1) {
        const u = (dir * (i + 0.5) * length) / nb
        windowAt(g, u, 0.9, 1.2, 2.0, rand() < 0.4)
        for (let k = 0; k < floors; k += 1)
          windowAt(g, u, gf + fh * k + 0.55, 1.2, 1.9, rand() < LIT)
      }
    }
    if (sides) {
      wallWindows(turned(f, -W / 2, 0, Math.PI / 2), D, -1)
      wallWindows(turned(f, W / 2, 0, -Math.PI / 2), D, 1)
    }
    if (back) {
      const g = turned(f, 0, -D, Math.PI)
      const nb = Math.max(1, Math.round(W / 3.1))
      for (let i = 0; i < nb; i += 1) {
        for (let k = 0; k < floors; k += 1)
          windowAt(g, -W / 2 + (W / nb) * (i + 0.5), gf + fh * k + 0.55, 1.2, 1.9, rand() < LIT)
      }
    }
    block(f, [-W / 2, W / 2], [-D, 0], [0, H + rh])
    return { f, W, D, H, gf, fh, floors }
  }

  return {
    house,
    windowAt,
    fbox,
    board,
    hanging,
    awning,
    chimney,
    chimneys,
    rand,
    b,
    boxArgs,
    turned,
    block,
  }
}
