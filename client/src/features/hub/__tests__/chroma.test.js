import { describe, expect, it } from 'vitest'
import { cropBand, cutBelow, isOpaque, keyGreen } from '../scenes/shared/chroma.js'

const pixels = (...rgba) => new Uint8ClampedArray(rgba.flat())

describe('plate chroma key', () => {
  it('clears a flat green pixel to the warm haze and keeps warm paint', () => {
    const data = pixels([0, 255, 0, 255], [200, 120, 80, 255])
    const stats = keyGreen(data)
    expect(stats).toEqual({ keyed: 1, partial: 0, total: 2 })
    expect([...data.slice(0, 4)]).toEqual([255, 199, 140, 0])
    expect([...data.slice(4)]).toEqual([200, 120, 80, 255])
  })

  it('removes the green spill and part of the alpha on an edge pixel', () => {
    const data = pixels([60, 170, 60, 255])
    expect(keyGreen(data).partial).toBe(1)
    expect(data[1]).toBe(60)
    expect(data[3]).toBeGreaterThan(0)
    expect(data[3]).toBeLessThan(255)
  })

  it('calls an image opaque unless real transparency is present', () => {
    expect(isOpaque(pixels([1, 2, 3, 255], [1, 2, 3, 255]))).toBe(true)
    expect(isOpaque(pixels([1, 2, 3, 255], [1, 2, 3, 0]))).toBe(false)
  })

  it('crops a 3:2 image to the centred band of the wanted aspect', () => {
    const data = new Uint8ClampedArray(6 * 4 * 4).map((_, i) => Math.floor(i / 24))
    const band = cropBand(data, 6, 4, 3)
    expect(band).toMatchObject({ width: 6, height: 2, top: 1 })
    expect(band.data).toHaveLength(6 * 2 * 4)
    expect(band.data[0]).toBe(1)
  })

  it('leaves images that are not close to 3:2 alone', () => {
    expect(cropBand(new Uint8ClampedArray(4 * 4 * 4), 4, 4, 3)).toBeNull()
  })

  it('clears everything below the ground line and fills it with the haze', () => {
    const width = 1
    const height = 864
    const data = new Uint8ClampedArray(width * height * 4).fill(200)
    const start = cutBelow(data, width, height, 0.5)
    expect(start).toBe(428)
    expect(data[(start + 10) * 4 + 3]).toBe(0)
    expect(data[(start + 10) * 4]).toBe(255)
    expect(data[(start - 10) * 4 + 3]).toBe(200)
  })
})
