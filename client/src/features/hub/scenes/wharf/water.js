import { NodeMaterial } from '@babylonjs/core/Materials/Node/nodeMaterial.js'
import { InputBlock } from '@babylonjs/core/Materials/Node/Blocks/Input/inputBlock.js'
import { VertexOutputBlock } from '@babylonjs/core/Materials/Node/Blocks/Vertex/vertexOutputBlock.js'
import { FragmentOutputBlock } from '@babylonjs/core/Materials/Node/Blocks/Fragment/fragmentOutputBlock.js'
import { TransformBlock } from '@babylonjs/core/Materials/Node/Blocks/transformBlock.js'
import { VectorSplitterBlock } from '@babylonjs/core/Materials/Node/Blocks/vectorSplitterBlock.js'
import { VectorMergerBlock } from '@babylonjs/core/Materials/Node/Blocks/vectorMergerBlock.js'
import { FresnelBlock } from '@babylonjs/core/Materials/Node/Blocks/fresnelBlock.js'
import { ViewDirectionBlock } from '@babylonjs/core/Materials/Node/Blocks/viewDirectionBlock.js'
import { DistanceBlock } from '@babylonjs/core/Materials/Node/Blocks/distanceBlock.js'
import { TextureBlock } from '@babylonjs/core/Materials/Node/Blocks/Dual/textureBlock.js'
import { NodeMaterialBlockConnectionPointTypes as T } from '@babylonjs/core/Materials/Node/Enums/nodeMaterialBlockConnectionPointTypes.js'
import { NodeMaterialBlockTargets } from '@babylonjs/core/Materials/Node/Enums/nodeMaterialBlockTargets.js'
import { NodeMaterialSystemValues } from '@babylonjs/core/Materials/Node/Enums/nodeMaterialSystemValues.js'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js'
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import {
  add,
  cos,
  divide,
  dot,
  lerp,
  max,
  mul,
  normalize,
  num,
  power,
  scale,
  sin,
  smooth,
  sub,
  uniform,
  vec3,
} from '../shared/nodes.js'
import { quayZ, toSun, waterY } from './layout.js'

export const waterClock = { time: 0 }

// node material output skips the standard materials' gamma handling, so colours are authored in gamma space and converted here
const color3 = (name, hex) => {
  const block = new InputBlock(name, undefined, T.Color3)
  block.value = Color3.FromHexString(hex).toLinearSpace()
  block.isConstant = true
  return block.output
}

