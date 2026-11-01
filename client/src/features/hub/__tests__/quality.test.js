import { describe, expect, it, vi } from 'vitest'
import { getTier } from '../scenes/shared/quality.js'

vi.mock('../deviceCheck.js', () => ({ getDeviceCheck: () => ({ tier: 'compact' }) }))

const params = (text) => new URLSearchParams(text)

describe('tier selection', () => {
  it('follows the device check on auto', () => {
    expect(getTier(params(''), 'auto').name).toBe('compact')
  })

  it('maps the Graphics setting to a tier', () => {
    expect(getTier(params(''), 'high').name).toBe('desktop')
    expect(getTier(params(''), 'medium').name).toBe('compact')
    expect(getTier(params(''), 'low').name).toBe('low')
  })

  it('lets a dev ?tier= win, and treats an unknown one as compact', () => {
    expect(getTier(params('tier=low'), 'high').name).toBe('low')
    expect(getTier(params('tier=nope'), 'high').name).toBe('compact')
  })

  it('switches the mirror only on the tier the override is for', () => {
    expect(getTier(params('tier=desktop&mirror=0')).mirror).toBe(false)
    expect(getTier(params('tier=compact&mirror=1')).mirror).toBe(true)
    expect(getTier(params('tier=low&mirror=1')).mirror).toBe(false)
  })

  it('keeps full size skyline pictures on desktop and lighter ones below it', () => {
    expect(getTier(params('tier=desktop')).plateScale).toBe(1)
    expect(getTier(params('tier=compact')).plateScale).toBeLessThan(1)
    expect(getTier(params('tier=low')).plateScale).toBeLessThan(
      getTier(params('tier=compact')).plateScale,
    )
  })

  it('hands out a copy, so a change to one tier object cannot reach the next hub', () => {
    getTier(params('tier=desktop')).mirror = false
    expect(getTier(params('tier=desktop')).mirror).toBe(true)
  })
})
