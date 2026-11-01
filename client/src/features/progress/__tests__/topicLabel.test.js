import { describe, expect, it } from 'vitest'
import { topicLabel } from '../topicLabel.js'

describe('topicLabel', () => {
  it.each([
    ['account-security', 'Account security'],
    ['worms-and-botnets', 'Worms and botnets'],
    ['bell-lapadula', 'Bell-LaPadula'],
    ['sql-injection', 'SQL injection'],
    ['out-of-band-verification', 'Out-of-band verification'],
  ])('names %s as %s', (slug, label) => {
    expect(topicLabel(slug)).toBe(label)
  })

  it('falls back to sentence case for a topic it has never seen', () => {
    expect(topicLabel('new-game-topic')).toBe('New game topic')
  })
})
