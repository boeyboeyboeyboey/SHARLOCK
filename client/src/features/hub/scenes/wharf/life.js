import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Batch } from '../shared/geometry.js';
import { makeSmoke, puffTexture } from '../shared/particles.js';
import { rng } from '../shared/random.js';
import { createCapybaraCrowd, furStyles } from '../shared/capybara.js';
import { applyToon, glowMaterial } from './toon.js';
import { rawMesh } from './shapes.js';

const TAU = Math.PI * 2;
const IRON = [0.2, 0.2, 0.26, 1];

// closed path with rounded corners, sampled by distance
function roundedLoop(points, radius) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i + n - 1) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r0 = Math.min(radius, d0 / 2);
    const r2 = Math.min(radius, d2 / 2);
    const a = [p1[0] + ((p0[0] - p1[0]) / d0) * r0, p1[1] + ((p0[1] - p1[1]) / d0) * r0];
    const c = [p1[0] + ((p2[0] - p1[0]) / d2) * r2, p1[1] + ((p2[1] - p1[1]) / d2) * r2];
    for (let s = 0; s <= 6; s += 1) {
      const t = s / 6;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * p1[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * p1[1] + t * t * c[1]]);
    }
  }
  const dist = [0];
  for (let i = 1; i <= out.length; i += 1) {
    const a = out[i - 1];
    const b = out[i % out.length];
    dist.push(dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
    const total = dist[dist.length - 1];
  return {
    total,
    // into is reused by the frame loop, so no object is created per worker per frame
    at(s, into = {}) {
      const d = ((s % total) + total) % total;
      let lo = 0;
      let hi = dist.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (dist[mid] <= d) lo = mid;
        else hi = mid;
      }
      const a = out[lo % out.length];
      const b = out[(lo + 1) % out.length];
      const k = (d - dist[lo]) / Math.max(1e-6, dist[hi] - dist[lo]);
      into.x = a[0] + (b[0] - a[0]) * k;
      into.z = a[1] + (b[1] - a[1]) * k;
      into.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      return into;
    },
  };
}

function hansom(scene, material) {
  const cab = new Batch({ worldUv: 4 });
  const body = [0.34, 0.14, 0.16, 1];
  const trim = [0.92, 0.74, 0.34, 1];
  cab.box({ c: [0, 1.15, -0.2], s: [1.4, 0.9, 1.9], color: body });
  cab.box({ c: [0, 1.75, -0.2], s: [1.3, 0.34, 1.7], color: [0.22, 0.16, 0.2, 1] });
  cab.box({ c: [0, 1.6, 0.76], s: [1.0, 0.7, 0.05], color: [0.95, 0.82, 0.55, 1] });
  cab.box({ c: [0, 2.5, -1.15], s: [0.5, 0.18, 0.5], color: [0.3, 0.2, 0.18, 1] });
  cab.box({ c: [0, 2.0, -1.1], s: [0.34, 0.9, 0.12], color: body });
  cab.box({ c: [0, 0.52, -0.2], s: [0.14, 0.14, 1.9], color: trim });
  cab.box({ c: [0, 1.62, -0.2], s: [1.46, 0.08, 1.96], color: trim });
  cab.box({ c: [0.62, 1.98, 0.7], s: [0.12, 0.16, 0.12], color: [1.3, 0.95, 0.5, 1] });
  cab.box({ c: [-0.62, 1.98, 0.7], s: [0.12, 0.16, 0.12], color: [1.3, 0.95, 0.5, 1] });
  // shafts and the horse
  cab.bar([0.5, 0.9, 0.6], [0.4, 0.95, 3.3], 0.08, { color: IRON });
  cab.bar([-0.5, 0.9, 0.6], [-0.4, 0.95, 3.3], 0.08, { color: IRON });
  const chestnut = [0.74, 0.42, 0.24, 1];
  cab.box({ c: [0, 1.2, 3.3], s: [0.78, 0.86, 1.7], color: chestnut });
  cab.box({ c: [0, 1.7, 4.3], s: [0.4, 0.86, 0.46], color: chestnut });
  cab.box({ c: [0, 2.0, 4.7], s: [0.34, 0.38, 0.6], color: [0.66, 0.36, 0.2, 1] });
  cab.box({ c: [0, 1.8, 3.9], s: [0.1, 0.55, 0.34], color: [0.2, 0.12, 0.1, 1] });
  cab.box({ c: [0, 1.4, 2.35], s: [0.14, 0.14, 0.7], color: [0.2, 0.12, 0.1, 1] });
  cab.box({ c: [0, 2.4, 4.45], s: [0.06, 0.34, 0.06], color: [0.9, 0.2, 0.2, 1] });
  for (const [x, z] of [[-0.24, 3.95], [0.24, 3.95], [-0.24, 2.75], [0.24, 2.75]]) cab.box({ c: [x, 0.42, z], s: [0.18, 0.85, 0.18], color: [0.62, 0.34, 0.2, 1] });
  const bodyMesh = cab.build(scene, 'hansom', material);
  // wheel: a twelve sided rim and eight spokes, axle along x
  const wheelBatch = new Batch({ worldUv: 4 });
  const rim = (i) => [0, Math.sin((i / 12) * TAU) * 0.78, Math.cos((i / 12) * TAU) * 0.78];
  for (let i = 0; i < 12; i += 1) wheelBatch.bar(rim(i), rim(i + 1), 0.12, { color: [0.9, 0.78, 0.5, 1] });
  for (let i = 0; i < 8; i += 1) wheelBatch.bar([0, 0, 0], rim(i * 1.5), 0.07, { color: [0.82, 0.62, 0.36, 1] });
  wheelBatch.box({ c: [0, 0, 0], s: [0.2, 0.2, 0.2], color: IRON });
  const wheel = wheelBatch.build(scene, 'cab-wheel', material);
  wheel.isVisible = false;
  return { bodyMesh, wheel };
}

