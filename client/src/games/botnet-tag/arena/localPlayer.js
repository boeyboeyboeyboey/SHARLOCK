import { isSprintKey } from '../../../features/hub/controls.js'
import { GRAVITY, JUMP_SPEED, createJump } from '../../../features/hub/scenes/shared/jump.js'
import { createSprint } from '../../../features/hub/scenes/shared/sprint.js'
import {
  BASE_SPEED,
  correctPosition,
  needsCorrection,
  slideStep,
  worldDirection,
} from './arenaRules.js'
import { walkable } from './arenaData.js'

const KEYS = {
  KeyW: 'f',
  ArrowUp: 'f',
  KeyS: 'b',
  ArrowDown: 'b',
  KeyA: 'l',
  ArrowLeft: 'l',
  KeyD: 'r',
  ArrowRight: 'r',
}
const typing = (target) =>
  target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)

// the hub player is welded to the wharf (havok capsule, lane graph, ground picking), so the arena gets a slim kinematic one:
// same keys, same sprint and jump modules, movement checked against the server's own walkable test
export function createLocalPlayer({ spawn, camera, reduced, onSprint = () => {} }) {
  const keys = new Set()
  const pos = { x: spawn.x, z: spawn.z }
  const pad = { x: 0, y: 0 }
  const sprint = createSprint()
  const jump = createJump()
  let enabled = true
  let heading = 0
  let curSpeed = 0
  let y = 0
  let vy = 0
  const lastDir = { x: 0, z: 1 }
  let sprintPhase = 'ready'

  const startSprint = () => {
    if (!enabled || !sprint.start()) return false
    onSprint()
    return true
  }
  const onKey = (event, isDown) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      if (isDown && isSprintKey(event)) startSprint()
      return
    }
    if (event.code === 'Space') {
      if (!isDown || event.repeat || !enabled) return
      if (
        event.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(event.target.tagName)
      )
        return
      event.preventDefault()
      jump.request()
      return
    }
    const key = KEYS[event.code]
    if (!key || typing(event.target)) return
    if (isDown) {
      keys.add(key)
      if (enabled) event.preventDefault()
    } else keys.delete(key)
  }
  const down = (event) => onKey(event, true)
  const up = (event) => onKey(event, false)
  const blur = () => keys.clear()
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)

  function update(dt, server) {
    const top = BASE_SPEED * sprint.multiplier()
    sprintPhase = sprint.state()
    const ix = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + pad.x
    const iy = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + pad.y
    const manual = enabled && (Math.abs(ix) > 0.05 || Math.abs(iy) > 0.05)
    let dx = 0
    let dz = 0
    if (manual) {
      const len = Math.max(1, Math.hypot(ix, iy))
      const fx = camera.target.x - camera.position.x
      const fz = camera.target.z - camera.position.z
      const fl = Math.hypot(fx, fz) || 1
      const dir = worldDirection(ix / len, iy / len, { x: fx / fl, z: fz / fl })
      dx = dir.x
      dz = dir.z
    }
    const moving = dx !== 0 || dz !== 0
    let diff = 0
    if (moving) {
      lastDir.x = dx / Math.hypot(dx, dz)
      lastDir.z = dz / Math.hypot(dx, dz)
      diff = Math.atan2(dx, dz) - heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
    }
    // slow while the body is still swinging round so it never slides sideways
    const aligned = moving ? 0.45 + 0.55 * Math.max(0, Math.cos(diff)) : 1
    const wanted = moving ? top * Math.min(1, Math.hypot(dx, dz)) * aligned : 0
    const rate = (wanted > curSpeed ? 60 : 150) * dt
    curSpeed += Math.max(-rate, Math.min(rate, wanted - curSpeed))
    const step = slideStep(pos, lastDir.x, lastDir.z, curSpeed * dt)
    const moved = Math.hypot(step.x - pos.x, step.z - pos.z)
    pos.x = step.x
    pos.z = step.z
    if (curSpeed > 0.05 && moved < curSpeed * dt * 0.1) curSpeed = Math.max(0, curSpeed - rate)

    // the server only knows x and z, so the hop is a visual height on top
    const supported = y <= 0.001 && vy <= 0
    const air = jump.step(dt, { supported, calm: reduced(), enabled })
    if (air.launch) vy = JUMP_SPEED
    else if (air.grounded) vy = 0
    else vy -= GRAVITY * dt
    y = Math.max(0, y + vy * dt)

    // a rejected move: the snapshot spot is far from here, so ease back to it
    if (server && needsCorrection(pos, server)) {
      const fixed = correctPosition(pos, server, dt)
      if (walkable(fixed.x, fixed.z)) {
        pos.x = fixed.x
        pos.z = fixed.z
      }
    }

    const before = heading
    if (moving) heading += diff * (1 - Math.exp(-dt * 10))
    return {
      x: pos.x,
      y,
      z: pos.z,
      yaw: heading,
      speed: curSpeed,
      topSpeed: top,
      moving: moving && curSpeed > 0.2,
      turn: dt > 0 ? (heading - before) / dt : 0,
      lead: moving ? diff : 0,
      jump: air,
    }
  }

  return {
    update,
    jump: () => enabled && jump.request(),
    sprint: startSprint,
    sprintState: () => ({ phase: sprintPhase, left: sprint.cooldownLeft() }),
    setJoystick(x, yv) {
      pad.x = x
      pad.y = yv
    },
    setEnabled(value) {
      enabled = Boolean(value)
      if (!enabled) {
        keys.clear()
        pad.x = 0
        pad.y = 0
      }
    },
    teleport(x, z) {
      pos.x = x
      pos.z = z
      curSpeed = 0
    },
    position: () => ({ x: pos.x, z: pos.z }),
    dispose() {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    },
  }
}
