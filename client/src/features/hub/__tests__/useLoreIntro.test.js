import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LORE_SEEN_KEY, _resetLoreIntroForTests, useLoreIntro } from '../intro/useLoreIntro.js'

beforeEach(() => _resetLoreIntroForTests())
afterEach(() => vi.restoreAllMocks())

describe('lore intro state', () => {
  it('has not been seen at first', () => {
    const lore = useLoreIntro()
    expect(lore.hasSeen()).toBe(false)
    expect(lore.playing.value).toBe(false)
  })

  it('finishing stores the flag and stops playing', () => {
    const lore = useLoreIntro()
    lore.start()
    expect(lore.playing.value).toBe(true)
    lore.finish()
    expect(lore.playing.value).toBe(false)
    expect(localStorage.getItem(LORE_SEEN_KEY)).toBe('1')
    expect(lore.hasSeen()).toBe(true)
  })

  it('replay plays the intro again', () => {
    const lore = useLoreIntro()
    lore.finish()
    lore.replay()
    expect(lore.playing.value).toBe(true)
  })

  it('remembers the intro in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const lore = useLoreIntro()
    expect(lore.hasSeen()).toBe(false)
    lore.finish()
    expect(lore.hasSeen()).toBe(true)
    expect(lore.playing.value).toBe(false)
  })
})
