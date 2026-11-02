import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { loadTexture } from './assets.js'
import { cropBand, cutBelow, isOpaque, keyGreen } from './chroma.js'

function decode(url) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

// raw bytes keep the haze colour under the cleared pixels, a canvas would premultiply it away
function rawTexture(scene, data, width, height, alpha, metadata) {
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array(data.buffer, data.byteOffset, data.length),
    width,
    height,
    scene,
    true,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  texture.hasAlpha = alpha
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 8
  texture.metadata = metadata
  return texture
}

// loads a plate; a png with real alpha is used as is, an opaque one has its 00ff00 background keyed to transparent
// cutBelow is the ground line row as a fraction from the top: everything at and below it becomes transparent
// cropTo is a wanted aspect (21:9 for pieces): an image of about 3:2 is cropped to its centred band of that aspect first
// scale shrinks the picture before any pixel work, so the lighter tiers spend less memory on it
// resolves null when the file fails so callers can fall back to a painted stand-in
export async function loadPlateTexture(
  scene,
  url,
  { cropTo = null, cutBelow: groundRow = null, scale = 1 } = {},
) {
  const image = await decode(url)
  if (!image) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let { width, height } = canvas
  let cropped = null
  const band = cropTo ? cropBand(pixels.data, width, height, cropTo) : null
  if (band) {
    cropped = { from: [width, height], to: [band.width, band.height], top: band.top }
    pixels = { data: band.data }
    width = band.width
    height = band.height
  }
  const cut = groundRow === null ? null : { row: groundRow }
  if (!isOpaque(pixels.data)) {
    if (cut) cutBelow(pixels.data, width, height, groundRow)
    if (!band && !cut) {
      const texture = await loadTexture(scene, url)
      if (texture) texture.hasAlpha = true
      return texture
    }
    return rawTexture(scene, pixels.data, width, height, true, { cropped, cut })
  }
  const stats = keyGreen(pixels.data)
  const keyedAny = stats.keyed + stats.partial > 0
  // nothing green to key means a finished opaque picture, which is left as it is
  if (!keyedAny && !band && !cut) return loadTexture(scene, url)
  if (cut) cutBelow(pixels.data, width, height, groundRow)
  return rawTexture(scene, pixels.data, width, height, keyedAny || Boolean(cut), {
    keyed: stats.keyed,
    partial: stats.partial,
    cropped,
    cut,
  })
}
