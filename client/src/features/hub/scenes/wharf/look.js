import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Scene } from '@babylonjs/core/scene.js'
import { toSun } from './layout.js'

export const hazeColor = new Color3(1.0, 0.72, 0.52)

// golden hour: low warm sun with long cascaded shadows, cool violet fill, light warm haze, bloom on the bright things
export function setupLook({ scene, camera, tier }) {
  scene.clearColor = new Color4(1, 0.78, 0.55, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.0042
  scene.fogColor = hazeColor

  const hemi = new HemisphericLight('violet-fill', new Vector3(0, 1, 0), scene)
  hemi.intensity = 0.62
  hemi.diffuse = new Color3(0.62, 0.58, 0.98)
  hemi.groundColor = new Color3(0.62, 0.42, 0.36)
  hemi.specular = new Color3(0, 0, 0)

  // warm bounce from the south, lifting the faces that look at the camera out of the shade band
  const bounce = new DirectionalLight('bounce', new Vector3(-0.1, -0.45, 0.88).normalize(), scene)
  bounce.intensity = 0.55
  bounce.diffuse = new Color3(1.0, 0.6, 0.38)
  bounce.specular = new Color3(0, 0, 0)

  const sun = new DirectionalLight('sun', toSun.scale(-1), scene)
  sun.intensity = 4.2
  sun.diffuse = new Color3(1.0, 0.82, 0.58)
  sun.specular = new Color3(0, 0, 0)
  sun.shadowEnabled = tier.shadowSize > 0
  sun.position = new Vector3(0, 80, 40).add(toSun.scale(60))
  sun.autoUpdateExtends = true

  // the low tier draws no shadows, so its generator is an inert stand in
  const csm =
    tier.shadowSize > 0
      ? new CascadedShadowGenerator(tier.shadowSize, sun)
      : { addShadowCaster() {}, dispose() {} }
  if (tier.shadowSize > 0) {
    csm.numCascades = tier.cascades
    csm.lambda = 0.7
    csm.shadowMaxZ = 130
    csm.stabilizeCascades = true
    csm.autoCalcDepthBounds = false
    csm.bias = 0.004
    csm.normalBias = 0.04
    csm.darkness = 0.0
    csm.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM
    csm.usePercentageCloserFiltering = true
    csm.transparencyShadow = false
    csm.cascadeBlendPercentage = 0.1
  }

  const pipeline = new DefaultRenderingPipeline('grade', true, scene, [camera])
  // the low tier keeps only the grade and tone mapping pass
  pipeline.bloomEnabled = tier.post
  pipeline.bloomThreshold = 1.15
  pipeline.bloomWeight = tier.desktop ? 0.45 : 0.34
  pipeline.bloomKernel = tier.bloomKernel
  pipeline.bloomScale = 0.5
  pipeline.fxaaEnabled = tier.post
  pipeline.imageProcessingEnabled = true
  const ip = pipeline.imageProcessing
  ip.toneMappingEnabled = true
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
  ip.exposure = 1.1
  ip.contrast = 1.12
  const curves = new ColorCurves()
  curves.globalSaturation = 8
  curves.highlightsHue = 36
  curves.highlightsDensity = 18
  curves.highlightsSaturation = 22
  curves.shadowsHue = 268
  curves.shadowsDensity = 22
  curves.shadowsSaturation = 20
  ip.colorCurves = curves
  ip.colorCurvesEnabled = true
  ip.vignetteEnabled = true
  ip.vignetteWeight = 1.3
  ip.vignetteStretch = 0.15
  ip.vignetteColor = new Color4(0.28, 0.1, 0.22, 0)
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY

  return {
    sun,
    hemi,
    bounce,
    csm,
    pipeline,
    cast(meshes) {
      for (const mesh of meshes) csm.addShadowCaster(mesh)
    },
    dispose() {
      pipeline.dispose()
      csm.dispose()
      sun.dispose()
      bounce.dispose()
      hemi.dispose()
    },
  }
}
