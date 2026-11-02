import { describe, expect, it } from 'vitest'
import { formatScore } from '../formatScore.js'

describe('formatScore', () => {
  it('shows score over max up to and including the maximum', () => {
    expect(formatScore(40, 100)).toBe('40 / 100')
    expect(formatScore(100, 100)).toBe('100 / 100')
  })

  it('shows a par once the score goes above it', () => {
    expect(formatScore(130, 100)).toBe('130 (par 100)')
  })
})
