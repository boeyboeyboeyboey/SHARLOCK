import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { toSun } from './layout.js'

// soft three band lighting: cool violet shade, peach mid, golden light, plus a warm rim on edges that face the sun
export const toonLook = {
  shade: [0.56, 0.5, 0.74],
  mid: [0.82, 0.72, 0.82],
  lit: [1.1, 0.97, 0.78],
  rim: [0.9, 0.55, 0.28],
  t1: 0.3,
  t2: 0.84,
  soft: 0.07,
}

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(4)))
const v3 = (a, wgsl) => `${wgsl ? 'vec3f' : 'vec3'}(${f(a[0])},${f(a[1])},${f(a[2])})`

function code(options, wgsl) {
  const { shade, mid, lit, rim, t1, t2, soft } = options
  const sun = [toSun.x, toSun.y, toSun.z]
  const rimGain = f(options.rimGain ?? 1)
  if (wgsl) {
    return `fn toonShade(lit: vec3f, dc: vec3f, em: vec3f, amb: vec3f, n: vec3f, v: vec3f, wp: vec3f) -> vec3f {
  var level: f32 = dot(lit, vec3f(0.3, 0.59, 0.11));
  level = level + sin(wp.x * 2.3 + wp.y * 1.7) * sin(wp.z * 2.1 - wp.y * 1.3) * 0.05 + sin(wp.x * 7.0 + wp.z * 5.0) * 0.012;
  let s1: f32 = smoothstep(${f(t1 - soft)}, ${f(t1 + soft)}, level);
  let s2: f32 = smoothstep(${f(t2 - soft)}, ${f(t2 + soft)}, level);
  var col: vec3f = mix(${v3(shade, true)}, ${v3(mid, true)}, s1);
  col = mix(col, ${v3(lit, true)}, s2);
  let edge: f32 = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
  let toward: f32 = clamp(dot(n, ${v3(sun, true)}) * 0.6 + 0.4, 0.0, 1.0);
  col = col + ${v3(rim, true)} * smoothstep(0.35, 0.8, edge) * toward * ${rimGain};
  return col * dc + em + amb;
}`
  }
  return `vec3 toonShade(vec3 lit, vec3 dc, vec3 em, vec3 amb, vec3 n, vec3 v, vec3 wp) {
  float level = dot(lit, vec3(0.3, 0.59, 0.11));
  level += sin(wp.x * 2.3 + wp.y * 1.7) * sin(wp.z * 2.1 - wp.y * 1.3) * 0.05 + sin(wp.x * 7.0 + wp.z * 5.0) * 0.012;
  float s1 = smoothstep(${f(t1 - soft)}, ${f(t1 + soft)}, level);
  float s2 = smoothstep(${f(t2 - soft)}, ${f(t2 + soft)}, level);
  vec3 col = mix(${v3(shade)}, ${v3(mid)}, s1);
  col = mix(col, ${v3(lit)}, s2);
  float edge = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
  float toward = clamp(dot(n, ${v3(sun)}) * 0.6 + 0.4, 0.0, 1.0);
  col += ${v3(rim)} * smoothstep(0.35, 0.8, edge) * toward * ${rimGain};
  return col * dc + em + amb;
}`
}

// the base class asks for shader code while it is still constructing, so the options travel through a module variable
let pending = toonLook

class ToonPlugin extends MaterialPluginBase {
  constructor(material, options) {
    pending = { ...toonLook, ...options }
    super(material, 'Toon', 250, {}, true, true)
    this.options = pending
  }

  getClassName() {
    return 'ToonPlugin'
  }

  isCompatible() {
    return true
  }

  getCustomCode(shaderType, shaderLanguage) {
    if (shaderType !== 'fragment') return null
    const wgsl = shaderLanguage === ShaderLanguage.WGSL
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: code(this.options ?? pending, true),
          '!clamp\\(diffuseBase\\*diffuseColor\\+emissiveColor\\+uniforms\\.vAmbientColor,vec3f\\(0\\.0\\),vec3f\\(1\\.0\\)\\)':
            'toonShade(diffuseBase,diffuseColor,emissiveColor,uniforms.vAmbientColor,normalW,viewDirectionW,fragmentInputs.vPositionW)',
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: code(this.options ?? pending, false),
          '!clamp\\(diffuseBase\\*diffuseColor\\+emissiveColor\\+vAmbientColor,0\\.0,1\\.0\\)':
            'toonShade(diffuseBase,diffuseColor,emissiveColor,vAmbientColor,normalW,viewDirectionW,vPositionW)',
        }
  }
}

// puts the three band look on any standard material (used for the sharlock stand-in)
export function applyToon(material, options = {}) {
  return new ToonPlugin(material, options)
}

// shared recipe for every lit surface in the wharf; vertex colours tint the texture so a district merges into a few draws
export function toonMaterial(
  scene,
  name,
  { texture = null, twoSided = false, options = {}, emissive = null } = {},
) {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.maxSimultaneousLights = 3
  if (texture) material.diffuseTexture = texture
  if (twoSided) {
    material.backFaceCulling = false
    material.twoSidedLighting = true
  }
  if (emissive) material.emissiveColor = emissive
  new ToonPlugin(material, options)
  return material
}

// flat unlit material for windows, lamp heads, decals and sky. emissive colour (kept at 1 or below) acts as a dimmer,
// vertex or instance colours carry the hdr gain for bloom
export function glowMaterial(
  scene,
  name,
  {
    texture = null,
    color = new Color3(1, 1, 1),
    alphaMode = null,
    fog = true,
    backFaceCulling = true,
  } = {},
) {
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.emissiveColor = color
  if (texture) {
    material.diffuseTexture = texture
    if (texture.hasAlpha) material.useAlphaFromDiffuseTexture = true
  }
  material.backFaceCulling = backFaceCulling
  material.fogEnabled = fog
  if (alphaMode !== null) material.alphaMode = alphaMode
  return material
}
