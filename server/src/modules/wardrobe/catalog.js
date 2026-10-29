export const WARDROBE_SLOTS = Object.freeze(['scarf', 'hat', 'monocle', 'accessory'])

function item(id, slot, name, unlockedBy = null) {
  return Object.freeze({ id, slot, name, unlockedBy })
}

export const WARDROBE_ITEMS = Object.freeze([
  item('scarf-red', 'scarf', 'Red scarf'),
  item('scarf-navy', 'scarf', 'Navy scarf', 'first-close-sql-injection-arcade'),
  item('scarf-forest', 'scarf', 'Forest scarf', 'first-close-clearance-tower'),
  item('scarf-mustard', 'scarf', 'Mustard scarf', 'first-close-phishing-post-mortem'),
  item('scarf-plum', 'scarf', 'Plum scarf', 'first-close-cli-cyber-defender'),
  item('scarf-teal', 'scarf', 'Teal scarf', 'first-close-social-engineering-simulator'),
  item('hat-deerstalker', 'hat', 'Deerstalker'),
  item('hat-brown-tweed', 'hat', 'Brown tweed hat', 'first-clue'),
  item('hat-grey-tweed', 'hat', 'Grey tweed hat', 'persistent-detective'),
  item('hat-flat-cap', 'hat', 'Flat cap', 'well-rounded'),
  item('monocle-gold', 'monocle', 'Gold monocle'),
  item('monocle-silver', 'monocle', 'Silver monocle', 'perfect-case'),
  item('monocle-brass', 'monocle', 'Brass monocle', 'timed-run'),
  item('accessory-none', 'accessory', 'None'),
  item('accessory-magnifier', 'accessory', 'Magnifier', 'topic-expert'),
])

export const DEFAULT_WARDROBE = Object.freeze({
  scarf: 'scarf-red',
  hat: 'hat-deerstalker',
  monocle: 'monocle-gold',
  accessory: 'accessory-none',
})

export const WARDROBE_ITEM_IDS_BY_SLOT = Object.freeze(
  Object.fromEntries(
    WARDROBE_SLOTS.map((slot) => [
      slot,
      Object.freeze(WARDROBE_ITEMS.filter((entry) => entry.slot === slot).map(({ id }) => id)),
    ]),
  ),
)

export function findWardrobeItem(itemId) {
  return WARDROBE_ITEMS.find((entry) => entry.id === itemId)
}

// accounts created before the wardrobe existed have no stored field and read as defaults
export function equippedFrom(user) {
  const stored = user?.wardrobe ?? {}
  return Object.fromEntries(
    WARDROBE_SLOTS.map((slot) => [slot, stored[slot] ?? DEFAULT_WARDROBE[slot]]),
  )
}
