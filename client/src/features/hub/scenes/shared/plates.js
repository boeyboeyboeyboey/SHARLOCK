import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';

// open strip of a cylinder seen from inside; uv2.y carries the edge fade, azimuth 0 is north
export function arcStrip(scene, name, { r, y0, y1, az0, az1, columns = 32, rows = 1, fadeLeft = 0, fadeRight = 0, fadeTop = 0, fadeBottom = 0, flip = false }) {
  const pos = [];
  const uv = [];
  const uv2 = [];
  const nor = [];
  const col = [];
  const idx = [];
  const ease = (f) => {
    const c = Math.min(1, Math.max(0, f));
    return c * c * (3 - 2 * c);
  };
  for (let i = 0; i <= columns; i += 1) {
    const t = i / columns;
    const az = az0 + (az1 - az0) * t;
    const x = Math.sin(az) * r;
    const z = Math.cos(az) * r;
    const across = Math.min(fadeLeft ? t / fadeLeft : 1, fadeRight ? (1 - t) / fadeRight : 1);
    const u = flip ? 1 - t : t;
    for (let j = 0; j <= rows; j += 1) {
      const v = j / rows;
      const down = Math.min(fadeBottom ? v / fadeBottom : 1, fadeTop ? (1 - v) / fadeTop : 1);
      pos.push(x, y0 + (y1 - y0) * v, z);
      nor.push(-Math.sin(az), 0, -Math.cos(az));
      // vertex alpha carries the edge fade so a plain material can use it
      const fade = ease(across) * ease(down);
      col.push(1, 1, 1, fade);
      uv.push(u, v);
      uv2.push(0, fade);
    }
    if (i < columns) {
      for (let j = 0; j < rows; j += 1) {
        const a = i * (rows + 1) + j;
        const c = a + rows + 1;
        idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = new Float32Array(pos);
  data.normals = new Float32Array(nor);
  data.colors = new Float32Array(col);
  data.uvs = new Float32Array(uv);
  data.uvs2 = new Float32Array(uv2);
  data.indices = new Uint16Array(idx);
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.hasVertexAlpha = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

