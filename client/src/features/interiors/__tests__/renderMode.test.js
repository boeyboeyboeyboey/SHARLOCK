import { describe, expect, it } from 'vitest'
import { decideRender, fallbackGradient, roomBudget, stillUrl } from '../renderMode.js'
import { ROOM_IDS, roomFor, rooms } from '../rooms/index.js'

describe('decideRender', () => {
  const base = { townMode: '3d', tierName: 'desktop' }

  it('animates on the desktop and compact tiers', () => {
    expect(decideRender(base)).toBe('loop')
    expect(decideRender({ ...base, tierName: 'compact' })).toBe('loop')
  })

  it('renders one frame on the low tier or under reduced motion', () => {
    expect(decideRender({ ...base, tierName: 'low' })).toBe('single')
    expect(decideRender({ ...base, reducedMotion: true })).toBe('single')
  })

  it('shows the still in 2d mode, after a failure or a perf drop', () => {
    expect(decideRender({ ...base, townMode: '2d' })).toBe('still')
    expect(decideRender({ ...base, failed: true })).toBe('still')
    expect(decideRender({ ...base, slow: true })).toBe('still')
  })
})

describe('roomBudget', () => {
  it('keeps the draw call ceilings and the resident rig on the desktop only', () => {
    expect(roomBudget('desktop')).toEqual({ drawCalls: 150, rig: true, animate: true })
    expect(roomBudget('low')).toMatchObject({ drawCalls: 60, rig: false, animate: false })
    expect(roomBudget('compact').rig).toBe(false)
  })
})

describe('still fallback', () => {
  it('points at the plate for a room id', () => {
    expect(stillUrl('cli-cyber-defender')).toBe('/interiors/cli-cyber-defender.webp')
  })

  it('builds a gradient from the palette and survives a missing one', () => {
    expect(fallbackGradient(['#111111', '#222222', '#333333'])).toContain('#111111')
    expect(fallbackGradient(undefined)).toContain('linear-gradient')
  })
})

describe('room registry', () => {
  it('has a room with a palette and loader for each of the five game ids', () => {
    expect(ROOM_IDS).toHaveLength(5)
    for (const id of ROOM_IDS) {
      const room = roomFor(id)
      expect(room.id).toBe(id)
      expect(room.palette).toHaveLength(3)
      expect(typeof room.load).toBe('function')
    }
    expect(Object.keys(rooms).sort()).toEqual([...ROOM_IDS].sort())
  })

  it('knows nothing about other ids', () => {
    expect(roomFor('threat-briefing')).toBeNull()
  })
})
