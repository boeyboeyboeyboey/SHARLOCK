import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

// world layout for the thames wharf (x east, z north, ground at y 0, the river lies north of the quay)
export const quayZ = 46;
export const waterY = -1.3;
export const spawn = { x: 0, z: 27 };

// low golden sun in the north north west, straight down the main street and over the river
const bearing = (340 * Math.PI) / 180;
const elevation = 0.11;
export const toSun = new Vector3(Math.sin(bearing) * Math.cos(elevation), Math.sin(elevation), Math.cos(bearing) * Math.cos(elevation)).normalize();

export const accents = {
  telegraph: '#d9b45a',
  customs: '#e8d9a8',
  news: '#e5483f',
  post: '#d3302f',
  pub: '#f0a23a',
  police: '#3f6fd1',
};

// west buildings face east, east buildings face west; face is the yaw of the facade normal (sin = x, cos = z)
export const destinations = [
  { id: 'cli-cyber-defender', title: 'CLI Cyber Defender', accent: accents.telegraph, x: -10, z: 20, face: Math.PI / 2, reach: 2.8, building: 'telegraph' },
  { id: 'sql-injection-arcade', title: 'SQL Injection Arcade', accent: accents.customs, x: 10, z: 19, face: -Math.PI / 2, reach: 2.8, building: 'customs' },
  { id: 'threat-briefing', title: 'The daily briefing', accent: accents.news, x: -1.9, z: 54.4, face: Math.PI, reach: 2.6, building: 'newsstand' },
  { id: 'phishing-post-mortem', title: 'The Phishing Post-Mortem', accent: accents.post, x: 10, z: -2, face: -Math.PI / 2, reach: 2.8, building: 'post' },
  { id: 'social-engineering-simulator', title: 'LLM Social Engineering Simulator', accent: accents.pub, x: -10, z: -21, face: Math.PI / 2, reach: 2.8, building: 'pub' },
  { id: 'clearance-tower', title: 'Clearance Tower', accent: accents.police, x: -10, z: 0, face: Math.PI / 2, reach: 2.8, building: 'police' },
];

// axis aligned rectangles the player may walk on, and blockers cut out of them
export const floors = [
  { x0: -9.6, x1: 9.6, z0: -44, z1: 31 },
  { x0: -27, x1: 36.5, z0: 28, z1: 45.4 },
  { x0: -27, x1: 40.5, z0: -45, z1: -33 },
  { x0: 32.4, x1: 40.5, z0: -45, z1: 31 },
  { x0: -2.9, x1: 2.9, z0: 45, z1: 77.5 },
];

// outskirt pockets off the main street: the west back lane, the east yard and a jetty beside the pier
// kept apart from floors so the minimap, which draws floors, never shows them
export const pockets = [
  { x0: -34, x1: -26, z0: -44, z1: -34 },
  { x0: -43, x1: -33, z0: -44, z1: -4 },
  { x0: 40, x1: 62, z0: -48.5, z1: -33 },
  { x0: 2.9, x1: 11, z0: 61.6, z1: 64.4 },
];

export const obstacles = [
  // newsstand kiosk, pier bollards and crate stacks on the promenade
  { x0: -3.4, x1: -0.4, z0: 53, z1: 56.2 },
  { x0: -2.9, x1: -2.4, z0: 76.6, z1: 77.5 },
  { x0: 2.4, x1: 2.9, z0: 76.6, z1: 77.5 },
  { x0: 22, x1: 26, z0: 38, z1: 42 },
  { x0: -26, x1: -22, z0: 34, z1: 38 },
  // crane base and the pub benches
  { x0: 30, x1: 33.4, z0: 40, z1: 43.4 },
  { x0: -9.6, x1: -7.2, z0: -26, z1: -24 },
  { x0: -9.6, x1: -7.2, z0: -18.4, z1: -16.6 },
  // pocket props: strongbox, crate stack, ledger table, telegraph table and handbill post
  { x0: -41.1, x1: -39.9, z0: -14.6, z1: -13.4 },
  { x0: 45, x1: 47.6, z0: -46.6, z1: -44 },
  { x0: 52.2, x1: 53.8, z0: -37.8, z1: -36.2 },
  { x0: 5.8, x1: 7.2, z0: 63.4, z1: 64.4 },
  { x0: 10.2, x1: 10.7, z0: 62.7, z1: 63.3 },
];

export function walkable(x, z) {
  let inside = false;
  for (const f of floors) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) inside = true;
  for (const f of pockets) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) inside = true;
  if (!inside) return false;
  for (const r of obstacles) if (x > r.x0 - 0.15 && x < r.x1 + 0.15 && z > r.z0 - 0.15 && z < r.z1 + 0.15) return false;
  return true;
}

export const heightAt = () => 0;

// lane polylines the auto-walk follows; they join at shared points
export const paths = [
  [[-24, 36], [0, 36], [34, 36]],
  [[0, 36], [0, 20], [0, 0], [0, -21], [0, -38]],
  [[0, 36], [0, 46], [1.2, 52], [1.2, 63], [1.2, 70]],
  [[-24, -38], [0, -38], [34, -38]],
  [[34, -38], [34, 36]],
  // pockets
  [[-24, -38], [-38, -38], [-38, -8]],
  [[34, -38], [56, -38]],
  [[1.2, 63], [8.8, 63]],
];

// street, promenade and lane footprints used by the ground builder
export const streets = {
  main: { x0: -10, x1: 10, z0: -46, z1: 30 },
  promenade: { x0: -30, x1: 40, z0: 28, z1: quayZ },
  cross: { x0: -30, x1: 42, z0: -46, z1: -32 },
  lane: { x0: 31, x1: 41, z0: -46, z1: 30 },
};
