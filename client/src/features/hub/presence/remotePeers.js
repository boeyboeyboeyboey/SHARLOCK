import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { rigOptionsFor } from '../../../data/wardrobeLook.js'
import { createCapybaraRig, createCapybaraStatic, furStyles } from '../scenes/shared/capybara.js'
import { heightAt } from '../scenes/wharf/layout.js'
import { applyToon } from '../scenes/wharf/toon.js'
import { MAX_DRAWN, approachPeer, pickDrawn } from './rules.js'

const SIZE = 1.4
const LABEL_HEIGHT = 2.1
const WALK_SPEED = 3.2

// classmates as ghosts: no colliders, animated rigs on the desktop tier and static meshes elsewhere
export function createRemotePeers({
  scene,
  camera,
  engine,
  canvas,
  tier,
  reduced,
  look,
  getPlayer,
}) {
  const toon = (m) => applyToon(m, { rimGain: 1.1 })
  const drawn = new Map()
  const clip = Matrix.Identity()

  function build(peer) {
    const options = rigOptionsFor(peer.look)
    const root = new TransformNode(`peer-${peer.sid}`, scene)
    let rig = null
    let mesh = null
    if (tier.npcRigs) {
      rig = createCapybaraRig(scene, {
        name: `peer-${peer.sid}`,
        size: SIZE,
        reduced,
        toon,
        idleSeed: 5 + drawn.size * 3,
        ...options,
      })
      rig.node.parent = root
      for (const m of rig.meshes) m.receiveShadows = true
      for (const m of rig.casters) if (/-(torso|head)$/.test(m.name)) look.csm.addShadowCaster(m)
    } else {
      const style = {
        ...furStyles.sharlock,
        ...(options.scarfColor ? { scarf: options.scarfColor } : {}),
      }
      mesh = createCapybaraStatic(scene, {
        style,
        cap: options.capColor,
        name: `peer-${peer.sid}`,
        toon,
      })
      mesh.scaling.setAll(SIZE)
      mesh.parent = root
    }
    root.position.set(peer.x, heightAt(peer.x, peer.z), peer.z)
    root.rotation.y = peer.yaw
    return {
      sid: peer.sid,
      username: peer.username,
      staff: peer.role === 'staff',
      x: peer.x,
      z: peer.z,
      yaw: peer.yaw,
      target: { x: peer.x, z: peer.z, yaw: peer.yaw },
      moving: false,
      root,
      rig,
      mesh,
    }
  }

  function drop(entry) {
    if (entry.rig) entry.rig.dispose()
    else entry.mesh.dispose()
    entry.root.dispose()
    drawn.delete(entry.sid)
  }

  function set(map) {
    const all = [...map.values()].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
    const repick =
      all.length > MAX_DRAWN || all.length !== drawn.size || all.some((p) => !drawn.has(p.sid))
    if (repick) {
      const chosen = pickDrawn(all, getPlayer() ?? { x: 0, z: 0 }, MAX_DRAWN)
      const keep = new Set(chosen.map((p) => p.sid))
      for (const entry of [...drawn.values()]) if (!keep.has(entry.sid)) drop(entry)
      for (const peer of chosen) if (!drawn.has(peer.sid)) drawn.set(peer.sid, build(peer))
    }
    for (const entry of drawn.values()) {
      const peer = map.get(entry.sid)
      if (!peer) continue
      entry.target = { x: peer.x, z: peer.z, yaw: peer.yaw }
      entry.moving = Boolean(peer.moving)
    }
  }

  function update(dt) {
    for (const entry of drawn.values()) {
      approachPeer(entry, dt)
      entry.root.position.set(entry.x, heightAt(entry.x, entry.z), entry.z)
      entry.root.rotation.y = entry.yaw
      entry.rig?.update(dt, entry.moving ? WALK_SPEED : 0, 4.4, { active: entry.moving })
    }
  }

  // css pixel spots for the name labels; peers behind the camera or off screen are left out
  function labels() {
    if (!drawn.size) return []
    const w = engine.getRenderWidth()
    const h = engine.getRenderHeight()
    if (!w || !h) return []
    const viewport = camera.viewport.toGlobal(w, h)
    const toCss = canvas.clientWidth / w
    const out = []
    for (const e of drawn.values()) {
      const p = Vector3.Project(
        new Vector3(e.x, heightAt(e.x, e.z) + LABEL_HEIGHT, e.z),
        clip,
        scene.getTransformMatrix(),
        viewport,
      )
      if (p.z < 0 || p.z > 1) continue
      const x = p.x * toCss
      const y = p.y * toCss
      if (x < 0 || y < 0 || x > canvas.clientWidth || y > canvas.clientHeight) continue
      out.push({ sid: e.sid, username: e.username, staff: e.staff, x, y })
    }
    return out
  }

  return {
    set,
    update,
    labels,
    list: () =>
      [...drawn.values()].map((e) => ({
        username: e.username,
        x: Math.round(e.target.x * 100) / 100,
        z: Math.round(e.target.z * 100) / 100,
      })),
    dispose() {
      for (const entry of [...drawn.values()]) drop(entry)
    },
  }
}
