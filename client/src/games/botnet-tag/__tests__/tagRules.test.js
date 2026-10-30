import { describe, expect, it } from 'vitest'
import { nearestStation, nearestTarget, sprintPhase } from '../tagRules.js'

const me = { sid: 'me', x: 0, z: 0 }

describe('nearestTarget', () => {
  it('picks the nearest clean, non-immune player in reach', () => {
    const players = [
      me,
      { sid: 'far', x: 5, z: 0, infected: false },
      { sid: 'sick', x: 0.5, z: 0, infected: true },
      { sid: 'safe', x: 0.6, z: 0, infected: false, immuneUntil: 2000 },
      { sid: 'far2', x: 1.6, z: 0, infected: false },
      { sid: 'near', x: 1, z: 0, infected: false, immuneUntil: 500 },
    ]
    expect(nearestTarget(me, players, 1000)).toBe('near')
    expect(nearestTarget(me, players.slice(0, 4), 1000)).toBeNull()
  })
})

describe('nearestStation', () => {
  it('ignores stations that are cooling or out of reach', () => {
    const stations = [
      { id: 'a', x: 1, z: 0, coolingUntil: 5000 },
      { id: 'b', x: 1.5, z: 0, coolingUntil: 0 },
      { id: 'c', x: 9, z: 0, coolingUntil: 0 },
    ]
    expect(nearestStation(me, stations, 1000).id).toBe('b')
    expect(nearestStation(me, stations, 6000).id).toBe('a')
    expect(nearestStation({ sid: 'x', x: 30, z: 30 }, stations, 0)).toBeNull()
  })
})

describe('sprintPhase', () => {
  it('runs active, cooldown, then ready', () => {
    expect(sprintPhase(0, 100)).toBe('ready')
    expect(sprintPhase(1000, 2000)).toBe('active')
    expect(sprintPhase(1000, 5000)).toBe('cooldown')
    expect(sprintPhase(1000, 20000)).toBe('ready')
  })
})
