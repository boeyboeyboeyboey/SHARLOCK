import { describe, expect, it, vi } from 'vitest'
import { buildSkyline } from '../scenes/wharf/skyline.js'
import { pieceRings } from '../scenes/wharf/plategeo.js'

const indexes = () => ({ plates: new Set(Object.values(pieceRings).map((piece) => piece.file)) })
const tier = { desktop: false, plateScale: 0.5 }

describe('skyline plates', () => {
  it('starts every plate before any has finished, and passes the tier scale', async () => {
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const started = []
    const loadFile = vi.fn((_scene, url, options) => {
      started.push({ url, options })
      return gate.then(() => null)
    })
    const pending = buildSkyline({
      scene: {},
      indexes: indexes(),
      tier,
      loadFile,
      isDisposed: () => true,
    })
    await Promise.resolve()
    expect(started).toHaveLength(Object.keys(pieceRings).length)
    expect(started.every(({ options }) => options.scale === 0.5)).toBe(true)
    release()
    await pending
  })

  it('frees what loaded and gives up when the hub was left', async () => {
    const dispose = vi.fn()
    const result = await buildSkyline({
      scene: {},
      indexes: indexes(),
      tier,
      loadFile: async () => ({ dispose }),
      isDisposed: () => true,
    })
    expect(result).toBeNull()
    expect(dispose).toHaveBeenCalledTimes(Object.keys(pieceRings).length)
  })
})
