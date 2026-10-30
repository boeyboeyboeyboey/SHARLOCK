import { describe, expect, it } from 'vitest'
import { defineGameCatalog, gameCatalog } from '../gameCatalog.js'

describe('game catalog row fields', () => {
  it('gives every entry a one line short name and a hex accent', () => {
    for (const game of gameCatalog) {
      expect(game.shortName.length).toBeGreaterThan(0)
      expect(game.shortName.length).toBeLessThanOrEqual(18)
      expect(game.accent).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('rejects an over long short name and a bad accent', () => {
    const base = gameCatalog[0]
    expect(() => defineGameCatalog([{ ...base, shortName: 'x'.repeat(19) }])).toThrow()
    expect(() => defineGameCatalog([{ ...base, accent: 'green' }])).toThrow()
    expect(() =>
      defineGameCatalog([{ ...base, shortName: undefined, accent: undefined }]),
    ).not.toThrow()
  })
})
