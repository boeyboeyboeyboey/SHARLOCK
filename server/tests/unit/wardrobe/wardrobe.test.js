import { describe, expect, it } from 'vitest'
import { achievementKeys } from '../../../src/modules/progress/achievements.js'
import {
  DEFAULT_WARDROBE,
  WARDROBE_ITEMS,
  WARDROBE_SLOTS,
  equippedFrom,
} from '../../../src/modules/wardrobe/catalog.js'
import { parseWardrobeInput } from '../../../src/modules/wardrobe/policy.js'

describe('wardrobe catalog', () => {
  it('has unique ids and a prefix that matches the slot', () => {
    const ids = WARDROBE_ITEMS.map(({ id }) => id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of WARDROBE_ITEMS) expect(entry.id.startsWith(`${entry.slot}-`)).toBe(true)
  })

  it('has exactly one always unlocked default per slot', () => {
    for (const slot of WARDROBE_SLOTS) {
      const free = WARDROBE_ITEMS.filter((entry) => entry.slot === slot && !entry.unlockedBy)
      expect(free.map(({ id }) => id)).toEqual([DEFAULT_WARDROBE[slot]])
    }
  })

  it('unlocks only through real achievement keys', () => {
    for (const entry of WARDROBE_ITEMS) {
      if (entry.unlockedBy) expect(achievementKeys).toContain(entry.unlockedBy)
    }
  })

  it('reads missing or partial stored data as defaults', () => {
    expect(equippedFrom({})).toEqual(DEFAULT_WARDROBE)
    expect(equippedFrom({ wardrobe: { hat: 'hat-flat-cap' } })).toEqual({
      ...DEFAULT_WARDROBE,
      hat: 'hat-flat-cap',
    })
  })
})

describe('wardrobe input policy', () => {
  it('accepts exactly an item of the slot', () => {
    expect(parseWardrobeInput('hat', { itemId: 'hat-flat-cap' })).toEqual({
      slot: 'hat',
      itemId: 'hat-flat-cap',
    })
  })

  it.each([
    ['unknown slot', 'cape', { itemId: 'hat-flat-cap' }],
    ['wrong slot', 'scarf', { itemId: 'hat-flat-cap' }],
    ['non-string', 'hat', { itemId: 5 }],
    ['extra key', 'hat', { itemId: 'hat-flat-cap', extra: 1 }],
    ['missing key', 'hat', {}],
    ['array', 'hat', ['hat-flat-cap']],
    ['null', 'hat', null],
  ])('rejects %s', (_label, slot, body) => {
    expect(() => parseWardrobeInput(slot, body)).toThrow(expect.objectContaining({ status: 400 }))
  })
})
