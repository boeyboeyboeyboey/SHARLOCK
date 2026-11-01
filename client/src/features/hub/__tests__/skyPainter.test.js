import { describe, expect, it, vi } from 'vitest'
import { createSky, createSkyPainter } from '../scenes/wharf/sky.js'

vi.mock('../scenes/wharf/toon.js', () => ({ glowMaterial: () => ({}) }))
const texture = vi.hoisted(() => ({ disposed: 0 }))
vi.mock('@babylonjs/core/Materials/Textures/dynamicTexture.js', () => ({
  DynamicTexture: class {
    getContext() {
      return {
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData() {},
      }
    }
    update() {}
    dispose() {
      texture.disposed += 1
    }
  },
}))

// checksum of the painted pixels; the bands and in-place mixing were compared byte for byte with the old code at
// 48x12, 1024x256 and 1536x384 when they arrived. a new value here means the sky looks different
const GOLDEN_48_12 = 1913492053

function checksum(data) {
  let hash = 2166136261
  for (const byte of data) {
    hash ^= byte
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

describe('sky painter', () => {
  it('keeps the painted look', () => {
    const data = new Uint8ClampedArray(48 * 12 * 4)
    createSkyPainter(data, 48, 12)(0, 12)
    expect(checksum(data)).toBe(GOLDEN_48_12)
  })

  it('paints the same picture in bands as in one go', () => {
    const whole = new Uint8ClampedArray(48 * 12 * 4)
    createSkyPainter(whole, 48, 12)(0, 12)
    const bands = new Uint8ClampedArray(48 * 12 * 4)
    const paint = createSkyPainter(bands, 48, 12)
    paint(0, 3)
    paint(3, 9)
    paint(9, 12)
    expect(bands).toEqual(whole)
  })

  it('stops and frees its texture when the hub is left while it paints', async () => {
    await expect(createSky({}, { width: 8, height: 4, isDisposed: () => true })).resolves.toBeNull()
    expect(texture.disposed).toBe(1)
  })
})
