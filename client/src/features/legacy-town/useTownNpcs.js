import { ref } from 'vue'
import { NEAR_PAUSE, WANDER_SPEED } from './townNpcs.js'

const FRAME_SECONDS = 0.3

// moves the wanderers along their routes; they stand still under reduced motion, while paused and when sharlock is close
export function useTownNpcs({ npcs, target, paused = () => false, reducedMotion = () => false }) {
  const list = ref(
    npcs.map((npc) => ({ id: npc.id, x: npc.x, y: npc.y, facing: npc.facing, frame: 0 })),
  )
  const runtime = npcs.map((npc, index) => ({
    route: npc.route,
    stop: 1,
    wait: index % 3,
    anim: 0,
    pause: npc.pause,
  }))
  let raf = null
  let last = null

  function tick(t) {
    raf = null
    const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.05)
    last = t
    if (!paused() && !reducedMotion()) {
      const player = target()
      list.value.forEach((npc, index) => {
        const run = runtime[index]
        if (run.route.length < 2) return
        const dx = player.x - npc.x
        const dy = player.y - npc.y
        if (Math.hypot(dx, dy) < NEAR_PAUSE) {
          npc.facing = dx < 0 ? 'left' : 'right'
          npc.frame = 0
          return
        }
        if (run.wait > 0) {
          run.wait -= dt
          npc.frame = 0
          return
        }
        const [tx, ty] = run.route[run.stop]
        const distance = Math.hypot(tx - npc.x, ty - npc.y)
        const step = Math.min(WANDER_SPEED * dt, distance)
        if (distance > 0.5) {
          npc.x += ((tx - npc.x) / distance) * step
          npc.y += ((ty - npc.y) / distance) * step
          if (Math.abs(tx - npc.x) > 0.5) npc.facing = tx < npc.x ? 'left' : 'right'
          run.anim += dt
          npc.frame = 1 + (Math.floor(run.anim / FRAME_SECONDS) % 2)
        } else {
          run.stop = (run.stop + 1) % run.route.length
          run.wait = run.pause
          npc.frame = 0
        }
      })
    }
    raf = requestAnimationFrame(tick)
  }
  function start() {
    if (raf === null) raf = requestAnimationFrame(tick)
  }
  function dispose() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }
  return { list, start, dispose }
}
