import { ref } from 'vue'
import { createSprint } from '../hub/scenes/shared/sprint.js'
import { SPAWN, WALK_SPEED } from './townWalk.js'

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}
const FRAME_SECONDS = 0.16

// frame loop for sharlock in the 2d town; afterMove lets the camera ease and says if it needs more frames
export function useTownWalker({
  walk,
  reducedMotion = () => false,
  now = () => performance.now(),
  afterMove = () => false,
} = {}) {
  const x = ref(SPAWN.x)
  const y = ref(SPAWN.y)
  const facing = ref('down')
  const moving = ref(false)
  const frame = ref(0)
  const sprintState = ref('ready')
  const doorGame = ref(null)
  const held = new Set()
  // keys pressed and released between two frames still count for one step
  const tapped = new Set()
  const sprint = createSprint({ now })
  let target = null
  let raf = null
  let last = null
  let animTime = 0

  function refreshDoor() {
    const game = walk.doorAt({ x: x.value, y: y.value })
    if (game?.id !== doorGame.value?.id) doorGame.value = game
  }

  function ensureLoop() {
    if (raf === null) raf = requestAnimationFrame(tick)
  }

  function tick(t) {
    raf = null
    const dt = last === null ? 1 / 60 : Math.min((t - last) / 1000, 0.05)
    last = t
    let vx = 0
    let vy = 0
    const dirs = new Set([...held, ...tapped])
    tapped.clear()
    if (dirs.size) {
      target = null
      vx = Number(dirs.has('right')) - Number(dirs.has('left'))
      vy = Number(dirs.has('down')) - Number(dirs.has('up'))
      const length = Math.hypot(vx, vy)
      if (length) {
        vx /= length
        vy /= length
      }
    } else if (target) {
      const dx = target.x - x.value
      const dy = target.y - y.value
      const distance = Math.hypot(dx, dy)
      if (distance < 1) target = null
      else {
        vx = dx / distance
        vy = dy / distance
      }
    }
    let moved = false
    if (vx || vy) {
      if (Math.abs(vx) > Math.abs(vy)) facing.value = vx < 0 ? 'left' : 'right'
      else facing.value = vy < 0 ? 'up' : 'down'
      let step = WALK_SPEED * sprint.multiplier(t) * dt
      if (target) step = Math.min(step, Math.hypot(target.x - x.value, target.y - y.value))
      if (step > 0) {
        const next = walk.slide(
          { x: x.value, y: y.value },
          { x: x.value + vx * step, y: y.value + vy * step },
        )
        moved = Math.hypot(next.x - x.value, next.y - y.value) > 0.01
        if (moved) {
          x.value = next.x
          y.value = next.y
        } else target = null
      }
    }
    moving.value = moved
    if (moved && !reducedMotion()) {
      animTime += dt
      frame.value = 1 + (Math.floor(animTime / FRAME_SECONDS) % 2)
    } else frame.value = 0
    sprintState.value = sprint.state(t)
    refreshDoor()
    const cameraBusy = afterMove(dt, moved)
    if (held.size || target || cameraBusy) raf = requestAnimationFrame(tick)
    else last = null
  }

  // true when the key was a movement key and has been taken
  function keyDown(event) {
    const direction = KEYS[event.code]
    if (!direction || event.ctrlKey || event.metaKey || event.altKey) return false
    held.add(direction)
    tapped.add(direction)
    ensureLoop()
    return true
  }
  function keyUp(event) {
    const direction = KEYS[event.code]
    if (direction) held.delete(direction)
  }
  function clearKeys() {
    held.clear()
    tapped.clear()
  }
  function startSprint() {
    if (sprint.start()) {
      sprintState.value = 'active'
      ensureLoop()
    }
  }
  function walkTo(px, py) {
    target = { x: px, y: py }
    ensureLoop()
  }
  function placeAt(px, py) {
    target = null
    x.value = px
    y.value = py
    refreshDoor()
  }
  function dispose() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
    held.clear()
    tapped.clear()
    target = null
  }

  return {
    x,
    y,
    facing,
    moving,
    frame,
    sprintState,
    doorGame,
    keyDown,
    keyUp,
    clearKeys,
    startSprint,
    walkTo,
    placeAt,
    ensureLoop,
    dispose,
  }
}
