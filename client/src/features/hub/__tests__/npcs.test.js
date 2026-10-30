import { describe, expect, it } from 'vitest';
import { npcs } from '../scenes/wharf/npcs.js';
import { destinations, paths, walkable } from '../scenes/wharf/layout.js';
import { getTier } from '../scenes/shared/quality.js';
import { doorSpot } from '../scenes/shared/doors.js';

const segmentDistance = (px, pz, a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
};

describe('hub npcs', () => {
  it('has unique ids and six game plus six wanderer npcs', () => {
    expect(new Set(npcs.map((n) => n.id)).size).toBe(npcs.length);
    expect(npcs.filter((n) => n.kind === 'game')).toHaveLength(6);
    expect(npcs.filter((n) => n.kind === 'wanderer')).toHaveLength(6);
  });

  it('gives each game npc one destination and no two share it', () => {
    const ids = npcs.filter((n) => n.kind === 'game').map((n) => n.gameId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(destinations.some((d) => d.id === id)).toBe(true);
  });

  it.each(npcs.map((n) => [n.id, n]))('%s stands on walkable ground', (id, n) => {
    expect(walkable(n.x, n.z)).toBe(true);
  });

  it.each(npcs.map((n) => [n.id, n]))('%s keeps clear of every door ring', (id, n) => {
    for (const d of destinations) {
      const spot = doorSpot(d, d.reach);
      expect(Math.hypot(spot.x - n.x, spot.z - n.z)).toBeGreaterThan(2.3);
    }
  });

  it.each(npcs.map((n) => [n.id, n]))('%s stays off the auto-walk lanes', (id, n) => {
    for (const lane of paths) {
      for (let i = 0; i < lane.length - 1; i += 1) expect(segmentDistance(n.x, n.z, lane[i], lane[i + 1])).toBeGreaterThan(1);
    }
  });
  it('keeps the scripted lines short, plain and in range', () => {
    for (const n of npcs) {
      const [min, max] = n.kind === 'game' ? [2, 4] : [1, 2];
      expect(n.lines.length, n.id).toBeGreaterThanOrEqual(min);
      expect(n.lines.length, n.id).toBeLessThanOrEqual(max);
      for (const line of n.lines) {
        expect(line.length, `${n.id}: ${line}`).toBeLessThanOrEqual(140);
        expect(line).not.toMatch(/http|www\./i);
      }
    }
  });

  it('keeps the original three wanderers first and the new ones on the main street', () => {
    const wanderers = npcs.filter((n) => n.kind === 'wanderer');
    expect(wanderers.slice(0, 3).map((n) => n.id)).toEqual(['fisherman', 'lamplighter', 'gull-feeder']);
    for (const n of wanderers.slice(3)) {
      for (const [x, z] of n.route) {
        expect(x, n.id).toBeGreaterThanOrEqual(-9);
        expect(x, n.id).toBeLessThanOrEqual(9);
        expect(z, n.id).toBeGreaterThanOrEqual(-40);
        expect(z, n.id).toBeLessThanOrEqual(28);
      }
    }
  });

  it('gives every game npc a game id and no wanderer one', () => {
    for (const n of npcs) expect(Boolean(n.gameId)).toBe(n.kind === 'game');
  });
});

describe('wanderer count by tier', () => {
  it('casts all six on desktop and compact and the original three on low', () => {
    const count = (setting) => getTier(new URLSearchParams(), setting).wanderers;
    expect(count('high')).toBe(6);
    expect(count('medium')).toBe(6);
    expect(count('low')).toBe(3);
  });
});
