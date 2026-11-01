import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BASE_SPEED } from '../arenaRules.js'
import { createLocalPlayer } from '../localPlayer.js'

// looking along +z from behind the player, so forward is +z
const camera = { target: { x: 0, z: 0 }, position: { x: 0, z: -10 } }

let player
function make(options = {}) {
  player = createLocalPlayer({
    spawn: { x: -8, z: 12 },
    camera,
    reduced: () => false,
    ...options,
  })
  return player
}
const press = (code, type = 'keydown') =>
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
const run = (seconds, server = null) => {
  let pose
  for (let t = 0; t < seconds; t += 1 / 60) pose = player.update(1 / 60, server)
  return pose
}

beforeEach(() => make())
afterEach(() => player.dispose())

describe('local player', () => {
  it('walks while a key is held and stops when it is released', () => {
    press('KeyD')
    const moved = run(0.5)
    expect(Math.hypot(moved.x + 8, moved.z - 12)).toBeGreaterThan(1)
    expect(moved.speed).toBeLessThanOrEqual(BASE_SPEED)
    press('KeyD', 'keyup')
    run(0.5)
    const rest = player.position()
    run(0.5)
    expect(player.position()).toEqual(rest)
  })

  it('drops held keys when the window loses focus', () => {
    press('KeyD')
    run(0.2)
    window.dispatchEvent(new Event('blur'))
    run(0.5)
    const rest = player.position()
    run(0.5)
    expect(player.position()).toEqual(rest)
  })

  it('takes no input while disabled and forgets what was held', () => {
    press('KeyD')
    player.setEnabled(false)
    run(0.5)
    expect(player.position()).toEqual({ x: -8, z: 12 })
    expect(player.sprint()).toBe(false)
    player.setEnabled(true)
    run(0.5)
    expect(player.position()).toEqual({ x: -8, z: 12 })
  })

  it('keeps moving across an arena rebuild without a new key press', () => {
    press('KeyD')
    player.setJoystick(0, 0.5)
    player.walkTo(4, 12)
    run(0.2)
    const input = player.inputState()
    const from = player.position()
    player.dispose()
    make({ spawn: from, input })
    expect(player.inputState()).toEqual(input)
    const moved = run(0.5)
    expect(Math.hypot(moved.x - from.x, moved.z - from.z)).toBeGreaterThan(1)
    // the new player owns the listeners, so the release still reaches it
    press('KeyD', 'keyup')
    expect(player.inputState().keys).toEqual([])
    player.setJoystick(0, 0)
    player.walkTo(null, null)
    run(0.5)
    const rest = player.position()
    run(0.5)
    expect(player.position()).toEqual(rest)
  })

  it('walks straight at a spot and stops there', () => {
    player.walkTo(-5, 12)
    run(2)
    const { x, z } = player.position()
    expect(Math.hypot(x + 5, z - 12)).toBeLessThan(0.5)
  })

  it('eases back to a server spot that disagrees', () => {
    player.setEnabled(false)
    run(1, { x: -10, z: 12 })
    expect(Math.hypot(player.position().x + 10, player.position().z - 12)).toBeLessThan(2)
  })

  it('snaps to its spawn on the first playing frame, even out of the pillar at the origin', () => {
    player.dispose()
    make({ spawn: { x: 0, z: 0 } })
    run(0.2)
    expect(player.position()).toEqual({ x: 0, z: 0 })
    player.update(1 / 60, { x: 0, z: 6 })
    expect(player.position()).toEqual({ x: 0, z: 6 })
  })

  it('snaps once per round, and a later gap eases', () => {
    player.update(1 / 60, { x: -8, z: 12 })
    player.update(1 / 60, { x: -10, z: 12 })
    expect(player.position().x).toBeGreaterThan(-10)
    expect(player.position().x).toBeLessThan(-8)
    player.update(1 / 60, null)
    player.update(1 / 60, { x: -12, z: 12 })
    expect(player.position()).toEqual({ x: -12, z: 12 })
  })

  it('does not snap again after an arena rebuild during play', () => {
    player.update(1 / 60, { x: -8, z: 12 })
    const input = player.inputState()
    player.dispose()
    make({ spawn: { x: -8, z: 12 }, input })
    player.update(1 / 60, { x: -10, z: 12 })
    expect(player.position().x).toBeGreaterThan(-10)
  })

  it('tells the caller when a sprint starts, once per cooldown', () => {
    const started = []
    player.dispose()
    make({ onSprint: () => started.push(true) })
    expect(player.sprint()).toBe(true)
    expect(player.sprint()).toBe(false)
    expect(started).toHaveLength(1)
  })

  it('stops listening once disposed', () => {
    player.dispose()
    press('KeyD')
    run(0.5)
    expect(player.position()).toEqual({ x: -8, z: 12 })
  })
})
