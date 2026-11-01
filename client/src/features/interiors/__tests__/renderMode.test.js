import { describe, expect, it } from 'vitest'
import { fallbackGradient, stillUrl } from '../renderMode.js'
import { ROOM_IDS, roomFor } from '../rooms/palettes.js'

describe('still fallback', () => {
  it('points at the plate for a room id', () => {
    expect(stillUrl('cli-cyber-defender')).toBe('/interiors/cli-cyber-defender.webp')
  })

  it('builds a gradient from the palette and survives a missing one', () => {
    expect(fallbackGradient(['#111111', '#222222', '#333333'])).toContain('#111111')
    expect(fallbackGradient(undefined)).toContain('linear-gradient')
  })
})

describe('room palettes', () => {
  it('has a three colour palette for each of the five game ids', () => {
    expect(ROOM_IDS).toHaveLength(5)
    for (const id of ROOM_IDS) {
      const room = roomFor(id)
      expect(room.id).toBe(id)
      expect(room.palette).toHaveLength(3)
    }
  })

  it('knows nothing about other ids', () => {
    expect(roomFor('threat-briefing')).toBeNull()
  })
})
