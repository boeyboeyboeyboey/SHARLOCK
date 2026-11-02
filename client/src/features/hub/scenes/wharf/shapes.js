import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const crossv = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

// quad whose front faces the given outward direction, whatever order the corners came in
export function outward(batch, p, out, opts = {}) {
  const n = crossv(sub(p[3], p[0]), sub(p[1], p[0]))
  const facing = n[0] * out[0] + n[1] * out[1] + n[2] * out[2]
  if (facing >= 0) batch.quad(p, opts)
  else
    batch.quad([p[1], p[0], p[3], p[2]], {
      ...opts,
      uv: opts.uv ? [opts.uv[2], opts.uv[1], opts.uv[0], opts.uv[3]] : undefined,
    })
}

// axis aligned box from min and max corners
export function slab(batch, x0, x1, y0, y1, z0, z1, color, opts = {}) {
  batch.box({
    c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    s: [x1 - x0, y1 - y0, z1 - z0],
    color,
    ...opts,
  })
}

export const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k, 1]

// many copies of one small mesh as a single thin instanced draw; colours tint each copy
export function instanced(scene, name, source, material, placements) {
  const matrices = new Float32Array(placements.length * 16)
  const colors = new Float32Array(placements.length * 4)
  placements.forEach((p, i) => {
    const q = Quaternion.RotationYawPitchRoll(p.yaw ?? 0, p.pitch ?? 0, p.roll ?? 0)
    const s = p.scale ?? [1, 1, 1]
    Matrix.Compose(new Vector3(...s), q, new Vector3(...p.at)).copyToArray(matrices, i * 16)
    const c = p.color ?? [1, 1, 1, 1]
    colors.set([c[0], c[1], c[2], 1], i * 4)
  })
  source.name = name
  source.material = material
  source.thinInstanceSetBuffer('matrix', matrices, 16, true)
  source.thinInstanceSetBuffer('color', colors, 4, true)
  source.alwaysSelectAsActiveMesh = true
  source.isPickable = false
  return source
}

// builds a mesh from raw triangles, for small unique pieces (gull, sails)
export function rawMesh(scene, name, positions, indices, colorsArr, material) {
  const mesh = new Mesh(name, scene)
  const data = new VertexData()
  data.positions = new Float32Array(positions)
  data.indices = new Uint16Array(indices)
  const normals = []
  VertexData.ComputeNormals(data.positions, data.indices, normals)
  data.normals = new Float32Array(normals)
  if (colorsArr) data.colors = new Float32Array(colorsArr)
  data.applyToMesh(mesh, false)
  mesh.material = material
  mesh.isPickable = false
  return mesh
}
