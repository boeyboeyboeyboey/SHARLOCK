// pure map maths for the hub minimap: world metres (x east, z north) to a north up svg, no babylon imports so the page chunk stays light

// the slice of the world the map shows
export const mapBounds = { x0: -34, x1: 52, z0: -60, z1: 80 };
export const mapSize = { width: mapBounds.x1 - mapBounds.x0, height: mapBounds.z1 - mapBounds.z0 };

// world point to svg units; z grows northwards so it flips
export function project(x, z, bounds = mapBounds) {
  return { x: x - bounds.x0, y: bounds.z1 - z };
}

// world rectangle to an svg rect
export function projectRect(r, bounds = mapBounds) {
  const a = project(r.x0, r.z1, bounds);
  return { x: a.x, y: a.y, width: r.x1 - r.x0, height: r.z1 - r.z0 };
}

// world point to percentages of the map box, for html markers laid over the svg
export function percentOf(x, z, bounds = mapBounds) {
  const p = project(x, z, bounds);
  return { left: (p.x / (bounds.x1 - bounds.x0)) * 100, top: (p.y / (bounds.z1 - bounds.z0)) * 100 };
}

// the three corners of the view wedge; heading follows the player (0 faces north, a quarter turn faces east)
export function wedgePoints(x, y, heading, length = 7, spread = 0.5) {
  const tip = (angle, len) => [x + Math.sin(angle) * len, y - Math.cos(angle) * len];
  const left = tip(heading - spread, length);
  const right = tip(heading + spread, length);
  return [[x, y], left, right];
}

export const pointsAttr = (points) => points.map(([px, py]) => `${+px.toFixed(2)},${+py.toFixed(2)}`).join(' ');

// the footprint behind a destination's door: the facade normal is (sin face, cos face), the building sits behind it
export function footprint(dest) {
  const kiosk = dest.building === 'newsstand';
  const depth = kiosk ? 3 : 11;
  const width = kiosk ? 3 : 14;
  const nx = Math.sin(dest.face);
  const nz = Math.cos(dest.face);
  const cx = dest.x - nx * (depth / 2 + 0.5);
  const cz = dest.z - nz * (depth / 2 + 0.5);
  // facades run along x or z, so the footprint is axis aligned
  const alongX = Math.abs(nz) > 0.5;
  const hw = (alongX ? width : depth) / 2;
  const hd = (alongX ? depth : width) / 2;
  return { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, cx, cz };
}

// short marker labels; anything else falls back to the first word of its name
const shortLabels = {
  'cli-cyber-defender': 'CLI',
  'sql-injection-arcade': 'SQL',
  'threat-briefing': 'News',
  'phishing-post-mortem': 'Phish',
  'social-engineering-simulator': 'Social',
  'clearance-tower': 'Tower',
  'botnet-tag': 'Tag',
};
export const shortLabel = (id, name = '') => shortLabels[id] ?? (name.split(/\s+/)[0] || id);

// terraces and back streets drawn only as context; nothing here is walkable
export const contextBlocks = [
  { x0: -22, x1: -10.6, z0: -44, z1: 30 },
  { x0: 10.6, x1: 22, z0: -44, z1: 30 },
  { x0: -34, x1: -31, z0: -44, z1: 26 },
  { x0: -30, x1: -12, z0: -60, z1: -50 },
  { x0: 12, x1: 40, z0: -60, z1: -50 },
  { x0: -8, x1: 8, z0: -60, z1: -52 },
];
