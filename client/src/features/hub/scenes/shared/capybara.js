import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { createIdle } from './idle.js';
import { HOP_HEIGHT } from './jump.js';

// code built, toon shaded capybara. +z is forward, y is up, feet at y 0, every shape is authored in this rest pose
// and the animated parts hang under pivot nodes whose meshes are offset by minus the pivot, so the rest pose is exact
const PI = Math.PI;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sp = (v, e) => Math.sign(v) * Math.abs(v) ** e;

export const furStyles = {
  sharlock: { back: [0.5, 0.3, 0.17], mid: [0.7, 0.45, 0.25], belly: [0.84, 0.64, 0.42], muzzle: [0.8, 0.6, 0.44], dark: [0.34, 0.21, 0.13], nose: [0.24, 0.15, 0.12], ear: [0.4, 0.24, 0.15], scarf: [0.54, 0.165, 0.18] },
  dockA: { back: [0.5, 0.32, 0.2], mid: [0.68, 0.47, 0.29], belly: [0.82, 0.64, 0.44], muzzle: [0.78, 0.6, 0.44], dark: [0.34, 0.22, 0.15], nose: [0.24, 0.15, 0.12], ear: [0.4, 0.26, 0.17] },
  dockB: { back: [0.42, 0.3, 0.22], mid: [0.6, 0.46, 0.34], belly: [0.76, 0.62, 0.46], muzzle: [0.74, 0.6, 0.47], dark: [0.3, 0.22, 0.17], nose: [0.24, 0.15, 0.12], ear: [0.34, 0.25, 0.18] },
  dockC: { back: [0.58, 0.34, 0.16], mid: [0.76, 0.5, 0.24], belly: [0.88, 0.68, 0.4], muzzle: [0.84, 0.64, 0.42], dark: [0.4, 0.24, 0.13], nose: [0.24, 0.15, 0.12], ear: [0.46, 0.27, 0.15] },
};

// body proportions: barrel about 2:1 long to tall, short sturdy legs
const BODY = { c: [0, 0.58, -0.08], r: [0.335, 0.355, 0.62], e: [0.7, 0.85] };
const HEAD = { c: [0, 0.72, 0.8], r: [0.215, 0.215, 0.38], e: [0.55, 0.6] };
const MUZZLE = { c: [0, 0.725, 1.12], r: [0.185, 0.17, 0.15], e: [0.45, 0.5] };
const HIPS = [
  { id: 'fl', p: [0.2, 0.42, 0.36], pair: 0 },
  { id: 'fr', p: [-0.2, 0.42, 0.36], pair: 1 },
  { id: 'bl', p: [0.22, 0.42, -0.45], pair: 1 },
  { id: 'br', p: [-0.22, 0.42, -0.45], pair: 0 },
];
const NECK = [0, 0.72, 0.5];
const EARS = [
  { id: 'l', p: [0.185, 0.89, 0.5], side: 1 },
  { id: 'r', p: [-0.185, 0.89, 0.5], side: -1 },
];
const MONOCLE = { c: [0.235, 0.83, 0.745], n: [0.93, 0, 0.37], radius: 0.058 };
const EYE_P = [0, 0.835, 0.74];
const NOSE_P = [0, 0.82, 1.075];
const MOUTH_P = [0, 0.655, 1.075];

// sharlock only: a stubbier head that sinks into a fatter body and bigger flatter nostrils, the dock workers keep the shared shapes above
// pear shape: the rear half is fatter and a bit taller, the front half only slightly wider
const SH_BODY = { c: [0, 0.6, -0.08], r: [0.372, 0.394, 0.62], e: [0.7, 0.85], pear: (z) => { const q = smooth(0.1, -0.45, z); return [1 + 0.08 * q, 1 + 0.05 * q]; } };
const SH_HEAD = { c: [0, 0.72, 0.74], r: [0.215, 0.215, 0.32], e: [0.55, 0.6], at: headAt };
// loaf shaped head: the back half swells to about 0.30 wide and 0.31 tall with a higher crown and eases to the plain size by the eyes
function headDims(z) {
  const q = smooth(0.74, 0.46, z);
  return { cy: 0.72 - 0.047 * q, rx: 0.215 * (1 + 0.4 * q), ry: 0.215 * (1 + 0.47 * q) };
}
function headAt(u, v) {
  const H = SH_HEAD;
  const phi = PI * v - PI / 2;
  const psi = TAU * u;
  const s = Math.abs(Math.cos(phi)) ** H.e[0];
  const z = H.c[2] + H.r[2] * sp(Math.sin(phi), H.e[0]);
  const d = headDims(z);
  return [d.rx * s * sp(Math.cos(psi), H.e[1]), d.cy + d.ry * s * sp(Math.sin(psi), H.e[1]), z];
}
const SH_EARS = [
  { id: 'l', p: [0.215, 0.945, 0.5], side: 1 },
  { id: 'r', p: [-0.215, 0.945, 0.5], side: -1 },
];
const SH_MUZZLE = { c: [0, 0.725, 0.96], r: [0.185, 0.17, 0.12], e: [0.38, 0.5] };
const SH_HIPS = HIPS.map((h) => ({ ...h, p: [h.p[0] * 1.11, h.p[1], h.p[2]] }));
const SH_HEAD_SHIFT = [0, -0.02, -0.12];
const SH_NOSE = { x: 0.062, z: 1.08, r: [0.04, 0.03, 0.007] };
const SH_RUMP = { c: [0, 0.55, -0.42], r: [0.42, 0.32, 0.26] };
// tapered neck volume from the shoulders into the back of the head, so there is no step between the two
const SH_NECK = { z0: 0.15, z1: 0.42, from: { y: 0.6, rx: 0.36, ry: 0.385 }, to: { y: 0.66, rx: 0.28, ry: 0.29 } };
// neck cross section at v along the loft, a straight taper so the top line runs on from the back into the head
const neckDims = (v) => ({ y: SH_NECK.from.y + (SH_NECK.to.y - SH_NECK.from.y) * v, rx: SH_NECK.from.rx + (SH_NECK.to.rx - SH_NECK.from.rx) * v, ry: SH_NECK.from.ry + (SH_NECK.to.ry - SH_NECK.from.ry) * v });
function neckAt(u, v) {
  const d = neckDims(v);
  const a = TAU * u;
  return [d.rx * sp(Math.cos(a), 0.6), d.y + d.ry * sp(Math.sin(a), 0.6), SH_NECK.z0 + (SH_NECK.z1 - SH_NECK.z0) * v];
}
// scarf ring round the neck just behind the cheeks, a is the angle round the ring (0 is the left, down is the throat)
const SH_RING = { z: 0.54, a: -0.9, tube: 0.04 };
function ringPoint(a, extra = 0) {
  const h = headDims(SH_RING.z - SH_HEAD_SHIFT[2]);
  const d = { y: h.cy + SH_HEAD_SHIFT[1], rx: h.rx, ry: h.ry };
  const px = d.rx * 1.08 * sp(Math.cos(a), 0.6);
  const py = d.ry * 1.08 * sp(Math.sin(a), 0.6);
  const len = Math.hypot(px / d.rx, py / d.ry) || 1;
  return [px + (px / d.rx / len) * extra, d.y + py + (py / d.ry / len) * extra, SH_RING.z - 0.015 * Math.sin(a)];
}

