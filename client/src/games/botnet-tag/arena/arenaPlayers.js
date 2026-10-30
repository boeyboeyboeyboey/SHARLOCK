import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { rigOptionsFor } from '../../../data/wardrobeLook.js'
import {
  createCapybaraRig,
  createCapybaraStatic,
  furStyles,
} from '../../../features/hub/scenes/shared/capybara.js'
import { applyToon } from '../../../features/hub/scenes/wharf/toon.js'
import { approachPeer } from '../../../features/hub/presence/rules.js'
import { BASE_SPEED } from './arenaRules.js'

const SIZE = 1.25
export const LABEL_HEIGHT = 2.3
const INFECTED = new Color3(0.55, 1, 0.5)
const INFECTED_GLOW = new Color3(0.08, 0.34, 0.06)

const additive = (scene, name, color, alpha) => {
  const m = new StandardMaterial(name, scene)
  m.disableLighting = true
  m.emissiveColor = color
  m.diffuseColor = Color3.Black()
  m.specularColor = Color3.Black()
  m.alpha = alpha
  m.alphaMode = 1
  m.disableDepthWrite = true
  return m
}

// bodies for the local player and everyone else: animated rigs, or static meshes on the low tier for remotes
export function createPlayers({ scene, tier, reduced, shadow }) {
  const entries = new Map()
  const toon = (m) => applyToon(m, { rimGain: 1.1 })

  const auraMat = additive(scene, 'tag-aura', new Color3(0.4, 1, 0.3), 0.07)
  const immMat = additive(scene, 'tag-immune', Color3.White(), 0.7)
  immMat.emissiveFresnelParameters = new FresnelParameters({
    bias: 0,
    power: 3.2,
    leftColor: Color3.Black(),
    rightColor: new Color3(0.35, 0.85, 1),
  })
  const ringTex = new DynamicTexture('tag-immune-ring', { width: 128, height: 128 }, scene, true)
  {
    const g = ringTex.getContext()
    const r = g.createRadialGradient(64, 64, 34, 64, 64, 62)
    r.addColorStop(0, 'rgba(120,230,255,0)')
    r.addColorStop(0.55, 'rgba(120,230,255,.95)')
    r.addColorStop(0.7, 'rgba(120,230,255,.5)')
    r.addColorStop(1, 'rgba(120,230,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
    ringTex.update()
    ringTex.hasAlpha = true
  }
  const ringMat = additive(scene, 'tag-immune-ring', Color3.White(), 1)
  ringMat.diffuseTexture = ringTex
  ringMat.opacityTexture = ringTex
  ringMat.emissiveTexture = ringTex

  function build(player, isMe, look) {
    const options = rigOptionsFor(look)
    const root = new TransformNode(`tag-${player.sid}`, scene)
    let rig = null
    let mesh = null
    if (isMe || tier.npcRigs) {
      rig = createCapybaraRig(scene, {
        name: `tag-${player.sid}`,
        size: SIZE,
        reduced,
        toon,
        idleSeed: 5 + entries.size * 3,
        ...options,
      })
      rig.node.parent = root
      for (const m of rig.meshes) m.receiveShadows = Boolean(shadow)
      if (shadow)
        for (const m of rig.casters) if (/-(torso|head)$/.test(m.name)) shadow.addShadowCaster(m)
    } else {
      mesh = createCapybaraStatic(scene, {
        style: {
          ...furStyles.sharlock,
          ...(options.scarfColor ? { scarf: options.scarfColor } : {}),
        },
        cap: options.capColor,
        name: `tag-${player.sid}`,
        toon,
      })
      mesh.scaling.setAll(SIZE)
      mesh.parent = root
    }
    return {
      sid: player.sid,
      isMe,
      root,
      rig,
      mesh,
      x: player.x,
      z: player.z,
      yaw: player.yaw ?? 0,
      target: { x: player.x, z: player.z, yaw: player.yaw ?? 0 },
      server: { x: player.x, z: player.z },
      speed: 0,
      moving: false,
      username: player.username ?? '',
      infected: false,
      immune: false,
      isBot: Boolean(player.isBot),
      staff: Boolean(player.isStaff),
      tinted: false,
      fx: null,
      stash: new Map(),
    }
  }

  function materialsOf(entry) {
    const out = new Set()
    for (const m of entry.rig ? entry.rig.meshes : [entry.mesh]) if (m.material) out.add(m.material)
    return out
  }

  function tint(entry, on) {
    if (entry.tinted === on) return
    entry.tinted = on
    for (const material of materialsOf(entry)) {
      if (!material.diffuseColor || material.disableLighting) continue
      if (!entry.stash.has(material))
        entry.stash.set(material, {
          d: material.diffuseColor.clone(),
          e: material.emissiveColor?.clone(),
        })
      const orig = entry.stash.get(material)
      material.diffuseColor = on ? INFECTED : orig.d
      material.emissiveColor = on ? INFECTED_GLOW : (orig.e ?? Color3.Black())
    }
  }

  // glow shapes are made the first time a player needs them
  function effects(entry) {
    if (entry.fx) return entry.fx
    const aura = CreateSphere('tag-aura', { diameter: 1.9, segments: 10 }, scene)
    aura.parent = entry.root
    aura.position.y = 0.8
    aura.scaling.z = 1.6
    aura.material = auraMat
    aura.isPickable = false
    const shell = CreateSphere('tag-shell', { diameter: 2.1, segments: 16 }, scene)
    shell.parent = entry.root
    shell.position.y = 0.9
    shell.scaling.z = 1.5
    shell.material = immMat
    shell.isPickable = false
    const ring = CreateDisc('tag-ring', { radius: 1.35, tessellation: 32 }, scene)
    ring.rotation.x = Math.PI / 2
    ring.parent = entry.root
    ring.position.y = 0.06
    ring.material = ringMat
    ring.isPickable = false
    for (const m of [aura, shell, ring]) m.setEnabled(false)
    entry.fx = { aura, shell, ring }
    return entry.fx
  }

  function drop(entry) {
    entry.fx?.aura.dispose()
    entry.fx?.shell.dispose()
    entry.fx?.ring.dispose()
    if (entry.rig) entry.rig.dispose()
    else entry.mesh.dispose()
    entry.root.dispose()
    entries.delete(entry.sid)
  }

  return {
    entries,
    // list is the snapshot players, serverNow the server clock in ms, wardrobe the local equipped items
    sync(list, meSid, serverNow, wardrobe) {
      const seen = new Set()
      for (const player of list) {
        if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) continue
        seen.add(player.sid)
        const isMe = player.sid === meSid
        let entry = entries.get(player.sid)
        if (!entry) {
          entry = build(player, isMe, isMe ? wardrobe : player.look)
          entries.set(player.sid, entry)
        }
        entry.username = player.username ?? entry.username
        entry.isBot = Boolean(player.isBot)
        entry.staff = Boolean(player.isStaff)
        entry.server = { x: player.x, z: player.z }
        if (!isMe) entry.target = { x: player.x, z: player.z, yaw: player.yaw ?? 0 }
        const infected = Boolean(player.infected)
        const immune = !infected && (player.immuneUntil ?? 0) > serverNow
        tint(entry, infected)
        if (infected !== entry.infected || immune !== entry.immune) {
          const fx = effects(entry)
          fx.aura.setEnabled(infected)
          fx.shell.setEnabled(immune)
          fx.ring.setEnabled(immune)
        }
        entry.infected = infected
        entry.immune = immune
      }
      for (const entry of [...entries.values()]) if (!seen.has(entry.sid)) drop(entry)
    },
    // everyone but the local player eases toward the last snapshot
    update(dt, t) {
      for (const entry of entries.values()) {
        if (!entry.isMe) {
          const px = entry.x
          const pz = entry.z
          approachPeer(entry, dt)
          entry.root.position.set(entry.x, 0, entry.z)
          entry.root.rotation.y = entry.yaw
          const v = dt > 0 ? Math.hypot(entry.x - px, entry.z - pz) / dt : 0
          entry.speed += (v - entry.speed) * Math.min(1, dt * 12)
          entry.moving = entry.speed > 0.6
          entry.rig?.update(dt, entry.moving ? entry.speed : 0, BASE_SPEED, {
            active: entry.moving,
          })
        }
        if (entry.fx && entry.immune && !reduced()) {
          entry.fx.ring.scaling.setAll(1 + Math.sin(t * 4) * 0.06)
          entry.fx.ring.rotation.y = t * 0.8
        }
      }
    },
    setLocal(entry, pose, dt) {
      entry.x = pose.x
      entry.z = pose.z
      entry.root.position.set(pose.x, pose.y, pose.z)
      entry.root.rotation.y = pose.yaw
      entry.rig?.update(dt, pose.speed, pose.topSpeed, {
        turn: pose.turn,
        lead: pose.lead,
        active: pose.moving || pose.jump.active,
        jump: pose.jump,
      })
    },
    // world spots the name labels hang from
    anchors() {
      return [...entries.values()].map((e) => ({
        key: e.sid,
        sid: e.sid,
        text: e.username,
        x: e.x,
        y: LABEL_HEIGHT,
        z: e.z,
        infected: e.infected,
        isBot: e.isBot,
        isMe: e.isMe,
        staff: e.staff,
      }))
    },
    dispose() {
      for (const entry of [...entries.values()]) drop(entry)
      auraMat.dispose()
      immMat.dispose()
      ringMat.dispose()
      ringTex.dispose()
    },
  }
}
