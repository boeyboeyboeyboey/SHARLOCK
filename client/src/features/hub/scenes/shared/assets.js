import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'

// the skyline plates shipped in public/hub/plates, listed statically so nothing is requested blindly
const plateFiles = [1, 2, 3, 4, 5, 6]
  .map((n) => `thames-far-${n}.webp`)
  .concat([1, 2, 3, 4].map((n) => `thames-mid-${n}.webp`))

// the south arc plates arrive later, so they are probed once instead of listed; absent ones keep their painted stand-in
const optionalPlates = [7, 8].map((n) => `thames-far-${n}.webp`)

export function loadIndexes() {
  return { plates: new Set(plateFiles) }
}

// a missing file can come back as the spa index page, so only an image content type counts. never throws
export async function probeOptionalPlates(indexes, base) {
  await Promise.all(
    optionalPlates.map(async (file) => {
      try {
        const response = await fetch(`${base}${file}`, { method: 'HEAD' })
        if (response.ok && (response.headers.get('content-type') ?? '').startsWith('image/'))
          indexes.plates.add(file)
      } catch {
        // offline or blocked: stay on the stand-in
      }
    }),
  )
}

// resolves null when the file fails, so callers can fall back to a procedural stand-in
export function loadTexture(scene, url, { wrap = false } = {}) {
  return new Promise((resolve) => {
    const texture = new Texture(
      url,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(texture),
      () => resolve(null),
    )
    texture.anisotropicFilteringLevel = 8
    texture.wrapU = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE
    texture.wrapV = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE
  })
}
