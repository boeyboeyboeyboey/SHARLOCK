import { WARDROBE_SLOTS, equippedFrom, findWardrobeItem } from '../wardrobe/catalog.js'

// public outfit only: catalog item ids for the equipped slots, nothing else from the account
export function publicLook(user) {
  const equipped = equippedFrom(user)
  return Object.fromEntries(
    WARDROBE_SLOTS.map((slot) => {
      const item = findWardrobeItem(equipped[slot])
      return [slot, item && item.slot === slot ? item.id : null]
    }),
  )
}
