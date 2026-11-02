import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'

// follow camera shared by every walkable scene; the player module drives the target
export function createFollowCamera({
  scene,
  canvas,
  spawn,
  alpha = -Math.PI / 2,
  beta = 1,
  radius = 24,
  fov = 0.9,
  far = 800,
  lookY = 1.2,
  limits = {},
}) {
  const camera = new ArcRotateCamera(
    'follow',
    alpha,
    beta,
    radius,
    new Vector3(spawn.x, lookY, spawn.z),
    scene,
  )
  camera.minZ = 0.3
  camera.maxZ = far
  camera.fov = fov
  camera.lowerRadiusLimit = limits.radius?.[0] ?? 6
  camera.upperRadiusLimit = limits.radius?.[1] ?? 36
  camera.lowerBetaLimit = limits.beta?.[0] ?? 0.55
  camera.upperBetaLimit = limits.beta?.[1] ?? 1.38
  // no alpha limits: the camera orbits a full turn
  camera.panningSensibility = 0
  camera.wheelDeltaPercentage = 0.012
  camera.pinchDeltaPercentage = 0.01
  camera.angularSensibilityX = 1400
  camera.angularSensibilityY = 1400
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput')
  camera.attachControl(canvas, true)
  scene.activeCamera = camera
  return camera
}

// debug helper that frees every limit so evidence shots can park the camera anywhere
export function freeCamera(camera, alpha, beta, radius, target) {
  camera.lowerRadiusLimit = 1
  camera.upperRadiusLimit = 400
  camera.lowerAlphaLimit = null
  camera.upperAlphaLimit = null
  camera.lowerBetaLimit = 0.01
  camera.upperBetaLimit = 1.55
  camera.alpha = alpha
  camera.beta = beta
  camera.radius = radius
  if (target) camera.target.set(target[0], target[1], target[2])
}
