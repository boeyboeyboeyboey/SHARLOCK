import { slab } from './shapes.js';

const CREAM = [1.1, 1.05, 0.92, 1];
const IRON = [0.22, 0.22, 0.28, 1];
const WOOD = [0.8, 0.62, 0.46, 1];
const BRASS = [1.25, 0.95, 0.4, 1];

// scenery for the outskirt pockets and the four object discoveries, all merged into the shared world batches (no extra draws)
export function buildOutskirts({ world }) {
  const { plank, wash, windowLit } = world.batches;

  // west back lane: a strongbox with a yellow slip, a few crates and an iron gate post
  slab(plank, -41.1, -39.9, 0, 0.8, -14.6, -13.4, [0.55, 0.45, 0.4, 1]);
  slab(wash, -41.2, -39.8, 0.8, 0.88, -14.7, -13.3, IRON);
  slab(wash, -40.95, -40.55, 0.89, 0.91, -14.2, -13.8, [1.3, 1.15, 0.45, 1]);
  slab(wash, -40.9, -40.6, 0.91, 0.92, -14.1, -13.9, [0.3, 0.2, 0.2, 1]);
  slab(plank, -42.6, -41.6, 0, 0.9, -22, -21, WOOD);
  slab(plank, -42.4, -41.8, 0.9, 1.7, -21.9, -21.3, [0.7, 0.55, 0.4, 1]);
  slab(plank, -42.6, -41.6, 0, 0.9, -7, -6, [0.7, 0.55, 0.4, 1]);

  // east yard: a crate stack, a trestle table with a ledger, a bench, and the lost memory stick on the cobbles
  slab(plank, 45, 47.6, 0, 1, -46.6, -44, WOOD);
  slab(plank, 45.3, 47.3, 1, 1.9, -46.3, -44.3, [0.7, 0.55, 0.42, 1]);
  slab(plank, 52.2, 53.8, 0.78, 0.9, -37.8, -36.2, WOOD);
  for (const [x, z] of [[52.35, -37.65], [53.65, -37.65], [52.35, -36.35], [53.65, -36.35]]) slab(plank, x - 0.06, x + 0.06, 0, 0.78, z - 0.06, z + 0.06, IRON);
  slab(wash, 52.5, 53.3, 0.9, 0.94, -37.4, -36.6, CREAM);
  slab(plank, 57.6, 60.2, 0.4, 0.5, -44.4, -43.8, WOOD);
  slab(plank, 57.8, 58, 0, 0.4, -44.3, -43.9, IRON);
  slab(plank, 59.8, 60, 0, 0.4, -44.3, -43.9, IRON);
  slab(wash, 49.2, 49.9, 0.02, 0.12, -43.7, -43.4, [0.5, 0.58, 0.8, 1]);
  slab(wash, 49.9, 50.1, 0.04, 0.1, -43.65, -43.45, BRASS);
  slab(wash, 49.05, 49.2, 0.02, 0.06, -43.6, -43.5, BRASS);
  slab(wash, 49.4, 49.6, 0.02, 0.05, -43.45, -43.25, CREAM);

  // jetty beside the pier: planks on piles, a telegraph set on a table and a handbill board on a post
  const deck = [1.02, 0.95, 0.86, 1];
  slab(plank, 2.9, 11, -0.26, 0, 61.6, 64.4, deck);
  for (const x of [5, 8, 10.8]) for (const z of [61.8, 64.2]) plank.cylinder({ c: [x, -0.4, z], r: 0.15, h: 2.4, seg: 8, color: [0.62, 0.5, 0.42, 1] });
  slab(plank, 5.8, 7.2, 0.7, 0.8, 63.4, 64.4, WOOD);
  for (const x of [5.9, 7.1]) slab(plank, x - 0.05, x + 0.05, 0, 0.7, 63.45, 63.55, IRON);
  slab(wash, 5.95, 6.55, 0.8, 0.95, 63.65, 64.2, [0.18, 0.18, 0.2, 1]);
  slab(wash, 6.6, 7.05, 0.8, 0.9, 63.7, 64.1, BRASS);
  slab(wash, 6.62, 6.9, 0.9, 0.97, 63.85, 63.95, IRON);
  windowLit.quad([[6.05, 0.96, 64.18], [6.45, 0.96, 64.18], [6.45, 1.34, 64.3], [6.05, 1.34, 64.3]], { color: [1.2, 1, 0.7, 1], uv: [0, 0, 1, 1], normal: [0, 0.3, -1] });
  plank.cylinder({ c: [10.45, 1.2, 63], r: 0.1, h: 2.4, seg: 8, color: [0.7, 0.56, 0.44, 1] });
  slab(wash, 10.25, 10.35, 1.2, 2.2, 62.65, 63.35, CREAM);
  slab(wash, 10.2, 10.35, 1.9, 2.1, 62.7, 63.3, [0.8, 0.14, 0.14, 1]);
  for (const y of [1.7, 1.55, 1.4]) slab(wash, 10.2, 10.35, y, y + 0.05, 62.75, 63.25, [0.15, 0.12, 0.12, 1]);
}
