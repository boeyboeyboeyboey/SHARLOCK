import { frame } from '../shared/geometry.js'
import { createBuilder } from './buildings.js'
import { outward, tint } from './shapes.js'

const E = Math.PI / 2
const W_ = -Math.PI / 2
const STONE = [0.95, 0.9, 0.82, 1]
const IRON = [0.24, 0.25, 0.32, 1]
const WALLS = [
  ['brickRed', [0.96, 0.9, 0.88, 1]],
  ['brickYellow', [0.96, 0.9, 0.86, 1]],
  ['brickRed', [0.88, 0.8, 0.8, 1]],
  ['brickYellow', [0.9, 0.84, 0.8, 1]],
]
const ROOFS = [
  [1, 1, 1, 1],
  [0.92, 0.9, 0.96, 1],
  [1.04, 0.96, 0.94, 1],
]

// scenery behind the walkable district: back streets and terraces to the south and west, a church at the end of the main
// street, a mill stack and a gasholder. nothing here is walkable, so layout.js is untouched. the kit's house() is used for
// the rows nearest the streets, a bare shell for the rest, and every surface lands in the same per-material batches
export function buildBackdrop({ world, signs, tier }) {
  const full = tier.backdrop === 'full'
  const B = createBuilder({ world, signs, seed: 4107 })
  const { house, fbox, chimney, block, b, rand, chimneys } = B
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const between = (a, c) => a + rand() * (c - a)
  const count = { houses: 0, shells: 0 }

  // flat quad of ground, a shade lighter than the base plane so back streets read as streets
  const lane = (x0, x1, z0, z1, color = [0.8, 0.76, 0.78, 1]) => {
    b.cobble.quad(
      [
        [x0, 0.005, z0],
        [x1, 0.005, z0],
        [x1, 0.005, z1],
        [x0, 0.005, z1],
      ],
      { normal: [0, 1, 0], color },
    )
  }

  // window as a single quad, no sill, for walls the player never gets close to
  const pane = (f, u, v, w, h, lit) => {
    const dim = 0.6 + 0.7 * rand()
    const color = lit
      ? [(0.74 + rand() * 0.3) * dim, (0.54 + rand() * 0.2) * dim, (0.34 + rand() * 0.14) * dim, 1]
      : [0.82 + rand() * 0.16, 0.82 + rand() * 0.14, 0.9 + rand() * 0.1, 1]
    ;(lit ? b.windowLit : b.windowDark).quad(
      [
        f.point(u - w / 2, v, 0.05),
        f.point(u + w / 2, v, 0.05),
        f.point(u + w / 2, v + h, 0.05),
        f.point(u - w / 2, v + h, 0.05),
      ],
      { color, uv: [0, 0, 1, 1], normal: f.dir(0, 0, 1) },
    )
  }

  // slate roof with the ridge along the street wall, plus gable ends in the wall material
  const pitched = (f, W, D, H, rh, wall, color, roofColor) => {
    const eave = 0.45
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
        b[wall],
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
  }

  // bare shell: box walls, rows of window quads on the street wall, pitched or parapet roof, stacks
  const shell = ({
    x,
    z,
    yaw,
    W,
    D,
    floors,
    wall,
    color,
    gf = 3.6,
    fh = 3.1,
    rise = 0.32,
    parapet = false,
    stacks = 1,
    lit = 0.3,
    loading = false,
  }) => {
    const f = frame(x, z, yaw)
    const H = gf + fh * floors
    fbox(b[wall], f, 0, H / 2, -D / 2, W, H, D, color)
    fbox(b.stone, f, 0, H - 0.1, 0.12, W + 0.3, 0.3, 0.4, [1.05, 1.02, 0.98, 1])
    let top
    if (parapet) {
      fbox(b.stone, f, 0, H + 0.2, -D / 2, W + 0.4, 0.4, D + 0.4, STONE)
      top = H + 0.4
    } else {
      const rh = D * rise
      pitched(f, W, D, H, rh, wall, color, pick(ROOFS))
      top = H + rh
    }
    const bays = Math.max(1, Math.round(W / 3.2))
    for (let i = 0; i < bays; i += 1) {
      const u = -W / 2 + (W / bays) * (i + 0.5)
      for (let k = 0; k < floors; k += 1) pane(f, u, gf + fh * k + 0.4, 1.1, 1.8, rand() < lit)
      if (loading) fbox(b.wash, f, u, 1.5, 0.05, 1.6, 3.0, 0.08, [0.32, 0.2, 0.14, 1])
    }
    for (let c = 0; c < stacks; c += 1)
      chimney(
        f,
        -W / 2 + ((c + 0.5) / stacks) * W + (rand() - 0.5) * 0.8,
        -D / 2 + (rand() - 0.5) * 1.0,
        H + (parapet ? 0.4 : D * rise * 0.25),
        top + 1.6 + rand() * 0.8,
        wall === 'brickYellow' ? 'brickYellow' : 'brickRed',
      )
    // only what the camera can reach gets a blocker
    block(f, [-W / 2, W / 2], [-D, 0], [0, top])
    count.shells += 1
    return H
  }

  // a run of terrace houses along one line of the given axis: widths and heights vary, each is a kit house or a shell
  const row = ({
    axis,
    from,
    to,
    line,
    yaw,
    depth,
    kit,
    floors,
    width = [6, 9],
    skip = [],
    shellOpts = {},
  }) => {
    let at = from
    while (at < to) {
      const W = between(width[0], width[1])
      const mid = at + W / 2
      at += W
      if (skip.some(([a, c]) => mid > a - W / 2 && mid < c + W / 2)) continue
      const [wall, color] = pick(WALLS)
      const n = pick(floors)
      const x = axis === 'x' ? mid : line
      const z = axis === 'x' ? line : mid
      if (kit) {
        house({
          x,
          z,
          yaw,
          W,
          D: depth,
          floors: n,
          wall,
          color,
          nChimney: rand() < 0.5 ? 2 : 1,
          litBias: -0.1,
          shopFronts: false,
          sides: false,
          quoins: false,
          roofColor: pick(ROOFS),
          doorColor: pick([
            [0.16, 0.2, 0.33, 1],
            [0.26, 0.14, 0.12, 1],
            [0.12, 0.26, 0.22, 1],
          ]),
        })
        count.houses += 1
      } else {
        shell({
          x,
          z,
          yaw,
          W,
          D: depth,
          floors: n,
          wall,
          color,
          stacks: rand() < 0.5 ? 2 : 1,
          rise: between(0.25, 0.42),
          ...shellOpts,
        })
      }
    }
  }

  // low yard wall with gaps, so the houses behind read as backing onto yards
  const yardWall = (x0, x1, z) => {
    for (let x = x0; x < x1; x += 7)
      if (rand() < 0.78)
        fbox(b.brickRed, frame(x + 3, z, 0), 0, 1.1, 0, 5.2, 2.2, 0.35, [0.82, 0.74, 0.72, 1])
  }

  // ---- south: terraces behind the cross street ----
  const x0 = full ? -86 : -62
  const x1 = full ? 74 : 64
  lane(x0, x1, -50, -54, [0.92, 0.88, 0.84, 1])
  yardWall(x0, x1, -50.6)
  // first row: kit houses fronting the yard wall; second row: shells across a back lane
  row({
    axis: 'x',
    from: x0,
    to: x1,
    line: -54,
    yaw: 0,
    depth: 10,
    kit: true,
    floors: [2, 3, 3, 4],
  })
  lane(x0, x1, -64, -72)
  // the church stands in the second row, on the axis of the main street
  const churchGap = [-12, 12]
  row({
    axis: 'x',
    from: x0,
    to: x1,
    line: -72,
    yaw: 0,
    depth: 10,
    kit: false,
    floors: [3, 4, 4, 5],
    width: [6, 10],
    skip: [churchGap],
  })
  if (full) {
    lane(x0, x1, -82, -93)
    // third row: bigger blocks and a few warehouses with loading doors, to break the skyline
    row({
      axis: 'x',
      from: x0,
      to: x1,
      line: -93,
      yaw: 0,
      depth: 12,
      kit: false,
      floors: [4, 5, 5],
      width: [9, 16],
      skip: [churchGap, [-47, -33], [44, 73]],
      shellOpts: { gf: 4.2, fh: 3.4, loading: true, parapet: false, rise: 0.22 },
    })
  }

  // church on the axis of the main street: tower and spire at the street end, nave behind
  {
    const f = frame(0, -73, 0)
    const side = [0.9, 0.86, 0.8, 1]
    fbox(b.stone, f, 0, 9, -3.5, 7, 18, 7, side)
    fbox(b.stone, f, 0, 18.2, -3.5, 7.7, 0.5, 7.7, STONE)
    fbox(b.stone, f, 0, 20.4, -3.5, 5.6, 4, 5.6, side)
    fbox(b.stone, f, 0, 22.6, -3.5, 6.2, 0.5, 6.2, STONE)
    // louvred belfry openings on all four faces
    for (let k = 0; k < 4; k += 1) {
      const p = frame(0, -76.5, (k * Math.PI) / 2).point(0, 0, 2.8)
      pane(frame(p[0], p[2], (k * Math.PI) / 2), 0, 19.2, 1.3, 2.6, false)
    }
    // clock face over the door, warm like the lit windows
    b.windowLit.quad(
      [
        f.point(-1.3, 13, 0.07),
        f.point(1.3, 13, 0.07),
        f.point(1.3, 15.6, 0.07),
        f.point(-1.3, 15.6, 0.07),
      ],
      { color: [1.1, 0.92, 0.6, 1], uv: [0, 0, 1, 1], normal: f.dir(0, 0, 1) },
    )
    pane(f, 0, 3.4, 1.6, 3.4, false)
    // stone spire
    const apex = f.point(0, 34, -3.5)
    const ring = [
      f.point(-2.9, 22.9, -0.6),
      f.point(2.9, 22.9, -0.6),
      f.point(2.9, 22.9, -6.4),
      f.point(-2.9, 22.9, -6.4),
    ]
    const out = [f.dir(0, 1, 1), f.dir(1, 1, 0), f.dir(0, 1, -1), f.dir(-1, 1, 0)]
    for (let k = 0; k < 4; k += 1)
      outward(b.slate, [ring[k], ring[(k + 1) % 4], apex, apex], out[k], {
        color: [0.9, 0.9, 1, 1],
      })
    // nave with a pitched roof along the street axis
    fbox(b.stone, f, 0, 5.5, -17, 12, 11, 20, side)
    const ridge = 15.5
    outward(
      b.slate,
      [
        f.point(-6.5, 11, -6.5),
        f.point(-6.5, 11, -27.5),
        f.point(0, ridge, -27.5),
        f.point(0, ridge, -6.5),
      ],
      f.dir(-1, 1.2, 0),
      { color: [0.9, 0.9, 0.98, 1] },
    )
    outward(
      b.slate,
      [
        f.point(6.5, 11, -6.5),
        f.point(6.5, 11, -27.5),
        f.point(0, ridge, -27.5),
        f.point(0, ridge, -6.5),
      ],
      f.dir(1, 1.2, 0),
      { color: [0.86, 0.86, 0.94, 1] },
    )
    for (let k = 0; k < 4; k += 1) {
      pane(frame(6.04, -82 - k * 4.5, E), 0, 3.4, 1.4, 5, false)
      pane(frame(-6.04, -82 - k * 4.5, W_), 0, 3.4, 1.4, 5, false)
    }
    block(f, [-3.9, 3.9], [-7, 0], [0, 23])
    block(f, [-6.2, 6.2], [-27, -7], [0, 16])
  }

  // mill stack and, on the full tier, a gasholder; both reach a little above the rooftops
  const stackAt = [-40, -98]
  b.brickRed.cylinder({
    c: [stackAt[0], 16, stackAt[1]],
    r: 1.7,
    rTop: 1.0,
    h: 32,
    seg: 12,
    color: [0.86, 0.74, 0.72, 1],
  })
  b.stone.cylinder({
    c: [stackAt[0], 32.3, stackAt[1]],
    r: 1.25,
    rTop: 1.25,
    h: 0.7,
    seg: 12,
    color: STONE,
  })
  b.stone.cylinder({
    c: [stackAt[0], 26, stackAt[1]],
    r: 1.4,
    rTop: 1.4,
    h: 0.4,
    seg: 12,
    color: STONE,
  })
  world.blockers.push({
    min: [stackAt[0] - 2.4, 0, stackAt[1] - 2.4],
    max: [stackAt[0] + 2.4, 33, stackAt[1] + 2.4],
  })
  const smokeStacks = [[stackAt[0], 33, stackAt[1]]]
  if (full) {
    const gx = 58
    const gz = -100
    b.wash.cylinder({ c: [gx, 5, gz], r: 10, h: 10, seg: 20, color: [0.5, 0.52, 0.62, 1] })
    const post = (k) => [
      gx + Math.sin((k / 10) * Math.PI * 2) * 11,
      gz + Math.cos((k / 10) * Math.PI * 2) * 11,
    ]
    for (let k = 0; k < 10; k += 1) {
      const [px, pz] = post(k)
      b.wash.bar([px, 0, pz], [px, 19, pz], 0.5, { color: IRON })
      const [qx, qz] = post(k + 1)
      for (const y of [9.5, 19]) b.wash.bar([px, y, pz], [qx, y, qz], 0.3, { color: IRON })
      b.wash.bar([px, 0.5, pz], [qx, 9.5, qz], 0.18, { color: IRON })
    }
    world.blockers.push({ min: [gx - 11.5, 0, gz - 11.5], max: [gx + 11.5, 20, gz + 11.5] })
  }

  // ---- west: back streets behind the x -32 terrace ----
  const zA = -50
  const zB = 46
  lane(-44, -32, zA, zB, [0.84, 0.8, 0.82, 1])
  lane(-76, -64, zA, zB, [0.84, 0.8, 0.82, 1])
  row({
    axis: 'z',
    from: zA,
    to: zB,
    line: -44,
    yaw: E,
    depth: 10,
    kit: true,
    floors: [2, 3, 3, 4],
    width: [7, 11],
  })
  row({
    axis: 'z',
    from: zA,
    to: zB,
    line: -64,
    yaw: W_,
    depth: 10,
    kit: false,
    floors: [3, 4, 4],
    width: [7, 11],
  })
  if (full)
    row({
      axis: 'z',
      from: zA,
      to: zB,
      line: -76,
      yaw: E,
      depth: 10,
      kit: false,
      floors: [3, 4, 5],
      width: [8, 13],
    })

  // a plume from the mill stack, and from every few terrace stacks
  chimneys.forEach((p, i) => {
    if (i % (full ? 5 : 8) === 0) smokeStacks.push(p)
  })
  return { smokeStacks, count }
}