// a bag of vertex coloured triangles, one surface at a time so normals stay smooth inside a shape
class Kit {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
  }

  get triangles() {
    return this.idx.length / 3;
  }

  // at(u, v) gives a root space point, u runs around (wrapping when wrap is set), v runs along. hint is the side that must face out
  surface({ cols, rows, wrap = false, at, color = () => [1, 1, 1], uv = null, hint = null }) {
    const W = wrap ? cols : cols + 1;
    const pos = [];
    for (let j = 0; j <= rows; j += 1) for (let i = 0; i < W; i += 1) pos.push(...at(i / cols, j / rows));
    const idx = [];
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const i1 = wrap ? (i + 1) % cols : i + 1;
        const a = j * W + i;
        const b = j * W + i1;
        const c = (j + 1) * W + i;
        const d = (j + 1) * W + i1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const nor = [];
    VertexData.ComputeNormals(pos, idx, nor);
    // the poles are rings of identical points, so give each ring one shared normal
    if (wrap) {
      for (const j of [0, rows]) {
        const base = j * W;
        if (Math.hypot(pos[base * 3] - pos[(base + 1) * 3], pos[base * 3 + 1] - pos[(base + 1) * 3 + 1], pos[base * 3 + 2] - pos[(base + 1) * 3 + 2]) < 1e-9) {
          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (let i = 0; i < W; i += 1) {
            sx += nor[(base + i) * 3];
            sy += nor[(base + i) * 3 + 1];
            sz += nor[(base + i) * 3 + 2];
          }
          const l = Math.hypot(sx, sy, sz) || 1;
          for (let i = 0; i < W; i += 1) nor.splice((base + i) * 3, 3, sx / l, sy / l, sz / l);
        }
      }
    }
    // make the front face look outward: toward the hint, or away from the centroid of a closed shape
    const count = pos.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < count; k += 1) {
      cx += pos[k * 3];
      cy += pos[k * 3 + 1];
      cz += pos[k * 3 + 2];
    }
    cx /= count;
    cy /= count;
    cz /= count;
    let facing = 0;
    for (let k = 0; k < count; k += 1) {
      const o = hint ?? [pos[k * 3] - cx, pos[k * 3 + 1] - cy, pos[k * 3 + 2] - cz];
      facing += nor[k * 3] * o[0] + nor[k * 3 + 1] * o[1] + nor[k * 3 + 2] * o[2];
    }
    if (facing < 0) {
      for (let k = 0; k < nor.length; k += 1) nor[k] = -nor[k];
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    }
    const base = this.pos.length / 3;
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i < W; i += 1) {
        const k = j * W + i;
        const p = [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
        const n = [nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]];
        this.pos.push(...p);
        this.nor.push(...n);
        this.col.push(...color(p, n, i / cols, j / rows), 1);
        this.uv.push(...(uv ? uv(p, n, i / cols, j / rows) : [0, 0]));
      }
    }
    for (const k of idx) this.idx.push(base + k);
  }

  toMesh(scene, name, material) {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = new Float32Array(this.pos);
    data.normals = new Float32Array(this.nor);
    data.colors = new Float32Array(this.col);
    data.uvs = new Float32Array(this.uv);
    data.indices = this.pos.length / 3 > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    data.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
}

const rotator = (rot) => {
  const m = Matrix.RotationYawPitchRoll(rot[1], rot[0], rot[2]);
  return (v) => {
    const out = Vector3.TransformCoordinates(new Vector3(v[0], v[1], v[2]), m);
    return [out.x, out.y, out.z];
  };
};

// superellipsoid: r is the half size per world axis, e is [exponent along the pole, exponent of the cross section] (1 is a plain ellipsoid)
function ellipsoid({ c, r, e = [1, 1], axis = 'y', rot = [0, 0, 0] }) {
  const turn = rotator(rot);
  return (u, v) => {
    const phi = PI * v - PI / 2;
    const psi = TAU * u;
    const s = Math.abs(Math.cos(phi)) ** e[0];
    const ring1 = s * sp(Math.cos(psi), e[1]);
    const ring2 = s * sp(Math.sin(psi), e[1]);
    const pole = sp(Math.sin(phi), e[0]);
    let local;
    if (axis === 'z') local = [r[0] * ring1, r[1] * ring2, r[2] * pole];
    else if (axis === 'x') local = [r[0] * pole, r[1] * ring1, r[2] * ring2];
    else local = [r[0] * ring1, r[1] * pole, r[2] * ring2];
    const t = turn(local);
    return [c[0] + t[0], c[1] + t[1], c[2] + t[2]];
  };
}

// the barrel body at pole angle phi and cross section angle psi (0 is the top of the back), used by the body and the scarf that hugs it
function bodyAt(phi, psi, k = 1, kz = 1, B = BODY) {
  const s = Math.abs(Math.cos(phi)) ** B.e[0];
  const z = B.c[2] + B.r[2] * sp(Math.sin(phi), B.e[0]) * kz;
  const w = B.pear ? B.pear(z) : [1, 1];
  return [
    B.c[0] + B.r[0] * s * w[0] * sp(Math.sin(psi), B.e[1]) * k,
    B.c[1] + B.r[1] * s * w[1] * sp(Math.cos(psi), B.e[1]) * k,
    z,
  ];
}

// open path tube, a thin chain
function tube(points, radius) {
  const n = points.length;
  const frames = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const t = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const up = Math.abs(t.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const side = Vector3.Cross(t, up).normalize();
    return { p, side, up: Vector3.Cross(side, t).normalize() };
  });
  return (u, v) => {
    const f = v * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(f));
    const k = f - i0;
    const a = frames[i0];
    const b = frames[i0 + 1];
    const lerp = (x, y) => x + (y - x) * k;
    const ang = TAU * u;
    const ca = Math.cos(ang) * radius;
    const sa = Math.sin(ang) * radius;
    return [
      lerp(a.p[0], b.p[0]) + lerp(a.side.x, b.side.x) * ca + lerp(a.up.x, b.up.x) * sa,
      lerp(a.p[1], b.p[1]) + lerp(a.side.y, b.side.y) * ca + lerp(a.up.y, b.up.y) * sa,
      lerp(a.p[2], b.p[2]) + lerp(a.side.z, b.side.z) * ca + lerp(a.up.z, b.up.z) * sa,
    ];
  };
}

// triplanar style uv from the dominant normal axis, tile is the size in metres of one texture repeat
const worldUv = (tile) => (p, n) => {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] / tile, p[2] / tile];
  if (ax >= az) return [p[2] / tile, p[1] / tile];
  return [p[0] / tile, p[1] / tile];
};

