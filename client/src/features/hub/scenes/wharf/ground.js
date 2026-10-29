import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { quayZ, streets, waterY } from './layout.js';
import { instanced, slab } from './shapes.js';
import { rng } from '../shared/random.js';

const flat = (batch, x0, x1, z0, z1, y, c, c2 = c) => {
  // c is the colour at z0, c2 at z1, so a quad can fade into a wall's shadow
  batch.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], { normal: [0, 1, 0], colors: [c, c, c2, c2] });
};

// cobbled streets and promenade, stone quay with bollards and rings, steps down to the river, timber pier with piles
export function buildGround({ scene, world }) {
  const { cobble, stone, plank } = world.batches;
  const rand = rng(1888);
  const warm = [0.96, 0.92, 0.92, 1];
  const street = [0.88, 0.84, 0.86, 1];
  const dark = [0.55, 0.48, 0.52, 1];

  // base under everything, so no gap ever shows the sky
  flat(cobble, -140, 140, -170, 46, -0.03, dark);
  // the last 3 m before the quay edge darken as if damp from the river
  const dampZ = quayZ - 3.4;
  const damp = [0.7, 0.72, 0.8, 1];
  flat(cobble, streets.main.x0, streets.main.x1, streets.main.z0, streets.main.z1, 0, street);
  flat(cobble, streets.promenade.x0, streets.promenade.x1, streets.promenade.z0, dampZ, 0, warm);
  flat(cobble, streets.promenade.x0, streets.promenade.x1, dampZ, quayZ, 0, warm, damp);
  flat(cobble, streets.promenade.x1, 62, streets.promenade.z0, dampZ, 0, warm);
  flat(cobble, streets.promenade.x1, 62, dampZ, quayZ, 0, warm, damp);
  flat(cobble, -62, streets.promenade.x0, streets.promenade.z0, dampZ, 0, warm);
  flat(cobble, -62, streets.promenade.x0, dampZ, quayZ, 0, warm, damp);
  flat(cobble, streets.cross.x0, streets.cross.x1, streets.cross.z0, streets.cross.z1, 0, street);
  flat(cobble, streets.lane.x0, streets.lane.x1, streets.lane.z0, streets.lane.z1, 0, street);
  // outskirt pockets: the east yard and the strip between the cross street and the west back lane
  flat(cobble, streets.cross.x1, 62, -49, streets.cross.z1, 0.004, street);
  flat(cobble, -34, streets.cross.x0, -44, -34, 0.004, street);

  // flagstone pavements along the building fronts, faded toward the wall for contact shadow
  const paving = [0.98, 0.93, 0.86, 1];
  const wallDark = [0.62, 0.55, 0.58, 1];
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -10 : 8.4;
    const x1 = side < 0 ? -8.4 : 10;
    stone.quad([[x0, 0.035, -32], [x1, 0.035, -32], [x1, 0.035, 28.5], [x0, 0.035, 28.5]], { normal: [0, 1, 0], colors: side < 0 ? [wallDark, paving, paving, wallDark] : [paving, wallDark, wallDark, paving] });
    // kerb edge
    slab(stone, side < 0 ? -8.5 : 8.4, side < 0 ? -8.4 : 8.5, 0, 0.05, -32, 28.5, [0.9, 0.85, 0.8, 1]);
  }

  // quay: wall down to the water, coping on top, bollards and mooring rings
  const wallCol = [0.8, 0.76, 0.76, 1];
  const foot = [0.5, 0.52, 0.56, 1];
  stone.quad([[-90, waterY - 1.5, quayZ], [90, waterY - 1.5, quayZ], [90, 0, quayZ], [-90, 0, quayZ]], { normal: [0, 0, 1], colors: [foot, foot, wallCol, wallCol] });
  slab(stone, -90, 90, 0, 0.16, quayZ - 0.55, quayZ + 0.1, [1.05, 1, 0.94, 1]);

  const bollards = [];
  const rings = [];
  for (let x = -24; x <= 58; x += 6) bollards.push({ at: [x, 0.38, quayZ - 0.9], color: [0.34, 0.32, 0.38, 1] });
  for (let x = -21; x <= 55; x += 6) rings.push({ at: [x, -0.45, quayZ + 0.04], pitch: Math.PI / 2, color: [0.3, 0.28, 0.34, 1] });
  const bollardMesh = CreateCylinder('bollard', { diameterTop: 0.34, diameterBottom: 0.42, height: 0.76, tessellation: 10 }, scene);
  const ringMesh = CreateTorus('mooring-ring', { diameter: 0.5, thickness: 0.08, tessellation: 10 }, scene);
  const meshes = [instanced(scene, 'bollards', bollardMesh, world.materials.wash, bollards), instanced(scene, 'mooring-rings', ringMesh, world.materials.wash, rings)];

  // steps down to the water
  for (let i = 0; i < 6; i += 1) {
    const top = -0.22 * (i + 1);
    slab(stone, 14, 18, -1.9, top, quayZ, quayZ + 0.5 + i * 0.5, [0.92, 0.88, 0.84, 1]);
  }
  slab(stone, 13.7, 14, -1.9, 0.12, quayZ, quayZ + 3.4, [0.9, 0.86, 0.82, 1]);
  slab(stone, 18, 18.3, -1.9, 0.12, quayZ, quayZ + 3.4, [0.9, 0.86, 0.82, 1]);

  // pier: deck, stringers, piles with caps, a pier head platform
  const deck = [1.02, 0.95, 0.86, 1];
  slab(plank, -3, 3, -0.26, 0, quayZ - 0.4, 78, deck);
  slab(plank, -3.15, -2.95, -1.8, 0.28, quayZ, 78, [0.7, 0.58, 0.5, 1]);
  slab(plank, 2.95, 3.15, -1.8, 0.28, quayZ, 78, [0.7, 0.58, 0.5, 1]);
  const piles = [];
  for (let z = 49; z <= 77; z += 4) for (const x of [-3, 3]) piles.push({ at: [x, -0.2, z], color: [0.62 + rand() * 0.1, 0.5, 0.42, 1], scale: [1, 1, 1] });
  const pileMesh = CreateCylinder('pile', { diameter: 0.34, height: 3.2, tessellation: 8 }, scene);
  meshes.push(instanced(scene, 'piles', pileMesh, world.materials.plank, piles));

  return { meshes, bollardPoints: bollards.map((b) => b.at) };
}
