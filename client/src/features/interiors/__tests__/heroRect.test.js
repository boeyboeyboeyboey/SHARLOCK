import { describe, expect, it } from 'vitest'
import { heroActive, ndcToCss, rectFromCorners } from '../heroRect.js'

const stage = { width: 1280, height: 800 }

describe('rectFromCorners', () => {
  it('takes the inscribed rect of a slightly skewed quad', () => {
    const rect = rectFromCorners(
      [
        [200, 100],
        [1080, 110],
        [1070, 700],
        [210, 690],
      ],
      stage,
    )
    expect(rect).toEqual({ left: 210, top: 110, width: 860, height: 580 })
  })

  it('grows a tiny quad to the minimum around its centre', () => {
    const rect = rectFromCorners(
      [
        [600, 380],
        [680, 380],
        [680, 420],
        [600, 420],
      ],
      stage,
    )
    expect(rect.width).toBe(420)
    expect(rect.height).toBe(320)
    expect(rect.left).toBe(430)
    expect(rect.top).toBe(240)
  })

  it('keeps the rect inside the stage', () => {
    const rect = rectFromCorners(
      [
        [-100, -50],
        [300, -50],
        [300, 300],
        [-100, 300],
      ],
      stage,
    )
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.top).toBeGreaterThanOrEqual(0)
  })
})

describe('ndcToCss', () => {
  it('maps the clip centre and corners', () => {
    expect(ndcToCss([0, 0], stage)).toEqual([640, 400])
    expect(ndcToCss([-1, 1], stage)).toEqual([0, 0])
    expect(ndcToCss([1, -1], stage)).toEqual([1280, 800])
  })
})

describe('heroActive', () => {
  it('needs a hero, the 3d stage and a wide viewport', () => {
    expect(heroActive({ hero: {}, stage: '3d', wide: true })).toBe(true)
    expect(heroActive({ hero: null, stage: '3d', wide: true })).toBe(false)
    expect(heroActive({ hero: {}, stage: 'still', wide: true })).toBe(false)
    expect(heroActive({ hero: {}, stage: '3d', wide: false })).toBe(false)
  })
})