const dapple = (p) => 1 + 0.05 * Math.sin(p[0] * 21 + p[2] * 13) * Math.cos(p[1] * 17 - p[2] * 9) + 0.03 * Math.sin(p[2] * 31 + p[0] * 7);
const scaleColor = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// fur: darker back, lighter belly and muzzle
const bodyFur = (st) => (p, n) => scaleColor(mix(mix(st.belly, st.mid, smooth(-0.7, 0.1, n[1])), st.back, smooth(0.2, 0.85, n[1])), dapple(p));
const headFur = (st, dz = 0) => (p, n) => {
  const base = mix(mix(st.belly, st.mid, smooth(-0.6, 0.1, n[1])), st.back, smooth(0.35, 0.95, n[1]));
  return scaleColor(mix(base, st.muzzle, smooth(0.98 + dz, 1.1 + dz, p[2])), dapple(p));
};
const muzzleFur = (st) => (p, n) => scaleColor(mix(mix(st.muzzle, st.belly, smooth(0.0, -0.8, n[1])), st.mid, smooth(0.5, 1.0, n[1]) * 0.55), dapple(p));
const legFur = (st) => (p) => mix(st.dark, mix(st.mid, st.back, 0.4), smooth(0.13, 0.36, p[1]));

function addBody(kit, st, B = BODY) {
  kit.surface({ cols: 36, rows: 24, wrap: true, at: (u, v) => bodyAt(PI * v - PI / 2, TAU * u, 1, 1, B), color: bodyFur(st) });
}

const phiOf = (z, B = BODY) => Math.asin(sp(clamp((z - B.c[2]) / B.r[2], -1, 1), 1 / B.e[0]));

// knitted scarf: the ribs run round the neck, so the shade only changes across the width; u is across the strip
const ribs = (st, count, v, edge = 0) => scaleColor(st.scarf, (0.92 + 0.08 * Math.cos(v * TAU * count)) * (1 - 0.25 * edge));

// knitted scarf ring: a soft tube round the neck, a little proud of the fur everywhere
function addScarfRing(kit, st) {
  kit.surface({
    cols: 40,
    rows: 8,
    wrap: true,
    at: (u, v) => {
      const a = TAU * u;
      const b = TAU * v;
      const c = ringPoint(a, SH_RING.tube * Math.cos(b));
      return [c[0], c[1], c[2] + SH_RING.tube * Math.sin(b)];
    },
    color: (p, n, u, v) => ribs(st, 3, v),
  });
}

// knot at the front left of the throat and two short ends that lie down the chest, on their own pivot so they can sway
const KNOT_P = ringPoint(SH_RING.a, 0.03);
function addScarfEnds(kit, st, B = BODY) {
  kit.surface({ cols: 14, rows: 10, wrap: true, at: ellipsoid({ c: KNOT_P, r: [0.045, 0.045, 0.05] }), color: () => scaleColor(st.scarf, 0.95) });
  for (const [base, length] of [[0.9, 0.26], [0.55, 0.18]]) {
    kit.surface({
      cols: 8,
      rows: 12,
      hint: [0.6, -0.6, 0.2],
      at: (u, v) => bodyAt(phiOf(0.5 - length * v, B), PI - base + (u - 0.5) * 0.3, 1.05 + 0.025 * Math.sin(u * PI), 1, B),
      color: (p, n, u, v) => ribs(st, 3, u, smooth(0.92, 1, v)),
    });
  }
}

// long flat topped head with a slim boxy muzzle, small high nostrils, eyes set high and back
function addNostril(kit, st, s, n = { x: 0.058, z: 1.265, r: [0.024, 0.019, 0.014] }) {
  kit.surface({ cols: 8, rows: 6, wrap: true, at: ellipsoid({ c: [s * n.x, 0.82, n.z], r: n.r }), color: () => st.nose });
}

function addEye(kit, s) {
  kit.surface({ cols: 12, rows: 8, wrap: true, at: ellipsoid({ c: [s * 0.205, 0.835, 0.74], r: [0.032, 0.036, 0.036] }), color: () => [0.1, 0.06, 0.05] });
  kit.surface({ cols: 8, rows: 6, wrap: true, at: ellipsoid({ c: [s * 0.226, 0.85, 0.756], r: [0.011, 0.011, 0.011] }), color: () => [1.4, 1.3, 1.15] });
}

// split leaves the nostrils and eyes out so the rig can hang them on their own pivots
function addHead(kit, st, split = false, H = HEAD, M = MUZZLE, mouthZ = 1.265) {
  kit.surface({ cols: 32, rows: 20, wrap: true, at: H.at ?? ellipsoid({ ...H, axis: 'z' }), color: headFur(st, H.c[2] - HEAD.c[2] + HEAD.r[2] - H.r[2]) });
  kit.surface({ cols: 24, rows: 14, wrap: true, at: ellipsoid({ ...M, axis: 'z' }), color: muzzleFur(st) });
  if (!split) {
    for (const s of [-1, 1]) {
      addNostril(kit, st, s);
      addEye(kit, s);
    }
  }
  // mouth line
  kit.surface({ cols: 12, rows: 6, wrap: true, at: ellipsoid({ c: [0, 0.655, mouthZ], r: [0.1, 0.007, 0.012] }), color: () => scaleColor(st.dark, 0.9) });
}

// small dark open mouth for the yawn, scaled to nothing at rest
function addYawnMouth(kit) {
  kit.surface({ cols: 16, rows: 10, wrap: true, at: ellipsoid({ c: MOUTH_P, r: [0.05, 0.03, 0.014] }), color: () => [0.12, 0.05, 0.05] });
}

function addEar(kit, st, side, p) {
  kit.surface({
    cols: 14,
    rows: 10,
    wrap: true,
    at: ellipsoid({ c: [p[0] + side * 0.02, p[1] + 0.025, p[2]], r: [0.03, 0.042, 0.034], rot: [0, 0, -side * 0.35] }),
    color: (q, n) => mix(st.ear, [0.72, 0.5, 0.42], smooth(0.2, 0.9, n[0] * side * -1) * 0.5),
  });
}

// origin puts the hip at 0,0,0 so one leg mesh can be instanced for every hip
function addLeg(kit, st, hip, origin = false) {
  const x = origin ? 0 : hip.p[0];
  const z = origin ? 0 : hip.p[2];
  const oy = origin ? -0.42 : 0;
  const fur = legFur(st);
  kit.surface({ cols: 16, rows: 10, wrap: true, at: ellipsoid({ c: [x, 0.215 + oy, z], r: [0.105, 0.225, 0.11], e: [0.9, 1] }), color: (p) => fur([p[0], p[1] - oy, p[2]]) });
  kit.surface({ cols: 14, rows: 8, wrap: true, at: ellipsoid({ c: [x, 0.045 + oy, z + 0.03], r: [0.112, 0.05, 0.12] }), color: () => st.dark });
}

