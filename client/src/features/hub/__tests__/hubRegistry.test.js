import { describe, expect, it } from 'vitest'
import { gameCatalog } from '../../../data/gameCatalog.js'
import { npcs } from '../scenes/wharf/npcs.js'
import { destinations } from '../scenes/wharf/layout.js'
import { selectionViews } from '../scenes/wharf/views.js'

// the shell builds its buttons from the catalog and the scene builds from layout.js, so the two lists must agree
describe('every catalog game has its place on the wharf', () => {
  it.each(gameCatalog.map((game) => game.id))('%s has a door, a view and a keeper', (id) => {
    expect(destinations.some((d) => d.id === id)).toBe(true)
    expect(selectionViews[id]).toBeTruthy()
    expect(npcs.filter((npc) => npc.kind === 'game' && npc.gameId === id)).toHaveLength(1)
  })

  it('has no door for a game the catalog does not list', () => {
    const ids = new Set(gameCatalog.map((game) => game.id))
    for (const d of destinations) expect(ids.has(d.id)).toBe(true)
  })
})
