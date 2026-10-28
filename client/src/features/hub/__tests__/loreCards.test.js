import { describe, expect, it } from 'vitest'
import { FADE_MS, LORE_CARDS, holdFor } from '../intro/loreCards.js'

describe('lore cards', () => {
  it('has five cards from the opening line to the closing line', () => {
    expect(LORE_CARDS).toHaveLength(5)
    expect(LORE_CARDS[0].text).toBe('London, 1880.')
    expect(LORE_CARDS[4].text).toBe(
      'Every case you solve here sharpens your instincts. The city is counting on you.',
    )
  })

  it('holds a short card for the 1500 ms floor', () => {
    expect(holdFor(LORE_CARDS[0].text)).toBe(1500)
  })

  it('holds a longer card for 320 ms per word', () => {
    expect(holdFor(LORE_CARDS[1].text)).toBe(6080)
    expect(holdFor('  one   two  three  four  five  six  seven  ')).toBe(2240)
  })

  it('marks the detective name on card 4 only', () => {
    expect(LORE_CARDS[3].highlight).toBe('Sharlock Holmes')
    expect(LORE_CARDS[3].text).toContain('Sharlock Holmes')
    expect(LORE_CARDS.filter((card) => card.highlight)).toHaveLength(1)
  })

  it('fades for 400 ms', () => {
    expect(FADE_MS).toBe(400)
  })
})