export function buildLife({ scene, world, tier, reduced, chimneys, farStacks = [] }) {
  const rand = rng(31337);

  // dock workers: three variants, instanced, each walking its own loop at its own pace
  const toon = (m) => applyToon(m, { rimGain: 1.1 });
  const variants = [
    { style: furStyles.dockA, cap: [0.2, 0.28, 0.5] },
    { style: furStyles.dockB, cap: [0.55, 0.22, 0.18], sack: [0.78, 0.66, 0.46] },
    { style: furStyles.dockC, cap: [0.26, 0.4, 0.3] },
  ];
  const loops = [
    roundedLoop([[-22, 38], [30, 38], [30, 33], [-22, 33]], 1.5),
    roundedLoop([[-6.5, 24], [-6.5, -26], [6.5, -26], [6.5, 24]], 2),
    roundedLoop([[0.6, 49], [2.2, 49], [2.2, 74], [0.6, 74]], 0.5),
    roundedLoop([[12, 40], [18, 40], [18, 35], [12, 35]], 1),
    roundedLoop([[33, 32], [38.5, 32], [38.5, -36], [33, -36]], 1.5),
    roundedLoop([[-24, -36], [24, -36], [24, -41], [-24, -41]], 1.5),
    roundedLoop([[-8.5, -14], [-5.5, -14], [-5.5, -28], [-8.5, -28]], 0.8),
    roundedLoop([[-14, 40], [-6, 40], [-6, 44], [-14, 44]], 1),
  ];
  const workerCount = tier.workers;
  const crowd = createCapybaraCrowd(scene, { variants, count: workerCount, size: 1.05, toon, reduced });
  const workers = [];
  for (let i = 0; i < workerCount; i += 1) workers.push({ path: loops[i % loops.length], speed: 1.1 + rand() * 0.7, start: rand() * 60, dir: i % 3 === 0 ? -1 : 1, at: { x: 0, z: 0, yaw: 0 } });

  // hansom cab on a big loop around the block
  const cabParts = hansom(scene, world.materials.wash);
  const cabNode = new TransformNode('cab', scene);
  cabParts.bodyMesh.parent = cabNode;
  const wheels = [-1, 1].map((side) => {
    const w = cabParts.wheel.createInstance(`cab-wheel-${side}`);
    w.parent = cabNode;
    w.position.set(side * 0.82, 0.76, -0.25);
    w.isPickable = false;
    w.alwaysSelectAsActiveMesh = true;
    return w;
  });
  const cabLoop = roundedLoop([[6, 37], [6, -41], [37, -41], [37, 37]], 6);

  // gulls: one thin instanced mesh, banked circles at different heights
  const gullMaterial = glowMaterial(scene, 'gulls', { fog: false, backFaceCulling: false });
  const gull = rawMesh(scene, 'gull', [0, 0, 0.3, -1.1, 0.12, -0.1, -0.15, 0.02, -0.35, 0, 0, -0.4, 1.1, 0.12, -0.1, 0.15, 0.02, -0.35], [0, 1, 2, 0, 5, 4, 0, 2, 3, 0, 3, 5], null, gullMaterial);
  gull.alwaysSelectAsActiveMesh = true;
  const gullCount = tier.gulls;
  const gulls = Array.from({ length: gullCount }, (_, i) => ({ cx: 8 + (i % 3) * 24 - 24, cz: 84 + (i % 2) * 18, r: 10 + rand() * 18, h: 14 + rand() * 16, speed: (0.14 + rand() * 0.1) * (i % 2 ? 1 : -1), phase: rand() * TAU, flap: 4 + rand() * 2 }));
  const gullMatrices = new Float32Array(gullCount * 16);
  const gullColors = new Float32Array(gullCount * 4);
  for (let i = 0; i < gullCount; i += 1) gullColors.set([1.6, 1.45, 1.2, 1], i * 4);
  gull.thinInstanceSetBuffer('matrix', gullMatrices, 16, false);
  gull.thinInstanceSetBuffer('color', gullColors, 4, true);

  // dockside crane: static tower is in the batches, the jib and its load swing on a loop
  const jibRoot = new TransformNode('crane-jib', scene);
  jibRoot.position.set(31.7, 9.4, 41.7);
  const jibBatch = new Batch({ worldUv: 4 });
  jibBatch.bar([0, 0.25, -3.2], [0, 0.25, 10.8], 0.2, { color: IRON });
  jibBatch.bar([0, 1.3, -1], [0, 0.4, 10.6], 0.12, { color: IRON });
  for (let z = -1; z < 10; z += 2.2) jibBatch.bar([0, 0.3, z], [0, 1.25 - z * 0.08, z + 1.1], 0.08, { color: IRON });
  jibBatch.box({ c: [0, 0.2, -3.4], s: [1.3, 0.9, 1.4], color: [0.3, 0.3, 0.34, 1] });
  jibBatch.cylinder({ c: [0, 0.6, 10.8], r: 0.3, h: 0.2, seg: 8, color: IRON });
  jibBatch.bar([0, 1.3, -1], [0, 2.4, -1], 0.14, { color: IRON });
  const jib = jibBatch.build(scene, 'crane-jib', world.materials.wash);
  jib.parent = jibRoot;
  const loadNode = new TransformNode('crane-load', scene);
  loadNode.parent = jibRoot;
  const loadBatch = new Batch({ worldUv: 4 });
  loadBatch.bar([0, 0, 0], [0, -3.0, 0], 0.05, { color: [0.78, 0.7, 0.55, 1] });
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) loadBatch.bar([0, -3.0, 0], [x, -3.9, z], 0.035, { color: [0.78, 0.7, 0.55, 1] });
  loadBatch.box({ c: [0, -4.05, 0], s: [1.3, 0.14, 1.3], color: [0.7, 0.55, 0.4, 1] });
  loadBatch.box({ c: [-0.28, -4.6, -0.28], s: [0.7, 0.9, 0.7], color: [0.85, 0.65, 0.4, 1] });
  loadBatch.box({ c: [0.3, -4.6, 0.3], s: [0.7, 0.9, 0.7], color: [0.78, 0.58, 0.36, 1] });
  loadBatch.box({ c: [0.02, -5.5, 0.0], s: [0.7, 0.9, 0.7], color: [0.9, 0.7, 0.44, 1] });
  const load = loadBatch.build(scene, 'crane-load', world.materials.wash);
  load.parent = loadNode;

  // chimney smoke, one system fed by every stack
  const puff = puffTexture(scene, 515);
  const smoke = chimneys.length && tier.chimneySmoke
    ? makeSmoke(scene, { name: 'chimney-smoke', texture: puff, points: chimneys, rate: tier.chimneySmoke, capacity: 260, color1: new Color4(0.95, 0.72, 0.62, 0.34), color2: new Color4(0.85, 0.62, 0.7, 0.26), life: [4, 7], size: [0.9, 1.5], grow: 5, power: [0.6, 1.2], wind: [0.55, 0.45, 0.2] })
    : null;
  // a few slow plumes over the backdrop, desktop only
  const farSmoke = farStacks.length && tier.backdropSmoke
    ? makeSmoke(scene, { name: 'backdrop-smoke', texture: puff, points: farStacks, rate: tier.backdropSmoke, capacity: 160, color1: new Color4(0.9, 0.7, 0.66, 0.3), color2: new Color4(0.8, 0.62, 0.72, 0.22), life: [6, 10], size: [1.6, 2.6], grow: 6, power: [0.7, 1.3], wind: [0.55, 0.45, 0.2] })
    : null;

  let time = 0;
  // reused every frame so the loop below allocates nothing
  const ahead = { x: 0, z: 0, yaw: 0 };
  const cp = { x: 0, z: 0, yaw: 0 };
  const pose = { x: 0, z: 0, yaw: 0, speed: 0 };
  const gullScale = new Vector3();
  const gullTurn = new Quaternion();
  const gullAt = new Vector3();
  const gullMatrix = new Matrix();
  const update = (dt) => {
    if (!reduced()) time += dt;
    if (smoke) smoke.updateSpeed = reduced() ? 0 : 0.016;
    if (farSmoke) farSmoke.updateSpeed = reduced() ? 0 : 0.016;
    // workers face the way they walk: heading from a short look ahead along the loop
    workers.forEach((w, i) => {
      const s = w.start * 1.2 + time * w.speed * w.dir;
      const p = w.path.at(s, w.at);
      w.path.at(s + w.dir * 0.5, ahead);
      pose.x = p.x;
      pose.z = p.z;
      pose.yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      pose.speed = reduced() ? 0 : w.speed;
      crowd.setPose(i, pose);
    });
    crowd.update(dt);
    cabLoop.at(time * 5.2 + 40, cp);
    cabNode.position.set(cp.x, Math.abs(Math.sin(time * 9)) * 0.03, cp.z);
    cabNode.rotation.y = cp.yaw;
    for (const wh of wheels) wh.rotation.x = time * 5.2 / 0.74;
    // crane: swing between over the water and over the stacks, rising as it heads out
    const phase = Math.sin((time * TAU) / 22);
    jibRoot.rotation.y = 0.95 + 1.25 * phase;
    loadNode.position.set(0, -0.6 + (1 - (phase * 0.5 + 0.5)) * 3.2, 10.5);
    loadNode.rotation.z = Math.sin(time * 1.1) * 0.03;
    gulls.forEach((g, i) => {
      const a = g.phase + time * g.speed;
      const x = g.cx + Math.cos(a) * g.r;
      const z = g.cz + Math.sin(a) * g.r * 0.6;
      const heading = Math.atan2(-Math.sin(a) * Math.sign(g.speed), Math.cos(a) * 0.6 * Math.sign(g.speed));
      const flap = reduced() ? 0.9 : 0.75 + 0.35 * Math.sin(time * g.flap + i);
      gullScale.set(flap * 1.1, 1, 1.1);
      Quaternion.RotationYawPitchRollToRef(heading, 0, -0.35 * Math.sign(g.speed), gullTurn);
      gullAt.set(x, g.h + Math.sin(time * 0.4 + i) * 1.2, z);
      Matrix.ComposeToRef(gullScale, gullTurn, gullAt, gullMatrix);
      gullMatrix.copyToArray(gullMatrices, i * 16);
    });
    gull.thinInstanceBufferUpdated('matrix');
  };
  update(0);

  return {
    update,
    workerAt: (i) => ({ x: workers[i].at.x, z: workers[i].at.z }),
    cabAt: () => ({ x: cabNode.position.x, z: cabNode.position.z }),
    dispose() {
      smoke?.dispose();
      farSmoke?.dispose();
      puff.dispose();
      crowd.dispose();
      for (const x of [cabParts.bodyMesh, cabParts.wheel, gull, jib, load, jibRoot, loadNode, cabNode]) x.dispose();
      gullMaterial.dispose();
    },
  };
}
