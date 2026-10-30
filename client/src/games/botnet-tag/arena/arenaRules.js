import { walkable } from './arenaData.js'

export const BASE_SPEED = 7.2
export const STATION_COOLDOWN_MS = 20000
// a server position this far from the local one means a move was rejected
export const CORRECTION_DISTANCE = 1.5
export const SNAP_DISTANCE = 6

// per-frame step that slides along walls instead of stopping dead
export function slideStep(pos, dx, dz, dist, isWalkable = walkable) {
  const nx = pos.x + dx * dist
  const nz = pos.z + dz * dist
  if (isWalkable(nx, nz)) return { x: nx, z: nz }
  if (isWalkable(nx, pos.z)) return { x: nx, z: pos.z }
  if (isWalkable(pos.x, nz)) return { x: pos.x, z: nz }
  return { x: pos.x, z: pos.z }
}

// wasd intent in camera space turned into a world direction; forward is the camera look direction on the ground
export function worldDirection(ix, iy, forward) {
  return { x: forward.x * iy + forward.z * ix, z: forward.z * iy - forward.x * ix }
}

export function needsCorrection(local, server, limit = CORRECTION_DISTANCE) {
  if (!server) return false
  return Math.hypot(server.x - local.x, server.z - local.z) > limit
}

// eases the local spot back to the server one; a huge gap (respawn) snaps
export function correctPosition(local, server, dt, { rate = 6, snap = SNAP_DISTANCE } = {}) {
  const gap = Math.hypot(server.x - local.x, server.z - local.z)
  if (gap > snap) return { x: server.x, z: server.z }
  const k = 1 - Math.exp(-Math.max(0, dt) * rate)
  return { x: local.x + (server.x - local.x) * k, z: local.z + (server.z - local.z) * k }
}

// kiosk state from the snapshot: cooling until coolingUntil, progress 0..1 across the cooldown
export function stationView(station, serverNow, cooldownMs = STATION_COOLDOWN_MS) {
  const left = Math.max(0, (station?.coolingUntil ?? 0) - serverNow)
  return { cooling: left > 0, progress: left > 0 ? 1 - Math.min(1, left / cooldownMs) : 1 }
}

// moves labels up until none overlap, never further than max px from their body; items are { key, x, y, w, h } in css px
export function nudgeLabels(items, { pad = 2, max = 48 } = {}) {
  const placed = []
  const out = new Map()
  // lower on screen means nearer the camera, so those keep their spot
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    let off = 0
    const clash = () =>
      placed.some(
        (o) =>
          Math.abs(o.x - item.x) < (o.w + item.w) / 2 &&
          Math.abs(o.y - (item.y - off)) < (o.h + item.h) / 2 + pad,
      )
    while (off < max && clash()) off += item.h + pad
    off = Math.min(off, max)
    placed.push({ x: item.x, y: item.y - off, w: item.w, h: item.h })
    out.set(item.key, off)
  }
  return out
}

// label size multiplier by camera distance, clamped so far players stay readable
export const labelScale = (distance) => Math.min(1.25, Math.max(0.8, 14 / Math.max(distance, 1)))
