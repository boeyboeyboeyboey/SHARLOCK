import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EQUIPPED,
  SLOTS,
  WARDROBE_LOOK,
  parseWardrobeParam,
  rigOptionsFor,
} from '../wardrobeLook.js'
import { furStyles } from '../../features/hub/scenes/shared/capybara.js'

const SERVER_IDS = [
  'scarf-red',
  'scarf-navy',
  'scarf-forest',
  'scarf-mustard',
  'scarf-plum',
  'scarf-teal',
  'hat-deerstalker',
  'hat-brown-tweed',
  'hat-grey-tweed',
  'hat-flat-cap',
  'monocle-gold',
  'monocle-silver',
  'monocle-brass',
  'accessory-none',
  'accessory-magnifier',
]

describe('wardrobe look', () => {
  it('has a look for every server item id and no extras', () => {
    expect(Object.keys(WARDROBE_LOOK).sort()).toEqual([...SERVER_IDS].sort())
  })

  it('maps every default id to its own slot', () => {
    for (const slot of SLOTS) expect(WARDROBE_LOOK[DEFAULT_EQUIPPED[slot]].slot).toBe(slot)
  })

  it('keeps the default look equal to the stock rig values', () => {
    const rig = rigOptionsFor(DEFAULT_EQUIPPED)
    expect(rig.scarfColor).toEqual(furStyles.sharlock.scarf)
    expect(rig.hat).toBe('deerstalker')
    expect(rig.tweedColor).toEqual([1, 1, 1])
    expect(rig.monocleColor).toEqual([0.98, 0.74, 0.22])
    expect(rig.accessory).toBeNull()
  })

  it('falls back to defaults for missing, unknown or wrong-slot ids', () => {
    const stock = rigOptionsFor(DEFAULT_EQUIPPED)
    expect(rigOptionsFor(null)).toEqual(stock)
    expect(rigOptionsFor({ scarf: 'scarf-pink', hat: 'monocle-silver' })).toEqual(stock)
    expect(rigOptionsFor({ scarf: '__proto__' })).toEqual(stock)
  })

  it('applies equipped items and parses the dev preview list', () => {
    const rig = rigOptionsFor(
      parseWardrobeParam('scarf-navy,hat-flat-cap,nope,accessory-magnifier'),
    )
    expect(rig.scarfColor).toEqual(WARDROBE_LOOK['scarf-navy'].rig.scarfColor)
    expect(rig.hat).toBe('detective-cap')
    expect(rig.accessory).toBe('magnifier')
  })
})
