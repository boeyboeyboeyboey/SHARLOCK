import { describe, expect, it } from 'vitest'
import { Batch } from '../scenes/shared/geometry.js'
import { bankTop, farBank, fillFarBank, seams } from '../scenes/wharf/farbank.js'

const fill = (opts) => {
  const stone = new Batch()
  const brick = new Batch()
  fillFarBank(stone, brick, opts)
  return { stone, brick }
}

describe('far bank', () => {
  it('stands at the full height over every plated bearing and eases down at both ends', () => {
    for (let az = -86; az <= 86; az += 2) expect(bankTop(az)).toBeGreaterThanOrEqual(farBank.top)
    expect(bankTop(-60)).toBe(farBank.topWest)
    expect(bankTop(0)).toBe(farBank.top)
    expect(bankTop(farBank.reach)).toBeLessThan(1)
    expect(bankTop(-farBank.reach)).toBeLessThan(1)
  })

  it('covers the painted quay up to the first piece and never drops below the others', () => {
    // the first piece is cut at -40, so the wall is still at its high mark there
    expect(bankTop(-40)).toBe(farBank.topWest)
    expect(bankTop(-30)).toBe(farBank.top)
  })

  it('spans at least -90 to 90 degrees in one mesh per material', () => {
    const { stone, brick } = fill()
    const xs = []
    for (let i = 0; i < stone.pos.length; i += 3)
      xs.push(Math.atan2(stone.pos[i], stone.pos[i + 2]) * (180 / Math.PI))
    expect(Math.min(...xs)).toBeLessThanOrEqual(-90)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(90)
    expect(brick.vertexCount).toBeGreaterThan(0)
  })

  it('puts a warehouse over each seam of the mid plates', () => {
    expect(seams.map((s) => s.az)).toEqual([-42, 42])
    const { brick } = fill()
    for (const { az } of seams) {
      const near = []
      for (let i = 0; i < brick.pos.length; i += 3) {
        const deg = Math.atan2(brick.pos[i], brick.pos[i + 2]) * (180 / Math.PI)
        if (Math.abs(deg - az) < 4) near.push(deg)
      }
      expect(near.length).toBeGreaterThan(0)
      // wide enough to hide the 4 degree cross fade
      expect(Math.max(...near) - Math.min(...near)).toBeGreaterThan(5)
    }
  })

  it('is deterministic and drops the lighters on request', () => {
    expect(fill().stone.vertexCount).toBe(fill().stone.vertexCount)
    expect(fill({ lighters: false }).stone.vertexCount).toBeLessThan(fill().stone.vertexCount)
  })
})
