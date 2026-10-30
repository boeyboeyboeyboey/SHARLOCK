import { describe, expect, it } from 'vitest'
import { SPRINT, createSprint } from '../scenes/shared/sprint.js'

describe('sprint', () => {
  it('matches the botnet tag rules', () => {
    expect(SPRINT).toEqual({ MULT: 1.6, MS: 2500, COOLDOWN_MS: 6000 })
  })

  it('starts ready at normal speed', () => {
    const s = createSprint({ now: () => 0 })
    expect(s.state(0)).toBe('ready')
    expect(s.multiplier(0)).toBe(1)
    expect(s.cooldownLeft(0)).toBe(0)
  })

  it('boosts for 2.5 s, cools for 6 s, then is ready', () => {
    const s = createSprint({ now: () => 0 })
    expect(s.start(1000)).toBe(true)
    expect(s.multiplier(1000)).toBe(1.6)
    expect(s.multiplier(3499)).toBe(1.6)
    expect(s.state(3500)).toBe('cooldown')
    expect(s.multiplier(3500)).toBe(1)
    expect(s.cooldownLeft(3500)).toBe(6000)
    expect(s.cooldownLeft(6500)).toBe(3000)
    expect(s.state(9499)).toBe('cooldown')
    expect(s.state(9500)).toBe('ready')
    expect(s.cooldownLeft(9500)).toBe(0)
  })

  it('ignores a start while active or cooling', () => {
    const s = createSprint({ now: () => 0 })
    s.start(0)
    expect(s.start(1000)).toBe(false)
    expect(s.start(5000)).toBe(false)
    expect(s.start(8500)).toBe(true)
  })

  it('reads the injected clock when no time is passed', () => {
    let t = 100
    const s = createSprint({ now: () => t })
    s.start()
    t = 200
    expect(s.state()).toBe('active')
    t = 100 + 8500
    expect(s.state()).toBe('ready')
  })
})
