import { describe, expect, it } from 'vitest'
import { createRound } from '../../../src/modules/games/botnet-tag/rounds.js'
import { stepBot } from '../../../src/modules/games/botnet-tag/bots.js'
import { walkable } from '../../../src/modules/games/botnet-tag/arena.js'
import {
  BASE_SPEED,
  COUNTDOWN_MS,
  ROUND_MS,
  createRng,
} from '../../../src/modules/games/botnet-tag/rules.js'

const TICK = 1000 / 15

function playRound(seed) {
  const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(seed), withBots: true })
  round.join({ sid: 'h1', username: 'Human', avatarId: 'a', isStaff: false }, 0)
  round.setReady('h1', true, 0)
  let t = COUNTDOWN_MS
  round.tick(t)
  const start = t
  const seen = { maxStep: 0 }
  const last = new Map()
  while (round.phase === 'playing' && t - start <= ROUND_MS + 1000) {
    t += TICK
    round.tick(t)
    for (const p of round.players()) {
      const before = last.get(p.sid)
      if (before && p.isBot)
        seen.maxStep = Math.max(seen.maxStep, Math.hypot(p.x - before.x, p.z - before.z))
      expect(walkable(p.x, p.z)).toBe(true)
      last.set(p.sid, { x: p.x, z: p.z })
    }
  }
  return { round, elapsed: t - start, seen }
}

describe('bots', () => {
  it('ends a bot round within the round length, deterministically', () => {
    const a = playRound(11)
    const b = playRound(11)
    expect(a.round.phase).toBe('results')
    expect(a.elapsed).toBeLessThanOrEqual(ROUND_MS + TICK)
    expect(a.round.results()).toEqual(b.round.results())
    expect(a.round.results()).toHaveLength(3)
  })

  it('never moves faster than the base speed', () => {
    const { seen } = playRound(4)
    expect(seen.maxStep).toBeLessThanOrEqual((BASE_SPEED * 250 * 1.25) / 1000 + 0.5)
  })

  it('infected bots tag a nearby clean player', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(9), withBots: true })
    round.join({ sid: 'h1', username: 'Human', avatarId: 'a', isStaff: false }, 0)
    round.setReady('h1', true, 0)
    round.tick(COUNTDOWN_MS)
    const [human, botA, botB] = ['h1', 'bot-1', 'bot-2'].map((sid) => round.getPlayer(sid))
    for (const p of [human, botA, botB]) p.infected = false
    botA.infected = true
    botA.infectedAt = COUNTDOWN_MS
    Object.assign(botA, { x: 8, z: 0.0 })
    Object.assign(human, { x: 9, z: 0 })
    stepBot(round, botA, COUNTDOWN_MS + 100, createRng(1))
    expect(human.infected).toBe(true)
    expect(botA.tags).toBe(1)
  })

  it('clean bots run from an infected player and ignore bad rounds', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(9), withBots: true })
    round.join({ sid: 'h1', username: 'Human', avatarId: 'a', isStaff: false }, 0)
    round.setReady('h1', true, 0)
    round.tick(COUNTDOWN_MS)
    const [human, botA, botB] = ['h1', 'bot-1', 'bot-2'].map((sid) => round.getPlayer(sid))
    for (const p of [human, botA, botB]) p.infected = false
    human.infected = true
    Object.assign(human, { x: 5, z: 0 })
    Object.assign(botA, { x: 8, z: 0, lastMoveAt: COUNTDOWN_MS })
    stepBot(round, botA, COUNTDOWN_MS + 100, createRng(1))
    expect(botA.x).toBeGreaterThan(8)
    expect(() => stepBot(null, botA, 0, createRng(1))).not.toThrow()
    expect(() => stepBot(round, human, 0, createRng(1))).not.toThrow()
  })

  it('a bot walks to a station and patches it', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(3), withBots: true })
    round.join({ sid: 'h1', username: 'Human', avatarId: 'a', isStaff: false }, 0)
    round.setReady('h1', true, 0)
    round.tick(COUNTDOWN_MS)
    const players = round.players()
    for (const p of players) p.infected = false
    // park the human far from the bots so nothing is infected and bots only patch
    players.find((p) => p.sid === 'h1').infected = true
    Object.assign(
      players.find((p) => p.sid === 'h1'),
      { x: 21, z: 15 },
    )
    let t = COUNTDOWN_MS
    for (let i = 0; i < 15 * 120 && round.phase === 'playing'; i += 1) {
      t += TICK
      round.tick(t)
      for (const p of players.filter((q) => q.isBot)) p.infected = false
      if (players.some((p) => p.patches > 0)) break
    }
    expect(players.some((p) => p.isBot && p.patches > 0)).toBe(true)
  })
})
