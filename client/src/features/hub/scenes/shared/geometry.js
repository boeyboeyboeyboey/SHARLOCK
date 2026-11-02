import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
]
export const rgb = (hex, k = 1) => {
  const c = hexToRgb(hex)
  return [c[0] * k, c[1] * k, c[2] * k, 0]
}

// facade-local frame: u to the right as seen from outside, v up, w outward from the wall (yaw = facade normal angle)
export function frame(ox, oz, yaw) {
  const nx = Math.sin(yaw)
  const nz = Math.cos(yaw)
  const tx = -Math.cos(yaw)
  const tz = Math.sin(yaw)
  return {
    yaw,
    point: (u, v, w) => [ox + tx * u + nx * w, v, oz + tz * u + nz * w],
    dir: (u, v, w) => [tx * u + nx * w, v, tz * u + nz * w],
    // rotation that maps a local box (x right, y up, z into the wall) into the world
    boxYaw: yaw + Math.PI,
  }
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

// collects many small solids into one vertex-coloured mesh, so a whole district is a handful of draw calls
// colour is [r, g, b, flicker]; uv2 is [seed, extra]
export class Batch {
  constructor({ worldUv = 0 } = {}) {
    // metres per texture repeat; uvs come from world position projected along the dominant normal axis
    this.worldUv = worldUv
    this.pos = []
    this.nor = []
    this.col = []
    this.uv = []
    this.uv2 = []
    this.idx = []
    this.triangles = 0
  }

  // corners seen from the front: bottom left, bottom right, top right, top left
  quad(
    p,
    {
      color = [1, 1, 1, 0],
      colors = null,
      uv = [0, 0, 1, 1],
      uv2 = null,
      seed = 0,
      extra = 0,
      normal = null,
      flip = false,
    } = {},
  ) {
    const n = normal ?? norm(cross(sub(p[3], p[0]), sub(p[1], p[0])))
    const base = this.pos.length / 3
    const uvs = [
      [uv[0], uv[1]],
      [uv[2], uv[1]],
      [uv[2], uv[3]],
      [uv[0], uv[3]],
    ]
    const uvs2 = uv2
      ? [
          [uv2[0], uv2[1]],
          [uv2[2], uv2[1]],
          [uv2[2], uv2[3]],
          [uv2[0], uv2[3]],
        ]
      : null
    const ax = Math.abs(n[0])
    const ay = Math.abs(n[1])
    const az = Math.abs(n[2])
    for (let i = 0; i < 4; i += 1) {
      this.pos.push(...p[i])
      this.nor.push(...(flip ? [-n[0], -n[1], -n[2]] : n))
      this.col.push(...(colors ? colors[i] : color))
      if (this.worldUv) {
        const q = p[i]
        const k = 1 / this.worldUv
        if (ay >= ax && ay >= az) this.uv.push(q[0] * k, q[2] * k)
        else if (ax >= az) this.uv.push(q[2] * k, q[1] * k)
        else this.uv.push(q[0] * k, q[1] * k)
      } else this.uv.push(...uvs[i])
      if (uvs2) this.uv2.push(...uvs2[i])
      else this.uv2.push(seed, extra)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    this.triangles += 2
  }

  // two sided quad for thin sheets such as cloth and signs
  sheet(p, opts) {
    this.quad(p, opts)
    this.quad([p[1], p[0], p[3], p[2]], {
      ...opts,
      uv: opts?.uv ? [opts.uv[2], opts.uv[1], opts.uv[0], opts.uv[3]] : undefined,
    })
  }

  // axis aligned box, rotated by yaw about its own centre
  box({
    c,
    s,
    yaw = 0,
    color = [0.5, 0.5, 0.5, 0],
    uv = null,
    seed = 0,
    top = true,
    bottom = false,
    faces = null,
  }) {
    const h = [s[0] / 2, s[1] / 2, s[2] / 2]
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const tr = (v) => [c[0] + v[0] * cy + v[2] * sy, c[1] + v[1], c[2] - v[0] * sy + v[2] * cy]
    const faceDefs = [
      { n: [0, 0, -1], up: [0, 1, 0], r: [1, 0, 0] },
      { n: [0, 0, 1], up: [0, 1, 0], r: [-1, 0, 0] },
      { n: [1, 0, 0], up: [0, 1, 0], r: [0, 0, 1] },
      { n: [-1, 0, 0], up: [0, 1, 0], r: [0, 0, -1] },
    ]
    if (top) faceDefs.push({ n: [0, 1, 0], up: [0, 0, 1], r: [1, 0, 0] })
    if (bottom) faceDefs.push({ n: [0, -1, 0], up: [0, 0, 1], r: [-1, 0, 0] })
    for (const f of faceDefs) {
      const ext = (v) => Math.abs(v[0]) * h[0] + Math.abs(v[1]) * h[1] + Math.abs(v[2]) * h[2]
      const fc = [f.n[0] * ext(f.n), f.n[1] * ext(f.n), f.n[2] * ext(f.n)]
      const hr = ext(f.r)
      const hu = ext(f.up)
      const corner = (a, b) =>
        tr([
          fc[0] + f.r[0] * hr * a + f.up[0] * hu * b,
          fc[1] + f.r[1] * hr * a + f.up[1] * hu * b,
          fc[2] + f.r[2] * hr * a + f.up[2] * hu * b,
        ])
      const key = f.n.join(',')
      const rect = faces?.[key] ?? uv ?? [0, 0, 1, 1]
      this.quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], {
        color: faces?.[`${key}:color`] ?? color,
        uv: rect,
        seed,
      })
    }
  }

  // upright cylinder, or a cone when the top radius differs
  cylinder({
    c,
    r,
    rTop = r,
    h,
    seg = 8,
    color = [0.5, 0.5, 0.5, 0],
    uv = [0.5, 0.5, 0.5, 0.5],
    seed = 0,
    cap = true,
  }) {
    const y0 = c[1] - h / 2
    const y1 = c[1] + h / 2
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      const p = (a, rr, y) => [c[0] + Math.sin(a) * rr, y, c[2] + Math.cos(a) * rr]
      const mid = (a0 + a1) / 2
      const n = norm([Math.sin(mid), (r - rTop) / h, Math.cos(mid)])
      this.quad([p(a1, r, y0), p(a0, r, y0), p(a0, rTop, y1), p(a1, rTop, y1)], {
        color,
        uv,
        seed,
        normal: n,
      })
      if (cap && rTop > 0) {
        const top = [c[0], y1, c[2]]
        this.quad([top, p(a1, rTop, y1), p(a0, rTop, y1), top], {
          color,
          uv,
          seed,
          normal: [0, 1, 0],
        })
      }
    }
  }

  // thin bar between two points
  bar(a, b, thick, opts = {}) {
    const dir = sub(b, a)
    const len = Math.hypot(dir[0], dir[1], dir[2])
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    const horizontal = Math.hypot(dir[0], dir[2])
    const yaw = Math.atan2(dir[0], dir[2])
    const pitch = Math.atan2(dir[1], horizontal)
    // build along z, then tilt and yaw by transforming corners
    const hs = [thick / 2, thick / 2, len / 2]
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const tr = (v) => {
      // pitch about x (tilt up toward +z), then yaw about y
      const y1 = v[1] * cp + v[2] * sp
      const z1 = -v[1] * sp + v[2] * cp
      return [mid[0] + v[0] * cy + z1 * sy, mid[1] + y1, mid[2] - v[0] * sy + z1 * cy]
    }
    const defs = [
      { n: [0, 0, -1], up: [0, 1, 0], r: [1, 0, 0] },
      { n: [0, 0, 1], up: [0, 1, 0], r: [-1, 0, 0] },
      { n: [1, 0, 0], up: [0, 1, 0], r: [0, 0, 1] },
      { n: [-1, 0, 0], up: [0, 1, 0], r: [0, 0, -1] },
      { n: [0, 1, 0], up: [0, 0, 1], r: [1, 0, 0] },
      { n: [0, -1, 0], up: [0, 0, 1], r: [-1, 0, 0] },
    ]
    for (const f of defs) {
      const ext = (v) => Math.abs(v[0]) * hs[0] + Math.abs(v[1]) * hs[1] + Math.abs(v[2]) * hs[2]
      const fc = [f.n[0] * ext(f.n), f.n[1] * ext(f.n), f.n[2] * ext(f.n)]
      const hr = ext(f.r)
      const hu = ext(f.up)
      const corner = (x, y) =>
        tr([
          fc[0] + f.r[0] * hr * x + f.up[0] * hu * y,
          fc[1] + f.r[1] * hr * x + f.up[1] * hu * y,
          fc[2] + f.r[2] * hr * x + f.up[2] * hu * y,
        ])
      this.quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], opts)
    }
  }

  get vertexCount() {
    return this.pos.length / 3
  }

  build(scene, name, material, { updatable = false } = {}) {
    const mesh = new Mesh(name, scene)
    const data = new VertexData()
    data.positions = new Float32Array(this.pos)
    data.normals = new Float32Array(this.nor)
    data.colors = new Float32Array(this.col)
    data.uvs = new Float32Array(this.uv)
    data.uvs2 = new Float32Array(this.uv2)
    data.indices = this.vertexCount > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx)
    data.applyToMesh(mesh, updatable)
    mesh.material = material
    mesh.isPickable = false
    return mesh
  }
}
