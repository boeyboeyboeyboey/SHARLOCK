import { describe, expect, it } from 'vitest'
import { clampPan, fitScale, stepZoom, zoomLadder } from '../townZoom.js'

const world = { width: 1120, height: 800 }

describe('fitScale', () => {
  it('uses the tighter axis and never exceeds 2', () => {
    expect(fitScale({ width: 1000, height: 620 }, world)).toBeCloseTo(0.775)
    expect(fitScale({ width: 560, height: 800 }, world)).toBeCloseTo(0.5)
    expect(fitScale({ width: 4000, height: 4000 }, world)).toBe(2)
  })
})

describe('stepZoom', () => {
  it('lists fit then the presets above it', () => {
    expect(zoomLadder(0.62)).toEqual([0.62, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2])
    expect(zoomLadder(0.95)).toEqual([0.95, 1, 1.25, 1.5, 1.75, 2])
  })

  it('stops zooming out at fit and skips presets below it', () => {
    expect(stepZoom(0.75, -1, 0.62)).toBe(0.62)
    expect(stepZoom(0.62, -1, 0.62)).toBe(0.62)
    expect(stepZoom(1, -1, 0.8)).toBe(0.9)
    expect(stepZoom(0.9, -1, 0.8)).toBe(0.8)
  })

  it('steps through the presets and clamps at 200', () => {
    expect(stepZoom(1, 1, 0.62)).toBe(1.25)
    expect(stepZoom(0.62, 1, 0.62)).toBe(0.75)
    expect(stepZoom(1.75, 1, 0.62)).toBe(2)
    expect(stepZoom(2, 1, 0.62)).toBe(2)
  })

  it('snaps an in-between scale to the next preset', () => {
    expect(stepZoom(1.1, 1, 0.5)).toBe(1.25)
    expect(stepZoom(1.1, -1, 0.5)).toBe(1)
  })
})

describe('clampPan', () => {
  const view = { width: 1000, height: 600 }

  it('keeps a covering world edge to edge', () => {
    const far = clampPan({ x: 5000, y: 5000 }, 1, view, world)
    expect(far).toEqual({ x: 0, y: 0 })
    const near = clampPan({ x: -5000, y: -5000 }, 1, view, world)
    expect(near.x).toBeCloseTo(-120)
    expect(near.y).toBeCloseTo(-200)
  })

  it('centres a world smaller than the view on that axis', () => {
    const fit = 0.75
    const pan = clampPan({ x: 300, y: 0 }, fit, view, world)
    const scaledWidth = world.width * fit
    const left = (world.width - scaledWidth) / 2 + pan.x * fit
    expect(left).toBeCloseTo((view.width - scaledWidth) / 2)
  })
})
