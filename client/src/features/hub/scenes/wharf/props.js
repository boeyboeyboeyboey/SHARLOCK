import { Constants } from '@babylonjs/core/Engines/constants.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { frame } from '../shared/geometry.js';
import { rng } from '../shared/random.js';
import { glowMaterial } from './toon.js';
import { glowTexture } from './textures.js';
import { instanced, slab } from './shapes.js';
import { spawn } from './layout.js';

const IRON = [0.2, 0.2, 0.26, 1];

// gas lamp positions: quay edge, both pavements, the pier and the lanes
function lampSpots() {
  const spots = [];
  for (let x = -24; x <= 36; x += 10) spots.push([x, 44.2]);
  // pavement lamps stand in the gaps between shop signs, so no post ever crosses a fascia or hanging board
  for (const z of [25.5, 10, -10, -31]) spots.push([-8.5, z]);
  for (const z of [24, 6.8, -9.7, -33]) spots.push([8.5, z]);
  spots.push([2.6, 50]);
  for (const z of [59, 67, 75]) spots.push([-2.6, z], [2.6, z]);
  for (const z of [20, 0, -20]) spots.push([34, z]);
  for (const x of [-14, 14, 26]) spots.push([x, -38]);
  return spots;
}

// lamp posts (merged), glowing heads and warm light pools (thin instanced), switched on one by one after the scene opens
export function buildLamps({ scene, world, extraHeads, reduced }) {
  const wash = world.batches.wash;
  const spots = lampSpots();
  for (const [x, z] of spots) {
    wash.cylinder({ c: [x, 0.3, z], r: 0.2, rTop: 0.14, h: 0.6, seg: 8, color: IRON });
    wash.cylinder({ c: [x, 2.3, z], r: 0.1, rTop: 0.07, h: 3.6, seg: 8, color: IRON });
    wash.cylinder({ c: [x, 3.75, z], r: 0.2, rTop: 0.13, h: 0.18, seg: 8, color: IRON });
    slab(wash, x - 0.28, x + 0.28, 4.62, 4.72, z - 0.28, z + 0.28, IRON);
    wash.cylinder({ c: [x, 4.9, z], r: 0.3, rTop: 0.02, h: 0.44, seg: 6, color: IRON });
  }
  const heads = spots.map(([x, z]) => ({ at: [x, 4.2, z], color: [1.8, 1.1, 0.55], kind: 'gas', size: 0.34 }));
  const all = [...heads, ...extraHeads];

  const headMesh = CreateBox('lamp-head', { width: 0.4, height: 0.7, depth: 0.4 }, scene);
  const headMaterial = glowMaterial(scene, 'lamp-heads', {});
  headMaterial.diffuseTexture = null;
  const colors = new Float32Array(all.length * 4);
  const matrices = new Float32Array(all.length * 16);
  all.forEach((h, i) => {
    const s = h.size ?? 0.4;
    matrices.set([s / 0.4, 0, 0, 0, 0, s / 0.4, 0, 0, 0, 0, s / 0.4, 0, h.at[0], h.at[1], h.at[2], 1], i * 16);
  });
  headMesh.material = headMaterial;
  headMesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  headMesh.thinInstanceSetBuffer('color', colors, 4, false);
  headMesh.alwaysSelectAsActiveMesh = true;
  headMesh.isPickable = false;

  // light pools under the gas lamps only
  const poolTexture = glowTexture(scene, 'light-pool', [[0, 'rgba(255,255,255,0.7)'], [0.35, 'rgba(255,255,255,0.28)'], [0.7, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']]);
  const poolMaterial = glowMaterial(scene, 'light-pools', { texture: poolTexture, alphaMode: Constants.ALPHA_ADD, fog: false });
  poolMaterial.disableDepthWrite = true;
  poolMaterial.zOffset = -3;
  const poolMesh = CreatePlane('lamp-pools', { size: 1 }, scene);
  poolMesh.rotation.x = Math.PI / 2;
  poolMesh.bakeCurrentTransformIntoVertices();
  poolMesh.material = poolMaterial;
  const poolMatrices = new Float32Array(heads.length * 16);
  const poolColors = new Float32Array(heads.length * 4);
  heads.forEach((h, i) => {
    const r = 5.5;
    poolMatrices.set([r, 0, 0, 0, 0, 1, 0, 0, 0, 0, r, 0, h.at[0], 0.06, h.at[2], 1], i * 16);
  });
  poolMesh.thinInstanceSetBuffer('matrix', poolMatrices, 16, true);
  poolMesh.thinInstanceSetBuffer('color', poolColors, 4, false);
  poolMesh.alwaysSelectAsActiveMesh = true;
  poolMesh.isPickable = false;
  poolMesh.alphaIndex = 5;

  // switch-on order: nearest the spawn first, spread over about 20 seconds
  const order = all.map((h, i) => ({ i, d: Math.hypot(h.at[0] - spawn.x, h.at[2] - spawn.z) })).sort((a, b) => a.d - b.d);
  const delay = new Float32Array(all.length);
  order.forEach((o, rank) => {
    delay[o.i] = 1.2 + (rank / order.length) * 19;
  });
  const rand = rng(77);
  const phase = all.map(() => rand() * 40);
  let settled = false;
  const write = (t) => {
    let moving = false;
    for (let i = 0; i < all.length; i += 1) {
      const raw = reduced() ? 1 : Math.min(1, Math.max(0, (t - delay[i]) / 1.4));
      if (raw < 1) moving = true;
      // a gas lamp pops on with two stutters, then settles and breathes a little
      const pop = raw < 1 ? Math.min(1, raw * 1.6) * (0.78 + 0.22 * Math.abs(Math.sin(raw * 18))) : 1;
      const breathe = reduced() ? 1 : 1 + Math.sin(t * 7 + phase[i]) * 0.016 + Math.sin(t * 13 + phase[i] * 2) * 0.009;
      const level = pop * breathe;
      const c = all[i].color;
      colors.set([c[0] * level, c[1] * level, c[2] * level, 1], i * 4);
      if (i < heads.length) poolColors.set([0.9 * level, 0.52 * level, 0.18 * level, 1], i * 4);
    }
    headMesh.thinInstanceBufferUpdated('color');
    poolMesh.thinInstanceBufferUpdated('color');
    return moving;
  };
  write(reduced() ? 0 : 0);
  let acc = 0;
  return {
    meshes: [headMesh, poolMesh],
    update(t, dt) {
      acc += dt;
      // 20 updates a second is plenty for the flicker; all lamps are static afterwards
      if (acc < 0.05) return;
      acc = 0;
      if (reduced()) {
        if (!settled) {
          write(100);
          settled = true;
        }
        return;
      }
      settled = false;
      write(t);
    },
    dispose() {
      headMesh.dispose();
      headMaterial.dispose();
      poolMesh.dispose();
      poolMaterial.dispose();
      poolTexture.dispose();
    },
    count: all.length,
    spots,
    litFraction: () => {
      let on = 0;
      for (let i = 0; i < all.length; i += 1) if (colors[i * 4] > all[i].color[0] * 0.9) on += 1;
      return on / all.length;
    },
  };
}

// crates, barrels and sacks stacked around the quay and warehouses, as two thin instanced meshes
export function buildCargo({ scene, world, barrels = [] }) {
  const rand = rng(404);
  const crateSpots = [];
  const barrelSpots = barrels.map((p) => ({ at: [p[0], 0.45, p[2]], color: [0.72 + rand() * 0.15, 0.5, 0.36, 1] }));
  const stack = (x, z, cols, rows, high, kind) => {
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      for (let k = 0; k < high - (rand() < 0.35 ? 1 : 0); k += 1) {
        const jitter = (rand() - 0.5) * 0.08;
        if (kind === 'crate') {
          const t = 0.8 + rand() * 0.3;
          crateSpots.push({ at: [x + i * 1.0 + jitter, 0.45 + k * 0.9, z + j * 1.0], yaw: (rand() - 0.5) * 0.18, color: [0.9 * t, 0.68 * t, 0.42 * t, 1] });
        } else {
          barrelSpots.push({ at: [x + i * 0.95, 0.45 + k * 0.9, z + j * 0.95], yaw: rand() * 3, color: [0.7 + rand() * 0.2, 0.46 + rand() * 0.1, 0.32, 1] });
        }
      }
    }
  };
  stack(22, 38, 4, 4, 2, 'crate');
  stack(-26, 34, 3, 4, 2, 'barrel');
  stack(-13, 40, 3, 2, 2, 'crate');
  stack(10.5, 41.5, 3, 2, 1, 'barrel');
  stack(36, 31, 2, 3, 3, 'crate');
  stack(-20, 42, 3, 2, 1, 'crate');
  stack(14.5, 32, 2, 2, 2, 'barrel');

  const crate = CreateBox('crate', { size: 0.88 }, scene);
  const barrel = CreateCylinder('barrel', { diameterTop: 0.62, diameterBottom: 0.62, height: 0.9, tessellation: 12 }, scene);
  const meshes = [instanced(scene, 'crates', crate, world.materials.plank, crateSpots), instanced(scene, 'barrels', barrel, world.materials.plank, barrelSpots)];
  return { meshes };
}

// the newsstand kiosk on the pier: timber body, striped awning, paper stacks, header board and an extra board
export function buildNewsstand({ world, signs, info, B }) {
  const { b, fbox } = B;
  const f = frame(info.x, info.z, Math.PI);
  const green = [0.2, 0.46, 0.38, 1];
  // body: back and side walls, counter, roof
  fbox(b.wash, f, 0, 1.15, -1.0, 3.0, 2.3, 0.14, green);
  fbox(b.wash, f, -1.45, 1.15, -0.1, 0.14, 2.3, 2.2, green);
  fbox(b.wash, f, 1.45, 1.15, -0.1, 0.14, 2.3, 2.2, green);
  fbox(b.plank, f, 0, 0.45, 1.0, 3.0, 0.9, 0.1, [0.9, 0.75, 0.55, 1]);
  fbox(b.plank, f, 0, 0.95, 0.5, 3.1, 0.1, 1.2, [1, 0.88, 0.7, 1]);
  fbox(b.wash, f, 0, 2.38, 0.0, 3.5, 0.16, 2.9, [0.7, 0.2, 0.18, 1]);
  fbox(b.wash, f, 0, 0.05, 0, 3.2, 0.1, 2.5, [0.55, 0.42, 0.34, 1]);
  // striped awning over the counter
  const strips = 7;
  for (let i = 0; i < strips; i += 1) {
    const a = -1.7 + (3.4 * i) / strips;
    const c = -1.7 + (3.4 * (i + 1)) / strips;
    world.batches.cloth.quad([f.point(a, 2.0, 1.9), f.point(c, 2.0, 1.9), f.point(c, 2.4, 0.9), f.point(a, 2.4, 0.9)], { color: i % 2 ? [0.9, 0.2, 0.18, 1] : [1.0, 0.95, 0.85, 1], normal: f.dir(0, 0.5, 1) });
  }
  // paper stacks on the counter and ground
  const paper = [[1.0, 0.97, 0.9, 1], [0.95, 0.92, 0.84, 1], [0.9, 0.88, 0.8, 1]];
  for (let i = 0; i < 5; i += 1) fbox(b.wash, f, -1.1 + i * 0.5, 1.12 + (i % 2) * 0.1, 0.5, 0.42, 0.22 + (i % 3) * 0.08, 0.5, paper[i % 3]);
  for (let i = 0; i < 3; i += 1) fbox(b.wash, f, 2.0, 0.3 + i * 0.22, 0.2 - i * 0.05, 0.5, 0.2, 0.6, paper[i]);
  fbox(b.wash, f, 1.0, 1.2, -0.7, 0.9, 0.5, 0.06, [0.15, 0.12, 0.1, 1]);
  B.block(f, [-1.75, 1.75], [-1.15, 1.95], [0, 2.5], 0.2);
  // header board and extra board
  B.board(f, 'news-fascia', 0, 2.9, 1.0, 3.4, 3.4 * (176 / 1024) * 1.15, [1.05, 1.02, 0.98, 1]);
  // a frame board: two leaning quads, readable from the street side
  const bx = info.x + 1.7;
  const bz = info.z - 2.4;
  const uv = signs.uv('extra');
  b.signs.quad([[bx - 0.5, 0, bz - 0.35], [bx + 0.5, 0, bz - 0.35], [bx + 0.5, 1.0, bz - 0.05], [bx - 0.5, 1.0, bz - 0.05]], { uv, color: [1.02, 1, 0.96, 1], normal: [0, 0.3, -1] });
  b.signs.quad([[bx + 0.5, 0, bz + 0.35], [bx - 0.5, 0, bz + 0.35], [bx - 0.5, 1.0, bz + 0.05], [bx + 0.5, 1.0, bz + 0.05]], { uv, color: [0.9, 0.88, 0.85, 1], normal: [0, 0.3, 1] });
  // the lantern hangs beside the header board on a small bracket, clear of the lettering
  fbox(b.wash, f, 1.86, 2.5, 0.9, 0.3, 0.05, 0.05, IRON);
  return { lamp: { at: f.point(2.0, 2.4, 0.95), color: [0.95, 0.7, 0.42], kind: 'lantern', size: 0.17 } };
}


// the fixed tower of the dockside crane; its jib swings from the top in the life module
export function buildCraneTower({ world }) {
  const { wash, stone } = world.batches;
  const x = 31.7;
  const z = 41.7;
  slab(stone, x - 1.6, x + 1.6, 0, 0.7, z - 1.6, z + 1.6, [0.9, 0.86, 0.8, 1]);
  world.blockers.push({ min: [x - 1.9, 0, z - 1.9], max: [x + 2.9, 11.2, z + 1.9] });
  wash.cylinder({ c: [x, 4.9, z], r: 1.15, rTop: 0.8, h: 8.4, seg: 10, color: [0.3, 0.42, 0.36, 1] });
  for (const y of [2.6, 5.4, 8.0]) wash.cylinder({ c: [x, y, z], r: y < 4 ? 1.07 : y < 7 ? 0.94 : 0.84, rTop: y < 4 ? 1.07 : y < 7 ? 0.94 : 0.84, h: 0.22, seg: 10, color: [0.92, 0.82, 0.6, 1] });
  // machine house and boiler stack
  slab(wash, x + 0.8, x + 2.6, 0.7, 3.4, z - 0.9, z + 0.9, [0.5, 0.3, 0.26, 1]);
  wash.cylinder({ c: [x + 2.0, 4.7, z], r: 0.2, h: 2.6, seg: 8, color: IRON });
  // top platform with a rail
  wash.cylinder({ c: [x, 9.25, z], r: 1.45, h: 0.3, seg: 10, color: IRON });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    wash.cylinder({ c: [x + Math.sin(a) * 1.35, 9.8, z + Math.cos(a) * 1.35], r: 0.04, h: 1.0, seg: 5, color: IRON, cap: false });
  }
}
