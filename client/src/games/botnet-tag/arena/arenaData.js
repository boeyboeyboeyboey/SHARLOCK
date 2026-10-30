// client copy of server/src/modules/games/botnet-tag/arena.js; a test keeps the two equal
export const PLAYER_RADIUS = 0.3

const rect = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ })

export const ARENA = Object.freeze({
  bounds: rect(-22, 22, -16, 16),
  walls: Object.freeze([
    rect(-12, -6, -9, -6),
    rect(6, 12, -9, -6),
    rect(-12, -6, 6, 9),
    rect(6, 12, 6, 9),
    rect(-2, 2, -2, 2),
    rect(-18, -16, -3, 3),
    rect(16, 18, -3, 3),
  ]),
  stations: Object.freeze([
    Object.freeze({ id: 'st-firewall', x: -18, z: -12, kind: 'firewall' }),
    Object.freeze({ id: 'st-patch', x: 0, z: -12, kind: 'patch' }),
    Object.freeze({ id: 'st-process', x: 18, z: -12, kind: 'process' }),
    Object.freeze({ id: 'st-hash', x: -18, z: 12, kind: 'hash' }),
    Object.freeze({ id: 'st-spoof', x: 0, z: 12, kind: 'spoof' }),
    Object.freeze({ id: 'st-account', x: 18, z: 12, kind: 'account' }),
  ]),
  spawns: Object.freeze([
    Object.freeze({ x: -8, z: 0 }),
    Object.freeze({ x: 8, z: 0 }),
    Object.freeze({ x: 0, z: -6 }),
    Object.freeze({ x: 0, z: 6 }),
    Object.freeze({ x: -14, z: 0 }),
    Object.freeze({ x: 14, z: 0 }),
    Object.freeze({ x: -4, z: -12 }),
    Object.freeze({ x: 4, z: 12 }),
  ]),
})

function nearWall(x, z, wall) {
  const dx = Math.max(wall.minX - x, 0, x - wall.maxX)
  const dz = Math.max(wall.minZ - z, 0, z - wall.maxZ)
  return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS
}

// a point is walkable when a player disc fits inside the fence and clear of every wall
export function walkable(x, z) {
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x + z)) return false
  const { bounds } = ARENA
  if (x < bounds.minX + PLAYER_RADIUS || x > bounds.maxX - PLAYER_RADIUS) return false
  if (z < bounds.minZ + PLAYER_RADIUS || z > bounds.maxZ - PLAYER_RADIUS) return false
  return !ARENA.walls.some((wall) => nearWall(x, z, wall))
}
