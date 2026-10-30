import { describe, expect, it } from 'vitest'
import { routes } from './index.js'

const GAME_PATHS = [
  '/games/cli-cyber-defender',
  '/games/phishing-post-mortem',
  '/games/sql-injection-arcade',
  '/games/social-engineering-simulator',
  '/games/clearance-tower',
]

describe('interior routes', () => {
  const parent = routes.find((route) =>
    route.children?.some((child) => child.path === GAME_PATHS[0]),
  )

  it('nests the five game routes under one layout parent and keeps their paths', () => {
    expect(parent.path).toBe('/games')
    expect(parent.children.map((child) => child.path).sort()).toEqual([...GAME_PATHS].sort())
  })

  it('keeps access meta and names each room after the game id', () => {
    for (const child of parent.children) {
      expect(child.meta.requiresAccount).toBe(true)
      expect(child.path).toBe(`/games/${child.meta.interior}`)
    }
  })

  it('marks the game screens immersive so the shell drops its navbar, sidebar and footer', () => {
    expect(parent.meta.immersive).toBe(true)
  })

  it('leaves the Times as an overlay child of the town', () => {
    const town = routes.find((route) => route.name === 'town')
    expect(town.children.some((child) => child.name === 'news')).toBe(true)
  })
})
