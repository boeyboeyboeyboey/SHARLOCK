import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js'
import { CustomParticleEmitter } from '@babylonjs/core/Particles/EmitterTypes/customParticleEmitter.js'
import '@babylonjs/core/Particles/particleSystemComponent.js'
import { rng } from './random.js'

// noise puff: a cluster of soft blobs so each smoke billboard has a ragged outline
export function puffTexture(scene, seed = 404) {
  const texture = new DynamicTexture('puff', 128, scene, true)
  const ctx = texture.getContext()
  const rand = rng(seed)
  for (let i = 0; i < 16; i += 1) {
    const x = 64 + (rand() - 0.5) * 56
    const y = 64 + (rand() - 0.5) * 56
    const r = 14 + rand() * 24
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.34)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  }
  texture.update()
  texture.hasAlpha = true
  return texture
}

// smoke or steam rising from a list of points (or from a moving emitter node when points is null)
export function makeSmoke(
  scene,
  {
    name,
    texture,
    points = null,
    emitter = null,
    rate = 20,
    capacity = 160,
    color1,
    color2,
    life = [2.2, 4],
    size = [0.5, 1.1],
    grow = 3.2,
    power = [0.5, 1.1],
    wind = [0.35, 0.15, 0.1],
  },
) {
  const system = new ParticleSystem(name, capacity, scene)
  system.particleTexture = texture
  system.emitter = emitter ?? new Vector3(0, 0, 0)
  if (points) {
    const custom = new CustomParticleEmitter()
    custom.particlePositionGenerator = (index, particle, out) => {
      const p = points[Math.floor(Math.random() * points.length)]
      out.set(p[0] + (Math.random() - 0.5) * 0.2, p[1], p[2] + (Math.random() - 0.5) * 0.2)
    }
    custom.particleDestinationGenerator = (index, particle, out) =>
      out.set((Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3)
    system.particleEmitterType = custom
  } else {
    system.createPointEmitter(new Vector3(-0.15, 1, -0.1), new Vector3(0.15, 1, 0.1))
  }
  system.minEmitPower = power[0]
  system.maxEmitPower = power[1]
  system.minLifeTime = life[0]
  system.maxLifeTime = life[1]
  system.emitRate = rate
  system.minSize = size[0]
  system.maxSize = size[1]
  system.addSizeGradient(0, 0.5)
  system.addSizeGradient(1, grow)
  system.color1 = color1
  system.color2 = color2
  system.colorDead = new Color4(color1.r, color1.g, color1.b, 0)
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD
  system.gravity = new Vector3(...wind)
  system.minAngularSpeed = -0.5
  system.maxAngularSpeed = 0.5
  system.updateSpeed = 0.016
  system.start()
  return system
}
