// chroma key for opaque plates: pure pixel work on rgba bytes, so it can be tested without a browser
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// greenness is green minus the larger of red and blue, so a flat 00ff00 gives 255 and warm paint is negative
export const keyRange = { lo: 70, hi: 150 }

// true when the image has no real transparency, so it needs the key
export function isOpaque(data) {
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear += 1
  return clear / (data.length / 4) < 0.002
}

// keys green to alpha, removes the green spill on edge pixels and gives cleared pixels a warm haze colour so mip filtering leaves no dark or green fringe
export function keyGreen(data, fill = [255, 199, 140]) {
  const stats = { keyed: 0, partial: 0, total: data.length / 4 }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const k = g - Math.max(r, b)
    if (k <= 0) continue
    const alpha = 1 - smooth(keyRange.lo, keyRange.hi, k)
    if (alpha >= 1) continue
    if (alpha <= 0) {
      data[i] = fill[0]
      data[i + 1] = fill[1]
      data[i + 2] = fill[2]
      data[i + 3] = 0
      stats.keyed += 1
    } else {
      data[i + 1] = Math.min(g, Math.max(r, b))
      data[i + 3] = Math.round(data[i + 3] * alpha)
      stats.partial += 1
    }
  }
  return stats
}

// crops an image that is close to 3:2 to its centred band of the wanted aspect (21:9 for plate pieces), otherwise returns null
export function cropBand(data, width, height, aspect, tolerance = 0.04) {
  if (Math.abs(width / height / 1.5 - 1) > tolerance) return null
  const bandHeight = Math.round(width / aspect)
  if (bandHeight >= height) return null
  const top = Math.floor((height - bandHeight) / 2)
  return {
    data: data.slice(top * width * 4, (top + bandHeight) * width * 4),
    width,
    height: bandHeight,
    top,
  }
}

// clears everything at and below a ground line (row given as a fraction from the top) plus a few pixels above it, feathered over 2 px,
// so a painted guide line or bank under the buildings never shows
export function cutBelow(data, width, height, fraction, fill = [255, 199, 140]) {
  const scale = height / 864
  const start = Math.round(height * fraction - 4 * scale)
  const feather = 2
  for (let y = Math.max(0, start - feather); y < height; y += 1) {
    const keep = y >= start ? 0 : (start - y) / (feather + 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      data[i + 3] = Math.round(data[i + 3] * keep)
      if (keep === 0) {
        data[i] = fill[0]
        data[i + 1] = fill[1]
        data[i + 2] = fill[2]
      }
    }
  }
  return start
}
