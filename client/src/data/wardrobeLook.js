// how each wardrobe item id looks: a display colour for 2d swatches and the options the 3d rig takes
// the server owns which items exist and who may wear them, this file only owns colour and shape
// rig colours are linear [r, g, b] like furStyles in capybara.js

export const SLOTS = Object.freeze(['scarf', 'hat', 'monocle', 'accessory'])

export const SLOT_LABELS = Object.freeze({
  scarf: 'Scarf',
  hat: 'Hat',
  monocle: 'Monocle',
  accessory: 'Accessory',
})

export const DEFAULT_EQUIPPED = Object.freeze({
  scarf: 'scarf-red',
  hat: 'hat-deerstalker',
  monocle: 'monocle-gold',
  accessory: 'accessory-none',
})

export const WARDROBE_LOOK = Object.freeze({
  'scarf-red': { slot: 'scarf', hex: '#8a2a2e', rig: { scarfColor: [0.54, 0.165, 0.18] } },
  'scarf-navy': { slot: 'scarf', hex: '#243370', rig: { scarfColor: [0.14, 0.2, 0.44] } },
  'scarf-forest': { slot: 'scarf', hex: '#215e33', rig: { scarfColor: [0.13, 0.37, 0.2] } },
  'scarf-mustard': { slot: 'scarf', hex: '#c7941f', rig: { scarfColor: [0.78, 0.58, 0.12] } },
  'scarf-plum': { slot: 'scarf', hex: '#6b2b66', rig: { scarfColor: [0.42, 0.17, 0.4] } },
  'scarf-teal': { slot: 'scarf', hex: '#1f8080', rig: { scarfColor: [0.12, 0.5, 0.5] } },
  'hat-deerstalker': {
    slot: 'hat',
    hex: '#8c6a43',
    rig: { hat: 'deerstalker', tweedColor: [1, 1, 1] },
  },
  'hat-brown-tweed': {
    slot: 'hat',
    hex: '#6b4a2d',
    rig: { hat: 'deerstalker', tweedColor: [0.72, 0.58, 0.46] },
  },
  'hat-grey-tweed': {
    slot: 'hat',
    hex: '#7b7f87',
    rig: { hat: 'deerstalker', tweedColor: [0.7, 0.8, 1] },
  },
  'hat-flat-cap': {
    slot: 'hat',
    hex: '#4a4036',
    rig: { hat: 'detective-cap', capColor: [0.3, 0.25, 0.2] },
  },
  'monocle-gold': { slot: 'monocle', hex: '#f9bd38', rig: { monocleColor: [0.98, 0.74, 0.22] } },
  'monocle-silver': { slot: 'monocle', hex: '#cfd5e0', rig: { monocleColor: [0.82, 0.85, 0.9] } },
  'monocle-brass': { slot: 'monocle', hex: '#b88033', rig: { monocleColor: [0.72, 0.5, 0.2] } },
  'accessory-none': { slot: 'accessory', hex: null, rig: { accessory: null } },
  'accessory-magnifier': { slot: 'accessory', hex: '#b88033', rig: { accessory: 'magnifier' } },
})

// merged rig options for an equipped map, a missing, unknown or wrong slot id falls back to that slot's default
export function rigOptionsFor(equipped) {
  const rig = {}
  for (const slot of SLOTS) {
    const id = equipped?.[slot]
    const entry = Object.hasOwn(WARDROBE_LOOK, id) ? WARDROBE_LOOK[id] : null
    Object.assign(rig, (entry?.slot === slot ? entry : WARDROBE_LOOK[DEFAULT_EQUIPPED[slot]]).rig)
  }
  return rig
}

// dev preview list such as "scarf-navy,hat-flat-cap", unknown ids are ignored
export function parseWardrobeParam(text) {
  const equipped = {}
  for (const id of String(text ?? '').split(',')) {
    const entry = Object.hasOwn(WARDROBE_LOOK, id.trim()) ? WARDROBE_LOOK[id.trim()] : null
    if (entry) equipped[entry.slot] = id.trim()
  }
  return equipped
}
