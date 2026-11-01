import { describe, expect, it } from 'vitest'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js'
import { Scene } from '@babylonjs/core/scene.js'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { applyToon } from '../scenes/wharf/toon.js'

// the toon look is injected by a regex on babylon's generated shader; a pinned version bump that rewords that line
// would otherwise give a flat, untoned world with no error. this reads the pinned sources, it renders nothing
const require = createRequire(import.meta.url)
const shader = (path) =>
  readFileSync(require.resolve(`@babylonjs/core/${path}`), 'utf8')
    // the pinned files hold the shader as one js string with escaped line ends
    .replaceAll('\\n', '\n')

function patterns(language) {
  const scene = new Scene(new NullEngine())
  const plugin = applyToon(new StandardMaterial('m', scene))
  const code = plugin.getCustomCode('fragment', language)
  scene.getEngine().dispose()
  return Object.keys(code).filter((key) => key.startsWith('!'))
}

describe('toon shader patch against the pinned babylon', () => {
  it.each([
    ['WGSL (the webgpu path)', ShaderLanguage.WGSL, 'ShadersWGSL/default.fragment.js'],
    ['GLSL (the webgl2 path)', ShaderLanguage.GLSL, 'Shaders/default.fragment.js'],
  ])('%s still finds its line', (_name, language, file) => {
    const source = shader(file)
    const keys = patterns(language)
    expect(keys).toHaveLength(1)
    expect(new RegExp(keys[0].slice(1)).test(source)).toBe(true)
  })
})
