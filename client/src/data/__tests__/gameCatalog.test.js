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

describe('needs 3d flag', () => {
  it('marks botnet tag as needing 3d and no other entry', () => {
    expect(gameCatalog.filter((game) => game.needs3d).map((game) => game.id)).toEqual([
      'botnet-tag',
    ])
  })

  it('accepts only a boolean', () => {
    const base = gameCatalog[0]
    expect(() => defineGameCatalog([{ ...base, needs3d: true }])).not.toThrow()
    expect(() => defineGameCatalog([{ ...base, needs3d: 'yes' }])).toThrow('Needs 3D')
  })
})