// monocle on the right eye: gold ring and a fine chain; the glass and the glint are separate meshes
function addMonocleMetal(kit, gold = [0.98, 0.74, 0.22]) {
  const n = new Vector3(...MONOCLE.n).normalize();
  const up = new Vector3(0, 1, 0);
  const e1 = Vector3.Cross(n, up).normalize();
  const e2 = Vector3.Cross(e1, n).normalize();
  const R = MONOCLE.radius;
  const tubeR = 0.0085;
  kit.surface({
    cols: 28,
    rows: 8,
    wrap: true,
    at: (u, v) => {
      const a = TAU * u;
      const b = TAU * v;
      const rr = R + tubeR * Math.cos(b);
      const out = tubeR * Math.sin(b);
      const ring = e1.scale(Math.cos(a) * rr).add(e2.scale(Math.sin(a) * rr)).add(n.scale(out));
      return [MONOCLE.c[0] + ring.x, MONOCLE.c[1] + ring.y, MONOCLE.c[2] + ring.z];
    },
    color: () => gold,
  });
  // chain from the bottom of the ring, sagging down the cheek into the scarf
  const start = e2.scale(-R).add(new Vector3(...MONOCLE.c));
  const path = [
    [start.x, start.y, start.z],
    [0.255, 0.74, 0.72],
    [0.26, 0.68, 0.68],
    [0.26, 0.62, 0.62],
    [0.26, 0.6, 0.56],
    [0.26, 0.58, 0.5],
  ];
  kit.surface({ cols: 6, rows: 20, wrap: true, at: tube(path, 0.0055), color: () => gold });
}

// glass disc in the ring plane and a four point star for the glint
function monocleFrame() {
  const n = new Vector3(...MONOCLE.n).normalize();
  const up = new Vector3(0, 1, 0);
  const e1 = Vector3.Cross(n, up).normalize();
  const e2 = Vector3.Cross(e1, n).normalize();
  return { n, e1, e2 };
}

function discMesh(scene, name, material, { radius, color }) {
  const { e1, e2 } = monocleFrame();
  const positions = [MONOCLE.c[0], MONOCLE.c[1], MONOCLE.c[2]];
  const colors = [...color];
  const segments = 24;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * TAU;
    const p = e1.scale(Math.cos(a) * radius).add(e2.scale(Math.sin(a) * radius));
    positions.push(MONOCLE.c[0] + p.x, MONOCLE.c[1] + p.y, MONOCLE.c[2] + p.z);
    colors.push(color[0], color[1], color[2], color[3] * 0.7);
  }
  const indices = [];
  for (let i = 0; i < segments; i += 1) indices.push(0, 1 + i, 1 + ((i + 1) % segments));
  return finishFlat(scene, name, material, positions, indices, colors);
}

function starMesh(scene, name, material) {
  const { n, e1, e2 } = monocleFrame();
  const centre = new Vector3(...MONOCLE.c).add(n.scale(0.006));
  const positions = [centre.x, centre.y, centre.z];
  const colors = [3.4, 3.0, 2.3, 1];
  const points = 8;
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * TAU + 0.35;
    const rr = i % 2 ? 0.014 : 0.062;
    const p = e1.scale(Math.cos(a) * rr).add(e2.scale(Math.sin(a) * rr)).add(centre);
    positions.push(p.x, p.y, p.z);
    colors.push(3.4, 3.0, 2.3, 0);
  }
  const indices = [];
  for (let i = 0; i < points; i += 1) indices.push(0, 1 + i, 1 + ((i + 1) % points));
  return finishFlat(scene, name, material, positions, indices, colors);
}