// painterly thames: teal green body, warm reflected sky at grazing angles, toon glitter that gathers into a golden path toward the sun
export function createWaterMaterial(scene, { mirror = null } = {}) {
  const material = new NodeMaterial('thames', scene)

  const position = new InputBlock('position')
  position.setAsAttribute('position')
  const world = new InputBlock('world')
  world.setAsSystemValue(NodeMaterialSystemValues.World)
  const viewProjection = new InputBlock('viewProjection')
  viewProjection.setAsSystemValue(NodeMaterialSystemValues.ViewProjection)
  const camera = new InputBlock('cameraPosition')
  camera.setAsSystemValue(NodeMaterialSystemValues.CameraPosition)
  const time = uniform('time', 0)

  const worldPos = new TransformBlock('worldPos')
  position.output.connectTo(worldPos.vector)
  world.output.connectTo(worldPos.transform)
  worldPos.target = NodeMaterialBlockTargets.Vertex
  const clip = new TransformBlock('clip')
  worldPos.output.connectTo(clip.vector)
  viewProjection.output.connectTo(clip.transform)
  const vertexOut = new VertexOutputBlock('vertexOut')
  clip.output.connectTo(vertexOut.vector)

  const split = new VectorSplitterBlock('split')
  worldPos.xyz.connectTo(split.xyzIn)
  const x = split.x
  const z = split.z
  const t = time.output

  // crossing swells, each contributes a slope along its own direction
  const waves = [
    [0.97, 0.24, 11.0, 0.045, 0.5],
    [-0.6, 0.8, 6.3, 0.05, 0.7],
    [0.3, 0.95, 3.9, 0.06, 0.95],
    [0.85, -0.5, 2.6, 0.06, 1.2],
    [-0.9, -0.4, 1.9, 0.055, 1.5],
    [0.15, -0.99, 1.35, 0.05, 1.8],
    [-0.45, 0.89, 0.95, 0.04, 2.1],
    [0.7, 0.71, 0.7, 0.035, 2.4],
  ]
  // a slow shared warp bends every wave phase, so the pattern never repeats on a grid
  const warp = add(
    scale(
      sin(
        add(add(scale(x, num('wpx', 0.21)), scale(z, num('wpz', 0.17))), scale(t, num('wpt', 0.2))),
      ),
      num('wpa', 1.6),
    ),
    scale(cos(sub(scale(x, num('wqx', 0.13)), scale(z, num('wqz', 0.19)))), num('wqa', 1.3)),
  )
  let slopeX = null
  let slopeZ = null
  waves.forEach(([dx, dz, length, amp, speed], i) => {
    const k = (Math.PI * 2) / length
    const arg = add(
      add(
        add(scale(x, num(`kx${i}`, dx * k)), scale(z, num(`kz${i}`, dz * k))),
        scale(t, num(`w${i}`, speed)),
      ),
      warp,
    )
    const c = scale(cos(arg), num(`a${i}`, amp))
    const sx = scale(c, num(`dx${i}`, dx))
    const sz = scale(c, num(`dz${i}`, dz))
    slopeX = slopeX ? add(slopeX, sx) : sx
    slopeZ = slopeZ ? add(slopeZ, sz) : sz
  })
  const normalMerge = new VectorMergerBlock('normal')
  scale(slopeX, num('nx', -1)).connectTo(normalMerge.x)
  num('ny', 1).connectTo(normalMerge.y)
  scale(slopeZ, num('nz', -1)).connectTo(normalMerge.z)
  const normal = normalize(normalMerge.xyzOut)

  const viewDir = new ViewDirectionBlock('viewDir')
  worldPos.output.connectTo(viewDir.worldPosition)
  camera.output.connectTo(viewDir.cameraPosition)
  const viewSplit = new VectorSplitterBlock('viewSplit')
  viewDir.output.connectTo(viewSplit.xyzIn)

  // glitter: sun half vector against the swell normals, in thresholded toon steps
  const half = normalize(add(viewDir.output, vec3('toSun', [toSun.x, toSun.y, toSun.z])))
  const ndh = dot(normal, half)
  const broad = scale(power(max(ndh, num('zero', 0)), num('shine', 300)), num('broadK', 1.0))
  const sparkle = scale(smooth(ndh, num('sp0', 0.9972), num('sp1', 0.9992)), num('spK', 7))

  // a wider golden lane under the sun: view azimuth against the sun azimuth, broken up by drifting stripes
  const sunH = Math.hypot(toSun.x, toSun.z)
  const flat = new VectorMergerBlock('flat')
  scale(viewSplit.x, num('fx', -1)).connectTo(flat.x)
  num('fy', 0).connectTo(flat.y)
  scale(viewSplit.z, num('fz', -1)).connectTo(flat.z)
  const align = dot(normalize(flat.xyzOut), vec3('sunFlat', [toSun.x / sunH, 0, toSun.z / sunH]))
  const lane = smooth(align, num('l0', 0.9935), num('l1', 0.9996))
  // three unrelated drifting sines summed give an irregular shimmer instead of a lattice
  const ripple = (kx, kz, w, i) =>
    sin(
      add(
        add(scale(x, num(`rx${i}`, kx)), scale(z, num(`rz${i}`, kz))),
        scale(t, num(`rw${i}`, w)),
      ),
    )
  const shimmer = add(
    add(ripple(1.31, 0.77, 1.1, 0), scale(ripple(-0.83, 1.97, -1.4, 1), num('r1k', 0.8))),
    scale(ripple(2.9, -1.3, 1.9, 2), num('r2k', 0.55)),
  )
  const stripes = add(num('sBase', 0.5), scale(shimmer, num('sAmp', 0.21)))
  const laneGlow = scale(
    mul(lane, smooth(stripes, num('s0', 0.38), num('s1', 0.8))),
    num('laneK', 0.75),
  )

  // body colour and reflected sky
  const patch = add(
    num('patchBase', 0.5),
    scale(
      sin(
        add(add(scale(x, num('px', 0.045)), scale(z, num('pz', 0.03))), scale(t, num('pt', 0.05))),
      ),
      num('patchAmp', 0.5),
    ),
  )
  const body = lerp(color3('deep', '#136a62'), color3('mid', '#2f9a88'), patch)
  const skyRefl = lerp(
    color3('skyLow', '#ffb36c'),
    color3('skyHigh', '#9a8ccf'),
    smooth(viewSplit.y, num('v0', 0.05), num('v1', 0.55)),
  )
  const up = new InputBlock('up', undefined, T.Vector4)
  up.value = new Vector4(0, 1, 0, 0)
  up.isConstant = true
  const fresnel = new FresnelBlock('fresnel')
  up.output.connectTo(fresnel.worldNormal)
  viewDir.output.connectTo(fresnel.viewDirection)
  num('bias', 0.04).connectTo(fresnel.bias)
  num('power', 3.4).connectTo(fresnel.power)
  const reflectK = add(num('rBase', 0.12), scale(fresnel.fresnel, num('rK', 0.78)))
  let color = lerp(body, skyRefl, reflectK)

  // planar reflection of boats, bridge and skyline, sampled in screen space and wobbled by the swell
  if (mirror) {
    // the perspective divide must happen per pixel, so this block is pinned to the fragment stage
    const clipFrag = new TransformBlock('clipFrag')
    clipFrag.target = NodeMaterialBlockTargets.Fragment
    worldPos.output.connectTo(clipFrag.vector)
    viewProjection.output.connectTo(clipFrag.transform)
    const cs = new VectorSplitterBlock('clipSplit')
    clipFrag.output.connectTo(cs.xyzw)
    const inv = divide(num('one', 1), cs.w)
    const u = add(scale(scale(cs.x, inv), num('half', 0.5)), num('halfAdd', 0.5))
    const vRaw = add(scale(scale(cs.y, inv), num('half2', 0.5)), num('halfAdd2', 0.5))
    const uv = new VectorMergerBlock('mirrorUv')
    add(u, scale(slopeX, num('dist1', 0.22))).connectTo(uv.x)
    add(vRaw, scale(slopeZ, num('dist2', 0.22))).connectTo(uv.y)
    const sample = new TextureBlock('mirrorSample')
    sample.texture = mirror
    uv.xyOut.connectTo(sample.uv)
    const strength = scale(
      mul(sample.a, add(num('mBase', 0.3), scale(fresnel.fresnel, num('mK', 0.7)))),
      num('mGain', 0.85),
    )
    color = lerp(color, sample.rgb, strength)
  }

  // soft toon foam against the quay wall
  const dz = sub(z, num('quay', quayZ))
  const wobble = add(
    scale(sin(add(scale(x, num('wx', 1.7)), t)), num('wa', 0.07)),
    scale(sin(add(scale(x, num('wx2', 0.55)), scale(t, num('wt2', -0.7)))), num('wb', 0.14)),
  )
  const edge = sub(num('one2', 1), smooth(add(dz, wobble), num('f0', 0.1), num('f1', 1.4)))
  const rings = mul(
    smooth(
      sin(
        add(sub(scale(dz, num('rk', 5.5)), scale(t, num('rt', 1.2))), scale(wobble, num('rw', 6))),
      ),
      num('r0', 0.55),
      num('r1', 0.92),
    ),
    sub(num('one3', 1), smooth(dz, num('r2', 0.4), num('r3', 3.2))),
  )
  const foam = max(edge, scale(rings, num('ringK', 0.55)))
  color = lerp(color, color3('foam', '#fff3dc'), scale(foam, num('foamK', 1.0)))

  // sun glitter on top, then fade into the horizon haze with distance
  const gold = color3('gold', '#ffd98a')
  color = add(
    color,
    add(scale(gold, add(broad, laneGlow)), scale(color3('white', '#fff6dc'), sparkle)),
  )
  const far = new DistanceBlock('far')
  worldPos.xyz.connectTo(far.left)
  camera.output.connectTo(far.right)
  const fade = smooth(far.output, num('fade0', 170), num('fade1', 480))
  const haze = lerp(
    color3('haze', '#f4b27c'),
    color3('hazeSun', '#ffd9a0'),
    smooth(align, num('h0', 0.6), num('h1', 1)),
  )
  color = lerp(color, haze, fade)

  const fragmentOut = new FragmentOutputBlock('fragmentOut')
  color.connectTo(fragmentOut.rgb)
  num('alpha', 1).connectTo(fragmentOut.a)

  material.addOutputNode(vertexOut)
  material.addOutputNode(fragmentOut)
  material.backFaceCulling = false
  material.fogEnabled = false
  material.shaderLanguage = scene.getEngine().isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL
  material.build(false)
  const sync = scene.onBeforeRenderObservable.add(() => {
    time.value = waterClock.time
  })
  material.onDisposeObservable.add(() => scene.onBeforeRenderObservable.remove(sync))
  return material
}

export function createWater(scene, options) {
  // two triangles are enough, the swell only shapes the shading
  const mesh = CreateGround('thames', { width: 2400, height: 1000, subdivisions: 1 }, scene)
  mesh.position.set(0, waterY, quayZ - 0.4 + 500)
  mesh.material = createWaterMaterial(scene, options)
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  // sorted first among the blended meshes, so foam decals and plates draw over it
  mesh.alphaIndex = 0
  return mesh
}
