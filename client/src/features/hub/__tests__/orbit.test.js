import { describe, expect, it } from 'vitest'
import { alphaBehind, createOrbitKeys, nearestAlpha, wrapAngle } from '../scenes/shared/orbit.js'

const turn = Math.PI * 2

describe('wrapAngle', () => {
  it('keeps angles in the first turn around zero', () => {
    expect(wrapAngle(0.4)).toBeCloseTo(0.4)
    expect(wrapAngle(turn + 0.4)).toBeCloseTo(0.4)
    expect(wrapAngle(-turn * 3 - 0.4)).toBeCloseTo(-0.4)
    expect(Math.abs(wrapAngle(Math.PI * 5))).toBeCloseTo(Math.PI)
  })
})

describe('nearestAlpha', () => {
  it('takes the short way round across the pi seam', () => {
    // from just below pi to just past it is a 0.2 turn, not a 6.08 one
    expect(nearestAlpha(3.0, -3.0)).toBeCloseTo(-3.0 + turn)
    expect(nearestAlpha(-3.0, 3.0)).toBeCloseTo(3.0 - turn)
  })

  it('follows an alpha that has piled up over several turns', () => {
    const from = turn * 4 + 0.3
    const out = nearestAlpha(from, -Math.PI / 2)
    expect(Math.abs(out - from)).toBeLessThanOrEqual(Math.PI)
    expect(wrapAngle(out - -Math.PI / 2)).toBeCloseTo(0)
  })

  it('never moves further than half a turn', () => {
    for (let from = -20; from < 20; from += 0.7) {
      for (let wanted = -4; wanted < 4; wanted += 0.9) {
        expect(Math.abs(nearestAlpha(from, wanted) - from)).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    }
  })
})

describe('alphaBehind', () => {
  it('puts the camera south of a character walking north', () => {
    expect(alphaBehind(0)).toBeCloseTo(-Math.PI / 2)
  })

  it('puts the camera west of a character walking east', () => {
    expect(wrapAngle(alphaBehind(Math.PI / 2) - Math.PI)).toBeCloseTo(0)
  })
})

describe('createOrbitKeys', () => {
  const press = (type, code, init = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }))

  it('turns the camera with Z and C and resets with R, and ignores Q and E', () => {
    const camera = { alpha: 0 }
    let resets = 0
    const keys = createOrbitKeys({ camera, enabled: () => true, onReset: () => resets++ , rate: 1 })
    press('keydown', 'KeyC')
    keys.update(1)
    expect(camera.alpha).toBe(1)
    press('keyup', 'KeyC')
    press('keydown', 'KeyZ')
    keys.update(2)
    expect(camera.alpha).toBe(-1)
    press('keyup', 'KeyZ')
    press('keydown', 'KeyQ')
    press('keydown', 'KeyE')
    keys.update(1)
    expect(camera.alpha).toBe(-1)
    press('keydown', 'KeyR')
    expect(resets).toBe(1)
    keys.dispose()
  })
})