function finishFlat(scene, name, material, positions, indices, colors) {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = new Float32Array(positions);
  data.indices = new Uint16Array(indices);
  const normals = [];
  VertexData.ComputeNormals(data.positions, data.indices, normals);
  data.normals = new Float32Array(normals);
  data.colors = new Float32Array(colors);
  data.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = true;
  mesh.useVertexColors = true;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

// the deerstalker is authored at 1.2 times the old size, shrunk by HAT_K to a small cap on the crown and tipped a few degrees, so every hat surface goes through hatSurface
const HAT = { c: [0, 0.925, 0.78], rx: 0.276, rz: 0.312, h: 0.198 };
const HAT_K = 0.56;
const hatTurn = rotator([-0.06, 0, 0.07]);
const hatSurface = (kit, opts) =>
  kit.surface({
    ...opts,
    at: (u, v) => {
      const p = opts.at(u, v);
      const q = hatTurn([p[0] - HAT.c[0], p[1] - HAT.c[1], p[2] - HAT.c[2]]);
      return [HAT.c[0] + q[0] * HAT_K, HAT.c[1] + q[1] * HAT_K, HAT.c[2] + q[2] * HAT_K];
    },
  });


// tweed check, 256 px tile: broad dark bands, fine overchecks and a woven speckle
export function tweedTexture(scene, name = 'tweed') {
  const size = 256;
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext();
  ctx.fillStyle = 'rgb(168,138,92)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(96,66,42,0.55)';
  for (const band of [0, 128]) {
    ctx.fillRect(band, 0, 40, size);
    ctx.fillRect(0, band, size, 40);
  }
  ctx.fillStyle = 'rgba(236,208,150,0.5)';
  for (const line of [84, 212]) {
    ctx.fillRect(line, 0, 6, size);
    ctx.fillRect(0, line, size, 6);
  }
  ctx.fillStyle = 'rgba(168,64,44,0.5)';
  for (const line of [20, 148]) {
    ctx.fillRect(line, 0, 3, size);
    ctx.fillRect(0, line, size, 3);
  }
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(60,40,24,0.18)' : 'rgba(255,236,190,0.16)';
    ctx.fillRect(rand() * size, rand() * size, 3, 2);
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  texture.update(true);
  return texture;
}

// deerstalker: pillow crown, a short peak front and back, ear flaps tied up on top; the band and bow join the head mesh
function addDeerstalker(kit) {
  const uv = worldUv(0.42);
  const tint = (k) => () => [k, k * 0.98, k * 0.95];
  const crown = (t) => [Math.cos(t * PI / 2) ** 0.55, HAT.h * Math.sin(t * PI / 2) ** 0.85];
  hatSurface(kit, {
    cols: 36,
    rows: 12,
    wrap: true,
    hint: [0, 1, 0],
    at: (u, v) => {
      const [r, y] = crown(v);
      return [HAT.c[0] + Math.cos(TAU * u) * r * HAT.rx, HAT.c[1] + y, HAT.c[2] + Math.sin(TAU * u) * r * HAT.rz];
    },
    color: (p, n) => tint(0.78 + 0.28 * smooth(-0.2, 0.9, n[1]))(),
    uv,
  });
  const part = (opts, k) => hatSurface(kit, { cols: 20, rows: 10, wrap: true, at: ellipsoid(opts), color: tint(k), uv });
  // peaks
  part({ c: [0, HAT.c[1] + 0.008, HAT.c[2] + HAT.rz + 0.09], r: [0.18, 0.014, 0.114], e: [0.7, 0.65], rot: [0.16, 0, 0] }, 0.85);
  part({ c: [0, HAT.c[1] + 0.028, HAT.c[2] - HAT.rz - 0.054], r: [0.144, 0.014, 0.078], e: [0.7, 0.65], rot: [-0.14, 0, 0] }, 0.8);
  // ear flaps folded up the sides of the crown and tied on top
  for (const s of [-1, 1]) part({ c: [s * 0.144, HAT.c[1] + 0.138, HAT.c[2] + 0.006], r: [0.031, 0.067, 0.216], e: [0.85, 0.7], rot: [0, 0, -s * 0.78] }, 0.9);
}

// leather band round the crown base and the bow that ties the flaps, plain vertex colour
function addHatTrim(kit) {
  const leather = [0.3, 0.19, 0.12];
  hatSurface(kit, {
    cols: 36,
    rows: 2,
    wrap: true,
    hint: [0, 1, 0],
    at: (u, v) => [HAT.c[0] + Math.cos(TAU * u) * HAT.rx * 1.012, HAT.c[1] + 0.005 + v * 0.043, HAT.c[2] + Math.sin(TAU * u) * HAT.rz * 1.012],
    color: () => leather,
  });
  const top = HAT.c[1] + HAT.h * 0.97;
  hatSurface(kit, { cols: 10, rows: 6, wrap: true, at: ellipsoid({ c: [0, top + 0.008, HAT.c[2]], r: [0.026, 0.024, 0.026] }), color: () => leather });
  for (const s of [-1, 1]) {
    hatSurface(kit, { cols: 10, rows: 6, wrap: true, at: ellipsoid({ c: [s * 0.058, top + 0.014, HAT.c[2]], r: [0.041, 0.017, 0.024], rot: [0, 0, s * 0.35] }), color: () => leather });
    hatSurface(kit, { cols: 8, rows: 6, wrap: true, at: ellipsoid({ c: [s * 0.036, top - 0.012, HAT.c[2] - 0.036], r: [0.014, 0.036, 0.012], rot: [0.2, 0, s * 0.3] }), color: () => leather });
  }
}

// flat cap with a short peak, for the dock workers
function addFlatCap(kit, color) {
  const body = [color[0], color[1], color[2]];
  kit.surface({ cols: 24, rows: 12, wrap: true, at: ellipsoid({ c: [0, 0.915, 0.78], r: [0.22, 0.08, 0.255], e: [0.8, 0.9] }), color: (p, n) => scaleColor(body, 0.85 + 0.2 * n[1]) });
  kit.surface({ cols: 16, rows: 8, wrap: true, at: ellipsoid({ c: [0, 0.905, 1.04], r: [0.14, 0.012, 0.08], e: [0.7, 0.65], rot: [0.18, 0, 0] }), color: () => scaleColor(body, 0.7) });
}

// flat cap for sharlock: a low dome and a short peak sized like the deerstalker crown, through hatSurface
function addSharlockCap(kit, color) {
  const shade = (k) => () => scaleColor(color, k);
  hatSurface(kit, {
    cols: 28,
    rows: 12,
    wrap: true,
    at: ellipsoid({ c: [HAT.c[0], HAT.c[1] + 0.02, HAT.c[2]], r: [0.29, 0.11, 0.32], e: [0.8, 0.9] }),
    color: (p, n) => scaleColor(color, 0.85 + 0.2 * n[1]),
  });
  hatSurface(kit, {
    cols: 16,
    rows: 8,
    wrap: true,
    at: ellipsoid({ c: [HAT.c[0], HAT.c[1] + 0.005, HAT.c[2] + HAT.rz + 0.07], r: [0.2, 0.016, 0.12], e: [0.7, 0.65], rot: [0.2, 0, 0] }),
    color: shade(0.7),
  });
}

// magnifying glass on a leather strap over the back, the lens rests on the right flank
const LENS = { x: -0.385, y: 0.5, z: 0.05, r: 0.075 };
function addMagnifier(kit) {
  const brass = [0.72, 0.5, 0.2];
  const leather = [0.3, 0.19, 0.12];
  const ring = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * TAU;
    return [LENS.x, LENS.y + LENS.r * Math.cos(a), LENS.z + LENS.r * Math.sin(a)];
  });
  kit.surface({ cols: 6, rows: 24, wrap: true, at: tube(ring, 0.01), color: () => brass });
  kit.surface({ cols: 16, rows: 8, wrap: true, at: ellipsoid({ c: [LENS.x + 0.002, LENS.y, LENS.z], r: [0.004, LENS.r, LENS.r], axis: 'x' }), color: () => [0.75, 0.88, 0.95] });
  kit.surface({ cols: 6, rows: 8, wrap: true, at: tube([[LENS.x, LENS.y - LENS.r, LENS.z], [LENS.x, LENS.y - LENS.r - 0.13, LENS.z - 0.045]], 0.014), color: () => leather });
  // strap: from the top of the lens up and over the back and down the far flank
  const strap = [[LENS.x, LENS.y + LENS.r, LENS.z]];
  for (let i = 0; i <= 14; i += 1) {
    const a = (i / 14) * PI * 1.15;
    strap.push([-0.376 * Math.cos(a), 0.6 + 0.397 * Math.sin(a), LENS.z]);
  }
  kit.surface({ cols: 6, rows: 30, wrap: true, at: tube(strap, 0.009), color: () => leather });
}

function furMaterial(scene, name, toon) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.maxSimultaneousLights = 3;
  toon(m);
  return m;
}

function unlit(scene, name, { add = false } = {}) {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.Black();
  m.backFaceCulling = false;
  if (add) m.alphaMode = Constants.ALPHA_ADD;
  return m;
}

// shared walk cycle: diagonal pairs swing together, the planted foot moves back at ground speed
const LEG = 0.42;
const SWING = 0.6;
const strideRate = (speed, size) => (speed > 0.1 ? Math.max(6, (speed / (LEG * size * SWING)) * 0.95) : 0);
// leg angle (positive swings the foot forward) and the hip lift, which also keeps the toes from digging in while the leg is angled
function legPose(phase, pair, amp, motion) {
  const angle = SWING * amp * Math.sin(phase + pair * PI);
  return { angle, lift: 0.07 * amp * Math.max(0, Math.cos(phase + pair * PI)) ** 1.5 * motion + 0.075 * Math.abs(Math.sin(angle)) };
}
function bodyPose(phase, amp, motion) {
  return { y: 0.03 * amp * Math.cos(phase * 2) * motion, x: Math.sin(phase) * 0.028 * amp * motion, roll: Math.sin(phase) * 0.05 * amp * motion, pitch: Math.sin(phase * 2 + 0.6) * 0.016 * amp * motion };
}

