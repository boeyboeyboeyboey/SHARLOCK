import { Constants } from '@babylonjs/core/Engines/constants.js'
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Plane } from '@babylonjs/core/Maths/math.plane.js'

// half resolution planar reflection of a short render list, for a horizontal plane at the given height
export function createPlanarMirror(
  scene,
  { name = 'mirror', y = 0, ratio = 0.5, list = [], blur = 0 } = {},
) {
  const mirror = new MirrorTexture(
    name,
    { ratio },
    scene,
    true,
    Constants.TEXTURETYPE_HALF_FLOAT,
    Texture.TRILINEAR_SAMPLINGMODE,
    true,
  )
  mirror.mirrorPlane = new Plane(0, -1, 0, y)
  mirror.renderList = list
  mirror.level = 1
  if (blur) {
    mirror.blurKernelX = blur
    mirror.blurKernelY = blur
    mirror.blurRatio = 0.5
  }
  return mirror
}
