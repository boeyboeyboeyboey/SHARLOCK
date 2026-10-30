import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameCatalog } from '../../../data/gameCatalog.js'
import { createTownWalk, doorPoint, SPAWN } from '../townWalk.js'
import { useTownWalker } from '../useTownWalker.js'

let queue
let clock
beforeEach(() => {
  queue = []
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (callback) => queue.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

// runs queued frames at 60 fps for the given seconds
function run(seconds) {
  for (let i = 0; i < seconds * 60 && queue.length; i++) {
    clock += 1000 / 60
    queue.splice(0).forEach((callback) => callback(clock))
  }
}
const press = (walker, code) => walker.keyDown({ code })
const walk = createTownWalk(gameCatalog)

describe('town walker', () => {
  it('walks at about 120 px/s while a key is held and faces that way', () => {
    const walker = useTownWalker({ walk, now: () => clock })
    press(walker, 'KeyD')
    run(1)
    expect(walker.x.value - SPAWN.x).toBeGreaterThan(110)
    expect(walker.x.value - SPAWN.x).toBeLessThan(130)
    expect(walker.facing.value).toBe('right')
    expect(walker.moving.value).toBe(true)
    walker.keyUp({ code: 'KeyD' })
    run(0.1)
    expect(walker.moving.value).toBe(false)
    expect(walker.frame.value).toBe(0)
    walker.dispose()
  })

  it('moves a little on a tap that ends before the next frame', () => {
    const walker = useTownWalker({ walk, now: () => clock })
    press(walker, 'ArrowUp')
    walker.keyUp({ code: 'ArrowUp' })
    run(0.1)
    expect(walker.y.value).toBeLessThan(SPAWN.y)
    walker.dispose()
  })

  it('sprints at 1.6x for a burst and ignores a second burst while cooling', () => {
    const walker = useTownWalker({ walk, now: () => clock })
    walker.startSprint()
    expect(walker.sprintState.value).toBe('active')
    press(walker, 'KeyD')
    run(1)
    expect(walker.x.value - SPAWN.x).toBeGreaterThan(180)
    run(2)
    expect(walker.sprintState.value).toBe('cooldown')
    walker.dispose()
  })

  it('keeps a single still frame under reduced motion', () => {
    const walker = useTownWalker({ walk, reducedMotion: () => true, now: () => clock })
    press(walker, 'KeyD')
    run(0.5)
    expect(walker.moving.value).toBe(true)
    expect(walker.frame.value).toBe(0)
    walker.dispose()
  })

  it('walks to a tapped point in a straight line, stopping on arrival', () => {
    const walker = useTownWalker({ walk, now: () => clock })
    walker.walkTo(SPAWN.x + 60, SPAWN.y)
    run(2)
    expect(walker.x.value).toBeCloseTo(SPAWN.x + 60, 0)
    expect(walker.moving.value).toBe(false)
    walker.dispose()
  })

  it('slides along the fountain and reports the door once there', () => {
    const walker = useTownWalker({ walk, now: () => clock })
    walker.walkTo(560, 720)
    run(3)
    expect(walk.walkable(walker.x.value, walker.y.value)).toBe(true)
    const door = doorPoint(gameCatalog[0])
    walker.placeAt(door.x, door.y + 6)
    expect(walker.doorGame.value.id).toBe(gameCatalog[0].id)
    walker.dispose()
  })
})
