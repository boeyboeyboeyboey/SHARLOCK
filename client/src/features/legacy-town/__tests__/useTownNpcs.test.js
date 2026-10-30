import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { townNpcs } from '../townNpcs.js'
import { useTownNpcs } from '../useTownNpcs.js'

let queue
let clock
beforeEach(() => {
  queue = []
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (callback) => queue.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

function run(seconds) {
  for (let i = 0; i < seconds * 60; i++) {
    clock += 1000 / 60
    queue.splice(0).forEach((callback) => callback(clock))
  }
}
const sweeper = (npcs) => npcs.list.value.find((npc) => npc.id === 'street-sweeper')
const far = () => ({ x: 0, y: 0 })

describe('town wanderers', () => {
  it('walk their route, and keepers never move', () => {
    const npcs = useTownNpcs({ npcs: townNpcs, target: far })
    npcs.start()
    const keeper = npcs.list.value.find((npc) => npc.id === 'publican')
    const before = { x: keeper.x, y: keeper.y }
    run(8)
    expect(sweeper(npcs).y).toBeGreaterThan(330)
    expect(npcs.list.value.find((npc) => npc.id === 'publican')).toMatchObject(before)
    npcs.dispose()
  })

  it('stand still under reduced motion and while paused', () => {
    for (const options of [{ reducedMotion: () => true }, { paused: () => true }]) {
      const npcs = useTownNpcs({ npcs: townNpcs, target: far, ...options })
      npcs.start()
      run(8)
      expect(sweeper(npcs)).toMatchObject({ x: 500, y: 330 })
      npcs.dispose()
    }
  })

  it('stop and face sharlock when he is near', () => {
    const npcs = useTownNpcs({ npcs: townNpcs, target: () => ({ x: 540, y: 335 }) })
    npcs.start()
    run(8)
    expect(sweeper(npcs)).toMatchObject({ x: 500, y: 330, facing: 'right' })
    npcs.dispose()
  })
})
