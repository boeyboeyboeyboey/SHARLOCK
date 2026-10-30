import { describe, expect, it } from 'vitest'
import { rooms } from '../rooms/index.js'

const heroRooms = Object.values(rooms).filter((r) => r.hero)

describe('hero configs', () => {
  it('seats phishing, cli and sql on a prop', () => {
    expect(heroRooms.map((r) => r.id).sort()).toEqual([
      'cli-cyber-defender',
      'phishing-post-mortem',
      'sql-injection-arcade',
    ])
  })

  it.each(heroRooms.map((r) => [r.id, r.hero]))(
    '%s has corners, a camera and a surface',
    (_id, hero) => {
      expect(['paper', 'slate']).toContain(hero.surface)
      expect(hero.corners).toHaveLength(4)
      const [tl, tr, br, bl] = hero.corners
      expect(tr[0]).toBeGreaterThan(tl[0])
      expect(tl[1]).toBeGreaterThan(bl[1])
      expect(br[0]).toBe(tr[0])
      expect(hero.camera.pos).toHaveLength(3)
      expect(hero.camera.target).toHaveLength(3)
      expect(hero.camera.fov).toBeGreaterThan(0)
    },
  )

  it('lights dark games on slate and the paper game on paper', () => {
    expect(rooms['phishing-post-mortem'].hero.surface).toBe('paper')
    expect(rooms['cli-cyber-defender'].hero.surface).toBe('slate')
    expect(rooms['sql-injection-arcade'].hero.surface).toBe('slate')
  })
})