// static capybara for the dock workers: one merged vertex coloured mesh in the neutral pose
export function createCapybaraStatic(scene, { style = furStyles.dockA, cap = [0.2, 0.28, 0.5], sack = null, name = 'capybara-worker', toon = () => {} } = {}) {
  const kit = new Kit();
  addBody(kit, style);
  addHead(kit, style);
  for (const e of EARS) addEar(kit, style, e.side, e.p);
  for (const h of HIPS) addLeg(kit, style, h);
  addFlatCap(kit, cap);
  if (sack) kit.surface({ cols: 18, rows: 10, wrap: true, at: ellipsoid({ c: [0, 1.0, -0.2], r: [0.26, 0.17, 0.27], e: [0.8, 0.8] }), color: (p, n) => scaleColor(sack, 0.85 + 0.2 * n[1]) });
  const material = furMaterial(scene, `${name}-mat`, toon);
  const mesh = kit.toMesh(scene, name, material);
  mesh.triangleCount = kit.triangles;
  return mesh;
}

// a walking crowd with the same cycle as the rig, built from thin instances so it stays a handful of draws:
// one body mesh per variant and one shared leg mesh whose instances are the four hips of every worker
// variants: [{ style, cap, sack }], pose with setPose(i, { x, z, yaw, speed }) then call update(dt)
export function createCapybaraCrowd(scene, { variants, count, size = 1.05, toon = () => {}, reduced = () => false } = {}) {
  const material = furMaterial(scene, 'crowd-fur', toon);
  const groups = variants.map((v, index) => {
    const kit = new Kit();
    addBody(kit, v.style);
    addHead(kit, v.style);
    for (const e of EARS) addEar(kit, v.style, e.side, e.p);
    addFlatCap(kit, v.cap);
    if (v.sack) kit.surface({ cols: 18, rows: 10, wrap: true, at: ellipsoid({ c: [0, 1.0, -0.2], r: [0.26, 0.17, 0.27], e: [0.8, 0.8] }), color: (p, n) => scaleColor(v.sack, 0.85 + 0.2 * n[1]) });
    const mesh = kit.toMesh(scene, `crowd-body-${index}`, material);
    mesh.alwaysSelectAsActiveMesh = true;
    return { mesh, ids: [], tris: kit.triangles };
  });
  const workers = Array.from({ length: count }, (_, i) => {
    const group = groups[i % groups.length];
    group.ids.push(i);
    return { group, slot: group.ids.length - 1, phase: Math.random() * TAU, amp: 0, x: 0, z: 0, yaw: 0, speed: 0, fresh: true };
  });
  for (const g of groups) {
    g.matrices = new Float32Array(g.ids.length * 16);
    g.mesh.thinInstanceSetBuffer('matrix', g.matrices, 16, false);
  }
  const legKit = new Kit();
  addLeg(legKit, furStyles.dockA, HIPS[0], true);
  const legs = legKit.toMesh(scene, 'crowd-legs', material);
  legs.alwaysSelectAsActiveMesh = true;
  const legMatrices = new Float32Array(count * 4 * 16);
  const legTints = new Float32Array(count * 4 * 4);
  const ref = furStyles.dockA.dark;
  workers.forEach((w, i) => {
    const d = variants[i % variants.length].style.dark;
    for (let k = 0; k < 4; k += 1) legTints.set([d[0] / ref[0], d[1] / ref[1], d[2] / ref[2], 1], (i * 4 + k) * 4);
  });
  legs.thinInstanceSetBuffer('matrix', legMatrices, 16, false);
  legs.thinInstanceSetBuffer('color', legTints, 4, true);
  let time = 0;

  return {
    meshes: [...groups.map((g) => g.mesh), legs],
    setPose(i, pose) {
      Object.assign(workers[i], pose);
    },
    update(dt) {
      const step = Math.min(dt, 0.05);
      time += step;
      const motion = reduced() ? 0.55 : 1;
      workers.forEach((w, i) => {
        w.amp += (clamp(w.speed / 1.6) - w.amp) * (1 - Math.exp(-step * 8));
        w.phase += strideRate(w.speed, size) * step;
        // ease the heading round so corners never snap
        if (w.shownYaw === undefined) w.shownYaw = w.yaw;
        else {
          let diff = w.yaw - w.shownYaw;
          while (diff > PI) diff -= TAU;
          while (diff < -PI) diff += TAU;
          w.shownYaw += diff * (1 - Math.exp(-step * 10));
        }
        const bp = bodyPose(w.phase, w.amp, motion);
        const breathe = Math.sin(time * 2 + i) * 0.012 * (1 - w.amp) * (reduced() ? 0.3 : 1);
        const world = Matrix.Compose(new Vector3(size, size * (1 + breathe), size), Quaternion.RotationYawPitchRoll(w.shownYaw, 0, 0), new Vector3(w.x, 0, w.z));
        Matrix.RotationYawPitchRoll(0, bp.pitch, bp.roll).multiply(Matrix.Translation(bp.x, bp.y, 0)).multiply(world).copyToArray(w.group.matrices, w.slot * 16);
        HIPS.forEach((h, k) => {
          const pose = legPose(w.phase, h.pair, w.amp, motion);
          Matrix.RotationX(-pose.angle).multiply(Matrix.Translation(h.p[0], h.p[1] + pose.lift, h.p[2])).multiply(world).copyToArray(legMatrices, (i * 4 + k) * 16);
        });
      });
      for (const g of groups) g.mesh.thinInstanceBufferUpdated('matrix');
      legs.thinInstanceBufferUpdated('matrix');
    },
    dispose() {
      for (const m of [...groups.map((g) => g.mesh), legs]) m.dispose();
      material.dispose();
    },
  };
}

