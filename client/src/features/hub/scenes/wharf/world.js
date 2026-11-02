import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Batch } from '../shared/geometry.js'
import { toonMaterial, glowMaterial } from './toon.js'
import {
  brickTexture,
  cobbleTexture,
  hazeTexture,
  plankTexture,
  slateTexture,
  stoneTexture,
  washTexture,
  windowTexture,
} from './textures.js'

// every static surface goes into one batch per material, so the whole district is a handful of draws
export function createWorld(scene, { signs }) {
  const textures = {
    brickRed: brickTexture(scene, 'brick-red', {
      bricks: [
        [188, 82, 60],
        [170, 66, 50],
        [201, 98, 70],
        [158, 72, 58],
      ],
      mortar: [236, 214, 184],
    }),
    brickYellow: brickTexture(scene, 'brick-yellow', {
      bricks: [
        [214, 168, 96],
        [200, 154, 88],
        [224, 182, 112],
        [190, 146, 90],
      ],
      mortar: [240, 226, 196],
    }),
    stone: stoneTexture(scene),
    slate: slateTexture(scene),
    cobble: cobbleTexture(scene),
    plank: plankTexture(scene),
    wash: washTexture(scene),
    signs: signs.texture,
    windowLit: windowTexture(scene, 'window-lit', true),
    windowDark: windowTexture(scene, 'window-dark', false),
  }
  // tower bridge stands far down the river: its own washed, low contrast surfaces give it aerial perspective
  const haze = [255, 200, 156]
  textures.bridgeStone = hazeTexture(scene, textures.stone, 'bridge-stone', haze, 0.64)
  textures.bridgeWash = hazeTexture(scene, textures.wash, 'bridge-wash', haze, 0.62)
  textures.bridgePlank = hazeTexture(scene, textures.plank, 'bridge-plank', haze, 0.66)
  textures.bridgeSlate = hazeTexture(scene, textures.slate, 'bridge-slate', haze, 0.62)
  const far = {
    shade: [0.76, 0.68, 0.82],
    mid: [0.9, 0.8, 0.84],
    lit: [1.04, 0.93, 0.8],
    rimGain: 0.5,
    soft: 0.14,
  }
  const lift = new Color3(0.14, 0.09, 0.06)
  const materials = {
    brickRed: toonMaterial(scene, 'brick-red', { texture: textures.brickRed }),
    brickYellow: toonMaterial(scene, 'brick-yellow', { texture: textures.brickYellow }),
    stone: toonMaterial(scene, 'stone', { texture: textures.stone }),
    slate: toonMaterial(scene, 'slate', { texture: textures.slate, options: { rimGain: 1.3 } }),
    cobble: toonMaterial(scene, 'cobble', { texture: textures.cobble, options: { rimGain: 0.4 } }),
    plank: toonMaterial(scene, 'plank', { texture: textures.plank }),
    wash: toonMaterial(scene, 'wash', { texture: textures.wash }),
    bridgeStone: toonMaterial(scene, 'bridge-stone', {
      texture: textures.bridgeStone,
      options: far,
      emissive: lift,
    }),
    bridgeWash: toonMaterial(scene, 'bridge-wash', {
      texture: textures.bridgeWash,
      options: far,
      emissive: lift,
    }),
    bridgePlank: toonMaterial(scene, 'bridge-plank', {
      texture: textures.bridgePlank,
      options: far,
      emissive: lift,
    }),
    bridgeSlate: toonMaterial(scene, 'bridge-slate', {
      texture: textures.bridgeSlate,
      options: far,
      emissive: lift,
    }),
    cloth: toonMaterial(scene, 'cloth', { texture: textures.wash, twoSided: true }),
    signs: toonMaterial(scene, 'signs', { texture: signs.texture, options: { rimGain: 0.3 } }),
    windowLit: glowMaterial(scene, 'window-lit', { texture: textures.windowLit }),
    windowDark: glowMaterial(scene, 'window-dark', {
      texture: textures.windowDark,
      color: new Color3(0.9, 0.9, 0.95),
    }),
  }
  const uvScale = {
    brickRed: 2,
    brickYellow: 2,
    stone: 2,
    slate: 2,
    cobble: 4,
    plank: 2,
    wash: 4,
    cloth: 4,
    bridgeStone: 2,
    bridgeWash: 4,
    bridgePlank: 2,
    bridgeSlate: 2,
  }
  const batches = {}
  for (const key of Object.keys(uvScale)) batches[key] = new Batch({ worldUv: uvScale[key] })
  batches.signs = new Batch()
  batches.windowLit = new Batch()
  batches.windowDark = new Batch()

  return {
    textures,
    materials,
    batches,
    // inflated boxes { min, max } of the buildings and tall props, for the camera spring arm
    blockers: [],
    // builds one mesh per non empty batch. ground only receives shadows, glass never casts them
    finish() {
      const meshes = []
      const casters = []
      for (const [key, batch] of Object.entries(batches)) {
        if (!batch.vertexCount) continue
        const mesh = batch.build(scene, `static-${key}`, materials[key])
        mesh.alwaysSelectAsActiveMesh = true
        mesh.receiveShadows = !key.startsWith('window')
        mesh.freezeWorldMatrix()
        mesh.doNotSyncBoundingInfo = true
        meshes.push(mesh)
        if (key !== 'cobble' && !key.startsWith('window')) casters.push(mesh)
      }
      return { meshes, casters }
    },
    dispose() {
      for (const material of Object.values(materials)) material.dispose()
      for (const texture of Object.values(textures)) texture.dispose()
    },
  }
}
