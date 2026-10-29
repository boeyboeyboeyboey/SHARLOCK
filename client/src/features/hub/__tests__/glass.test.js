import { describe, expect, it } from 'vitest'
import { isSolidHud } from '../glass.js'

describe('isSolidHud', () => {
  it('goes solid when the user picks low', () => {
    expect(isSolidHud({ quality: 'low', deviceTier: 'desktop' })).toBe(true)
  })

  it('stays glass for high and medium whatever the device or watch says', () => {
    expect(isSolidHud({ quality: 'high', watchedTier: 'low', deviceTier: 'low' })).toBe(false)
    expect(isSolidHud({ quality: 'medium', deviceTier: 'low' })).toBe(false)
  })

  it('follows the device tier on auto until the runtime watch steps down', () => {
    expect(isSolidHud({ quality: 'auto', deviceTier: 'low' })).toBe(true)
    expect(isSolidHud({ quality: 'auto', deviceTier: 'desktop' })).toBe(false)
    expect(isSolidHud({ quality: 'auto', watchedTier: 'low', deviceTier: 'desktop' })).toBe(true)
    expect(isSolidHud({ quality: 'auto', watchedTier: 'compact', deviceTier: 'low' })).toBe(false)
  })
})