// the animated rig: torso with a knitted scarf, head, ears, four legs, plus a tweed hat, glass and glint on the detective
// options: size (uniform scale), hat ('deerstalker' | 'cap' | 'detective-cap' | null), monocle, toon(material), reduced() -> boolean
// wardrobe options, null keeps the stock look: scarfColor, tweedColor (multiplies the tweed), monocleColor, accessory ('magnifier'), capColor for the caps
export function createCapybaraRig(scene, { name = 'sharlock', style = furStyles.sharlock, size = 1.35, hat = 'deerstalker', monocle = true, capColor = [0.2, 0.28, 0.5], scarfColor = null, tweedColor = null, monocleColor = null, accessory = null, toon = () => {}, reduced = () => false, idleSeed = 7 } = {}) {
  const holder = new TransformNode(`${name}-rig`, scene);
  holder.scaling.setAll(size);
  const materials = [];
  const meshes = [];
  const casters = [];
  const pivot = (label, parent, p, parentP = [0, 0, 0]) => {
    const node = new TransformNode(`${name}-${label}`, scene);
    node.parent = parent;
    node.position.set(p[0] - parentP[0], p[1] - parentP[1], p[2] - parentP[2]);
    return node;
  };
  const hang = (mesh, node, p, caster = true) => {
    mesh.parent = node;
    mesh.position.set(-p[0], -p[1], -p[2]);
    meshes.push(mesh);
    if (caster) casters.push(mesh);
    return mesh;
  };
  const scarfStyle = scarfColor ? { ...style, scarf: scarfColor } : style;
  const furMat = furMaterial(scene, `${name}-fur`, toon);
  materials.push(furMat);
  let triangles = 0;
  const track = (kit) => {
    triangles += kit.triangles;
    return kit;
  };

  const torsoP = [0, SH_BODY.c[1], SH_BODY.c[2]];
  const torso = pivot('torso', holder, torsoP);
  const torsoKit = new Kit();
  addBody(torsoKit, style, SH_BODY);
  torsoKit.surface({ cols: 24, rows: 10, wrap: true, at: neckAt, color: bodyFur(style) });
  addScarfRing(torsoKit, scarfStyle);
  if (accessory === 'magnifier') addMagnifier(torsoKit);
  hang(track(torsoKit).toMesh(scene, `${name}-torso`, furMat), torso, torsoP);

  // rump bulge, hidden inside the barrel until he sits
  const rumpP = SH_RUMP.c;
  const rump = pivot('rump', torso, rumpP, torsoP);
  const rumpKit = new Kit();
  rumpKit.surface({ cols: 20, rows: 12, wrap: true, at: ellipsoid(SH_RUMP), color: bodyFur(style) });
  hang(track(rumpKit).toMesh(scene, `${name}-rump`, furMat), rump, rumpP);
  rump.scaling.x = 0.8;

  // the scarf ends hang from the knot on their own pivot so they can sway
  const scarf = pivot('scarf', torso, KNOT_P, torsoP);
  const scarfKit = new Kit();
  addScarfEnds(scarfKit, scarfStyle, SH_BODY);
  hang(track(scarfKit).toMesh(scene, `${name}-scarf`, furMat), scarf, KNOT_P);

  const head = pivot('head', torso, NECK.map((v, i) => v + SH_HEAD_SHIFT[i]), torsoP);
  const headKit = new Kit();
  addHead(headKit, style, true, SH_HEAD, SH_MUZZLE, SH_NOSE.z);
  if (monocle) addMonocleMetal(headKit, monocleColor ?? undefined);
  if (hat === 'deerstalker') addHatTrim(headKit);
  hang(track(headKit).toMesh(scene, `${name}-head`, furMat), head, NECK);

  let tweed = null;
  if (hat === 'deerstalker') {
    tweed = tweedTexture(scene, `${name}-tweed`);
    const hatMat = furMaterial(scene, `${name}-hat`, toon);
    materials.push(hatMat);
    hatMat.diffuseTexture = tweed;
    if (tweedColor) hatMat.diffuseColor = new Color3(tweedColor[0], tweedColor[1], tweedColor[2]);
    const hatKit = new Kit();
    addDeerstalker(hatKit);
    hang(track(hatKit).toMesh(scene, `${name}-hat`, hatMat), head, NECK);
  } else if (hat === 'cap') {
    const capKit = new Kit();
    addFlatCap(capKit, capColor);
    hang(track(capKit).toMesh(scene, `${name}-cap`, furMat), head, NECK);
  } else if (hat === 'detective-cap') {
    const capKit = new Kit();
    addSharlockCap(capKit, capColor);
    hang(track(capKit).toMesh(scene, `${name}-cap`, furMat), head, NECK);
  }

  const ears = SH_EARS.map((e) => {
    const node = pivot(`ear-${e.id}`, head, e.p, NECK);
    const kit = new Kit();
    addEar(kit, style, e.side, e.p);
    hang(track(kit).toMesh(scene, `${name}-ear-${e.id}`, furMat), node, e.p);
    return { node, side: e.side };
  });

  const legs = SH_HIPS.map((h) => {
    const node = pivot(`leg-${h.id}`, holder, h.p);
    const kit = new Kit();
    addLeg(kit, style, h);
    hang(track(kit).toMesh(scene, `${name}-leg-${h.id}`, furMat), node, h.p);
    return { node, pair: h.pair, baseX: h.p[0], baseY: h.p[1], baseZ: h.p[2] };
  });

  // the eyes share one pivot so a blink squashes both in y
  const eyes = pivot('eyes', head, EYE_P, NECK);
  const eyeKit = new Kit();
  for (const s of [-1, 1]) addEye(eyeKit, s);
  hang(track(eyeKit).toMesh(scene, `${name}-eyes`, furMat), eyes, EYE_P, false);
  const nose = pivot('nose', head, NOSE_P, NECK);
  const noseKit = new Kit();
  for (const s of [-1, 1]) addNostril(noseKit, style, s, SH_NOSE);
  hang(track(noseKit).toMesh(scene, `${name}-nose`, furMat), nose, NOSE_P);
  const mouth = pivot('mouth', head, MOUTH_P, NECK);
  const mouthKit = new Kit();
  addYawnMouth(mouthKit);
  hang(track(mouthKit).toMesh(scene, `${name}-mouth`, furMat), mouth, MOUTH_P, false);
  mouth.scaling.setAll(0.001);

  // glass and glint ride on the head, unlit, never cast shadows
  let glint = null;
  if (monocle) {
    const glassMat = unlit(scene, `${name}-glass`);
    const glintMat = unlit(scene, `${name}-glint`, { add: true });
    materials.push(glassMat, glintMat);
    const glass = discMesh(scene, `${name}-glass`, glassMat, { radius: MONOCLE.radius - 0.006, color: [0.82, 0.94, 1.0, 0.2] });
    glass.alphaIndex = 60;
    hang(glass, head, NECK, false);
    const gp = MONOCLE.c;
    const glintNode = pivot('glint', head, gp, NECK);
    const star = starMesh(scene, `${name}-glint`, glintMat);
    star.alphaIndex = 61;
    hang(star, glintNode, gp, false);
    glintNode.scaling.setAll(0.001);
    glint = glintNode;
    triangles += 40;
  }

  // animation state
  let time = 0;
  let phase = 0;
  let walkAmp = 0;
  let headYaw = 0;
  let tilt = 0;
  const idleMachine = createIdle({ seed: idleSeed });
  let nextFlick = 2 + Math.random() * 2;
  let flickAge = 9;
  let flickSide = 0;
  let nextGlint = 2.5 + Math.random() * 2;
  let glintAge = 9;
  let smoothLean = 0;
  let nextBlink = 2 + Math.random() * 2;
  let blinkAge = 9;
  let blinksLeft = 0;

  // speed in m/s of the player, top the full speed; opts.turn is the heading rate in rad/s, opts.lead the angle still to turn
  // opts.active is true while the player gives movement input, opts.look the yaw to a nearby door (relative to the body) or null, opts.jump the jump pose
  function update(dt, speed = 0, top = 4.4, opts = {}) {
    const step = Math.min(dt, 0.05);
    time += step;
    const calm = reduced();
    const motion = calm ? 0.55 : 1;
    const target = clamp(speed / Math.max(top, 0.01));
    walkAmp += (target - walkAmp) * (1 - Math.exp(-step * 12));
    // stride rate keeps the planted foot moving back at ground speed
    phase += strideRate(speed, size) * step;

    for (const leg of legs) {
      const pose = legPose(phase, leg.pair, walkAmp, motion);
      leg.node.rotation.x = -pose.angle;
      leg.node.position.y = leg.baseY + pose.lift;
    }

    // breathing, bob, waddle and the lean into a turn
    const breath = Math.sin(time * 2.1) * (calm ? 0.004 : 0.013) * (1 - walkAmp);
    const lean = clamp(-(opts.turn ?? 0) * 0.012, -0.09, 0.09);
    smoothLean += (lean - smoothLean) * (1 - Math.exp(-step * 8));
    torso.scaling.set(1 - breath * 0.4, 1 + breath, 1);
    const body = bodyPose(phase, walkAmp, motion);
    torso.position.y = torsoP[1] + body.y;
    torso.position.x = body.x;
    torso.rotation.z = body.roll + smoothLean;
    torso.rotation.x = body.pitch;
    // the scarf ends lag the body: they trail back with speed and swing outward with the stride
    const sway = calm ? 0.4 : 1;
    scarf.rotation.x = (0.14 * walkAmp + Math.sin(phase * 2 + 0.4) * 0.05 * walkAmp + Math.sin(time * 1.7) * 0.012) * sway;
    scarf.rotation.z = -(0.03 + 0.05 * (0.5 + 0.5 * Math.sin(phase + 0.5)) * walkAmp + 0.012 * Math.sin(time * 1.3)) * sway + Math.min(0, -smoothLean * 0.8) * sway;

    // idle extras: look at a door, head turns, sit and yawn, ear wiggles, sniffs, ear flicks and the monocle glint
    const idle = 1 - walkAmp;
    const still = !(opts.active ?? speed > 0.2);
    const ip = idleMachine.step(step, { active: !still, calm, look: opts.look ?? null });
    const stillness = still ? idle : 0;
    const aim = ip.look ?? ip.turn;
    const lead = clamp((opts.lead ?? 0) * 0.45, -0.5, 0.5) * walkAmp;
    headYaw += (aim * stillness + lead - headYaw) * (1 - Math.exp(-step * 5));
    tilt += (ip.tilt * stillness - tilt) * (1 - Math.exp(-step * 4));
    const air = opts.jump ?? null;
    // jumping or landing stands him up at once
    const sit = ip.sit * (air?.active ? 0 : 1);
    const yawn = ip.yawn * (still ? 1 : 0);
    const sniff = ip.sniff * (calm ? 0.5 : 1);
    head.rotation.y = headYaw;
    head.rotation.x = Math.sin(phase * 2 + 1.1) * 0.05 * walkAmp * motion + Math.sin(time * 1.3) * 0.01 * idle - (calm ? 0 : yawn * 0.5) + sniff * 0.05;
    head.rotation.z = -torso.rotation.z * 0.5 + tilt;
    nose.scaling.set(1 + sniff * 0.12, 1 + sniff * 0.18, 1 + sniff * 0.1);
    nose.position.z = NOSE_P[2] - NECK[2] + sniff * 0.006;
    mouth.scaling.setAll(calm ? 0.001 : Math.max(0.001, yawn));

    // sitting: the rump drops, the hind legs fold forward and the torso pitches up (visual only, the capsule is untouched)
    torso.position.y -= sit * 0.08;
    torso.rotation.x -= sit * 0.72;
    head.rotation.x += sit * 0.6;
    // the rump stays level as a wide flat base on the ground while the torso pitches up
    rump.scaling.set(0.8 + 0.2 * sit, 1 - 0.12 * sit, 1);
    rump.rotation.x = sit * 0.72;
    for (const leg of legs) {
      if (leg.baseZ >= 0) {
        // front legs tuck forward and shorten under the raised chest
        leg.node.scaling.y = 1 - sit * 0.2;
        leg.node.rotation.x -= sit * 0.2;
        leg.node.position.y -= sit * 0.09;
        continue;
      }
      leg.node.rotation.x -= sit * 1.35;
      leg.node.position.y -= sit * 0.3;
      leg.node.position.x = leg.baseX + Math.sign(leg.baseX) * sit * 0.05;
    }

    // jump: crouch, stretch on the way up, legs tucked in the air, squash on landing; the hop lifts the rig a little
    // the rig is scaled about its feet, so the body squashes into the ground
    const squash = air ? air.squash + air.crouch * 0.8 : 0;
    const stretch = air ? air.stretch * 0.5 + (air.hop ?? 0) * 0.2 : 0;
    const sy = 1 + stretch * 0.12 - squash * 0.14;
    const sxz = 1 / Math.sqrt(sy);
    holder.scaling.set(size * sxz, size * sy, size * sxz);
    holder.position.y = (air?.hop ?? 0) * HOP_HEIGHT;
    const tuck = air ? Math.max(air.tuck, (air.hop ?? 0) * 0.5) : 0;
    if (tuck > 0) {
      for (const leg of legs) {
        const front = leg.baseZ >= 0;
        leg.node.rotation.x += (front ? 0.55 : -0.5) * tuck;
        leg.node.position.y += 0.05 * tuck;
      }
    }

    nextFlick -= step;
    if (nextFlick <= 0) {
      flickAge = 0;
      flickSide = Math.random() < 0.5 ? 0 : 1;
      nextFlick = (calm ? 6 : 2.5) + Math.random() * 3.5;
    }
    flickAge += step;
    const env = flickAge < 0.3 ? Math.sin((flickAge / 0.3) * PI) : 0;
    ears.forEach((ear, i) => {
      const k = i === flickSide ? 1 : 0.15;
      const mag = env * k * (calm ? 0.3 : 1);
      const wig = ip.wiggleSide === 2 || ip.wiggleSide === i ? ip.wiggle * (calm ? 0.3 : 1) * stillness : 0;
      ear.node.rotation.z = -ear.side * (mag * 0.55 + wig * 0.4);
      ear.node.rotation.x = -mag * 0.25 - Math.abs(wig) * 0.1;
    });

    // blinks every three to six seconds, sometimes twice in a row, about 120 ms each
    nextBlink -= step;
    if (nextBlink <= 0) {
      blinkAge = 0;
      if (blinksLeft > 0) {
        blinksLeft -= 1;
        nextBlink = 3 + Math.random() * 3;
      } else if (Math.random() < 0.25) {
        blinksLeft = 1;
        nextBlink = 0.22;
      } else nextBlink = 3 + Math.random() * 3;
    }
    blinkAge += step;
    const blinkY = blinkAge < 0.12 ? 1 - 0.92 * Math.sin((blinkAge / 0.12) * PI) : 1;
    eyes.scaling.y = Math.min(blinkY, 1 - 0.9 * yawn);

    if (glint) {
      nextGlint -= step;
      if (nextGlint <= 0 && !calm) {
        glintAge = 0;
        nextGlint = 4 + Math.random() * 3;
      }
      glintAge += step;
      const g = calm ? 0.4 : glintAge < 0.6 ? Math.sin((glintAge / 0.6) * PI) : 0;
      glint.scaling.setAll(Math.max(0.001, g));
    }
  }

  return {
    node: holder,
    meshes,
    casters,
    update,
    triangles: () => triangles,
    drawCalls: () => meshes.length,
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of materials) m.dispose();
      tweed?.dispose();
      holder.dispose();
    },
  };
}
