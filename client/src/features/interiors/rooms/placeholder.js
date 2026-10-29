import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { Batch, rgb } from '../../hub/scenes/shared/geometry.js'
import { toonMaterial } from '../../hub/scenes/wharf/toon.js'

// a plain room in the game's palette until its own room module exists
export function buildPlaceholder({ scene }, { palette, light = [1, 0.85, 0.6] }) {
  const [top, bottom] = palette
  scene.clearColor = new Color4(0, 0, 0, 1)
  const hemi = new HemisphericLight('fill', new Vector3(0, 1, 0), scene)
  hemi.intensity = 0.7
  hemi.groundColor = new Color3(0.3, 0.26, 0.24)
  const lamp = new PointLight('lamp', new Vector3(0, 3, 0), scene)
  lamp.diffuse = new Color3(...light)
  lamp.intensity = 1.6
  lamp.range = 12
  const b = new Batch()
  b.box({ c: [0, 1.9, 4.5], s: [9, 3.8, 0.1], color: rgb(top, 1.1) })
  b.box({ c: [-4.5, 1.9, 0], s: [0.1, 3.8, 9], color: rgb(top, 0.9) })
  b.box({ c: [4.5, 1.9, 0], s: [0.1, 3.8, 9], color: rgb(top, 0.9) })
  b.box({ c: [0, -0.05, 0], s: [9, 0.1, 9], color: rgb(bottom, 2.2) })
  b.box({ c: [0, 3.85, 0], s: [9, 0.1, 9], color: rgb(bottom, 1.2) })
  b.box({ c: [0, 0.4, 3.9], s: [3, 0.8, 0.8], color: rgb(bottom, 3) })
  const material = toonMaterial(scene, 'placeholder-room', { twoSided: true })
  const mesh = b.build(scene, 'placeholder-room', material)
  return {
    camera: { pos: [0, 1.55, -3.6], target: [0, 1.45, 3], fov: 0.85, drift: [0.22, 0.06, 44] },
    update() {},
    dispose() {
      mesh.dispose()
      material.dispose()
    },
  }
}
