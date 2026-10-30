import { describe, expect, it } from 'vitest'
import { createRound } from '../../../src/modules/games/botnet-tag/rounds.js'
import { stationById } from '../../../src/modules/games/botnet-tag/arena.js'
import { submissionFor } from '../../../src/modules/games/botnet-tag/puzzles.js'
import {
  COUNTDOWN_MS,
  IMMUNITY_MS,
  MAX_PLAYERS,
  RESULTS_MS,
  ROUND_MS,
  STATION_COOLDOWN_MS,
  STATION_LOCKOUT_MS,
  createRng,
} from '../../../src/modules/games/botnet-tag/rules.js'

const person = (n, extra = {}) => ({
  sid: 's' + n,
  username: 'User ' + n,
  avatarId: 'a' + n,
  isStaff: false,
  ...extra,
})

function lobby(count, options = {}) {
  const round = createRound({ id: 'r1', cohortId: 'c1', now: 0, rng: createRng(5), ...options })
  for (let i = 1; i <= count; i += 1) round.join(person(i), 0)
  return round
}

function startPlay(count = 3, options = {}) {
  const round = lobby(count, options)
  for (let i = 1; i <= count; i += 1) round.setReady('s' + i, true, 0)
  round.tick(COUNTDOWN_MS)
  return round
}

// puts a player somewhere without going through the speed check
const place = (round, sid, x, z) => Object.assign(round.getPlayer(sid), { x, z, lastMoveAt: null })

function setup() {
  const round = startPlay(3)
  const [a, b, c] = ['s1', 's2', 's3'].map((sid) => round.getPlayer(sid))
  for (const p of [a, b, c]) p.infected = false
  a.infected = true
  a.infectedAt = COUNTDOWN_MS
  return { round, a, b, c }
}

describe('lobby', () => {
  it('caps at eight and only joins in the lobby', () => {
    const round = lobby(MAX_PLAYERS)
    expect(round.join(person(9), 0)).toEqual({ ok: false, reason: 'full' })
    expect(round.join(person(1), 0).reason).toBe('duplicate')
    expect(round.join({ sid: '', username: 'x' }, 0).ok).toBe(false)
    expect(round.join(null, 0).ok).toBe(false)
    const playing = startPlay(3)
    expect(playing.join(person(7), COUNTDOWN_MS).reason).toBe('not_lobby')
  })

  it('needs three ready players to count down', () => {
    const round = lobby(2)
    round.setReady('s1', true, 0)
    round.setReady('s2', true, 0)
    expect(round.phase).toBe('lobby')
    round.join(person(3), 0)
    expect(round.phase).toBe('lobby')
    round.setReady('s3', true, 0)
    expect(round.phase).toBe('countdown')
    round.setReady('s3', false, 100)
    expect(round.phase).toBe('lobby')
  })

  it('fills bots once a human is ready, and ignores bad input', () => {
    const round = lobby(1, { withBots: true })
    expect(round.size).toBe(1)
    round.setReady('s1', true, 0)
    expect(round.size).toBe(3)
    expect(round.phase).toBe('countdown')
    const bots = round.players().filter((p) => p.isBot)
    expect(bots.map((b) => b.sid)).toEqual(['bot-1', 'bot-2'])
    expect(bots[0].username).toMatch(/^Bot /)
    expect(round.setReady('nobody', true, 0)).toBe(false)
    expect(round.setReady('s1', 'yes', 0)).toBe(false)
    expect(round.move('nobody', { x: 0, z: 0 }, 0).ok).toBe(false)
    expect(round.tag('nobody', 's1', 0).ok).toBe(false)
    expect(round.stationStart(undefined, 'st-hash', 0).ok).toBe(false)
  })

  it('does not start with bots disabled and two humans', () => {
    const round = lobby(2)
    round.setReady('s1', true, 0)
    round.setReady('s2', true, 0)
    expect(round.size).toBe(2)
    expect(round.phase).toBe('lobby')
  })
})

describe('starting a round', () => {
  it('spawns players and picks one patient zero (two from seven)', () => {
    const small = startPlay(3)
    expect(small.phase).toBe('playing')
    expect(small.players().filter((p) => p.infected)).toHaveLength(1)
    const spawns = new Set(small.players().map((p) => p.x + ',' + p.z))
    expect(spawns.size).toBe(3)
    const big = startPlay(7)
    expect(big.players().filter((p) => p.infected)).toHaveLength(2)
  })

  it('only moves during play and enforces the speed limit', () => {
    const round = lobby(3)
    expect(round.move('s1', { x: 1, z: 1 }, 0).reason).toBe('not_playing')
    const p = startPlay(3)
    const me = p.getPlayer('s1')
    const t = COUNTDOWN_MS + 100
    expect(p.move('s1', { x: me.x + 0.5, z: me.z, yaw: 1 }, t).ok).toBe(true)
    expect(me.yaw).toBe(1)
    expect(p.move('s1', { x: me.x + 15, z: me.z }, t + 100).ok).toBe(false)
  })

  it('limits sprint by cooldown', () => {
    const round = startPlay(3)
    const t = COUNTDOWN_MS
    expect(round.sprint('s1', t).ok).toBe(true)
    expect(round.sprint('s1', t + 3000).reason).toBe('cooldown')
    expect(round.sprint('s1', t + 8500).ok).toBe(true)
    expect(round.getPlayer('s1').sprintStartedAt).toBe(t + 8500)
  })
})

describe('tag flow', () => {
  it('infects a clean target in reach and counts the tag', () => {
    const { round, a, b } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    expect(round.tag('s2', 's1', COUNTDOWN_MS + 1).ok).toBe(false)
    expect(round.tag('s1', 's2', COUNTDOWN_MS + 1).ok).toBe(true)
    expect(b.infected).toBe(true)
    expect(a.tags).toBe(1)
    expect(round.tag('s1', 's2', COUNTDOWN_MS + 2).ok).toBe(false)
    expect(round.drainEvents().some((e) => e.type === 'tag')).toBe(true)
  })

  it('refuses a far or immune target', () => {
    const { round, b } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 14, 0)
    expect(round.tag('s1', 's2', COUNTDOWN_MS).ok).toBe(false)
    place(round, 's2', 9, 0)
    b.immuneUntil = COUNTDOWN_MS + 5000
    expect(round.tag('s1', 's2', COUNTDOWN_MS).ok).toBe(false)
    expect(round.tag('s1', 's2', COUNTDOWN_MS + 5000).ok).toBe(true)
  })
})

describe('station flow', () => {
  const T0 = COUNTDOWN_MS
  const station = stationById('st-hash')

  it('starts a puzzle only in reach, clean, and one at a time', () => {
    const { round } = setup()
    place(round, 's2', station.x, station.z)
    place(round, 's3', 0, -5)
    expect(round.stationStart('s3', 'st-hash', T0).reason).toBe('too_far')
    expect(round.stationStart('s2', 'st-nope', T0).reason).toBe('unknown_station')
    place(round, 's1', station.x, station.z)
    expect(round.stationStart('s1', 'st-hash', T0).reason).toBe('infected')
    const started = round.stationStart('s2', 'st-hash', T0)
    expect(started.ok).toBe(true)
    expect(started.puzzle.kind).toBe('hash')
    expect(started.puzzle.deadline).toBeGreaterThan(T0)
    expect(round.stationStart('s2', 'st-hash', T0 + 1).reason).toBe('busy')
  })

  it('grants immunity and cools the station on a right answer', () => {
    const { round, b, c } = setup()
    place(round, 's2', station.x, station.z)
    place(round, 's3', station.x, station.z)
    round.stationStart('s2', 'st-hash', T0)
    const answer = round.players().length && round.botSubmit
    expect(answer).toBeTypeOf('function')
    const done = submitRight(round, 's2', T0 + 2000)
    expect(done.ok).toBe(true)
    expect(b.immuneUntil).toBe(T0 + 2000 + IMMUNITY_MS)
    expect(b.patches).toBe(1)
    expect(round.stationList().find((s) => s.id === 'st-hash').coolingUntil).toBe(
      T0 + 2000 + STATION_COOLDOWN_MS,
    )
    expect(round.stationStart('s3', 'st-hash', T0 + 3000).reason).toBe('cooling')
    expect(round.stationStart('s3', 'st-hash', T0 + 2000 + STATION_COOLDOWN_MS).ok).toBe(true)
    expect(c.patches).toBe(0)
  })

  it('locks out after a wrong answer and after a timeout', () => {
    const { round, b } = setup()
    place(round, 's2', station.x, station.z)
    round.stationStart('s2', 'st-hash', T0)
    expect(round.stationSubmit('s2', { index: 99 }, T0 + 1000).reason).toBe('wrong')
    expect(b.lockedUntil).toBe(T0 + 1000 + STATION_LOCKOUT_MS)
    expect(round.stationStart('s2', 'st-hash', T0 + 2000).reason).toBe('locked')
    const again = round.stationStart('s2', 'st-hash', T0 + 1000 + STATION_LOCKOUT_MS)
    expect(again.ok).toBe(true)
    round.tick(again.puzzle.deadline + 1)
    expect(round.hasPuzzle('s2')).toBe(false)
    expect(b.lockedUntil).toBeGreaterThan(again.puzzle.deadline)
    expect(round.stationSubmit('s2', {}, again.puzzle.deadline + 2).reason).toBe('no_puzzle')
    expect(b.patches).toBe(0)
  })

  it('rejects a late submission and cancels the puzzle when tagged or far away', () => {
    const { round, b } = setup()
    place(round, 's2', station.x, station.z)
    const started = round.stationStart('s2', 'st-hash', T0)
    expect(round.stationSubmit('s2', {}, started.puzzle.deadline + 1).reason).toBe('late')
    place(round, 's1', station.x + 1, station.z)
    place(round, 's2', station.x, station.z)
    b.lockedUntil = 0
    round.stationStart('s2', 'st-hash', T0 + 40000)
    round.tag('s1', 's2', T0 + 40001)
    expect(round.hasPuzzle('s2')).toBe(false)
  })

  it('snapshot shows only the caller their own puzzle, never answers', () => {
    const { round } = setup()
    place(round, 's2', station.x, station.z)
    round.stationStart('s2', 'st-hash', T0)
    const mine = round.snapshot('s2', T0)
    const theirs = round.snapshot('s3', T0)
    expect(mine.you.puzzle.kind).toBe('hash')
    expect(theirs.you.puzzle).toBeNull()
    const text = JSON.stringify([mine, theirs])
    expect(text).not.toContain('answer')
    expect(JSON.stringify(theirs)).not.toContain('published')
    expect(mine.players.every((p) => !('puzzle' in p) && !('brain' in p))).toBe(true)
    expect(mine.stations).toHaveLength(6)
    expect(round.snapshot('ghost', T0).you).toBeNull()
  })
})

function submitRight(round, sid, at) {
  const puzzle = round.botSubmitProbe?.(sid)
  if (puzzle) return round.stationSubmit(sid, puzzle, at)
  // bots hold their own answers; humans need the client, so reuse the bot path on a flagged copy
  const player = round.getPlayer(sid)
  player.isBot = true
  const result = round.botSubmit(sid, true, at)
  player.isBot = false
  return result
}

describe('round end and results', () => {
  it('ends when everyone is infected', () => {
    const { round } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    place(round, 's3', 8, 1)
    const t = COUNTDOWN_MS + 30500
    round.tag('s1', 's2', t)
    expect(round.phase).toBe('playing')
    round.tag('s1', 's3', t + 10)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBe('botnet')
    const results = round.results()
    const first = results.find((r) => r.sid === 's1')
    expect(first).toMatchObject({ outcome: 'infected', sideWon: true, tags: 2, survivalSeconds: 0 })
    expect(first.score).toBe(0 + 60 + 100)
    const second = results.find((r) => r.sid === 's2')
    expect(second.survivalSeconds).toBe(30)
    expect(second.score).toBe(30 + 100)
  })

  it('ends on time with survivors winning, then returns to the lobby', () => {
    const { round } = setup()
    round.tick(COUNTDOWN_MS + ROUND_MS - 1)
    expect(round.phase).toBe('playing')
    round.tick(COUNTDOWN_MS + ROUND_MS)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBe('survivors')
    const results = round.results()
    const clean = results.find((r) => r.sid === 's2')
    expect(clean).toMatchObject({
      outcome: 'survived',
      sideWon: true,
      survivalSeconds: 180,
      score: 280,
    })
    expect(results.find((r) => r.sid === 's1')).toMatchObject({
      outcome: 'infected',
      sideWon: false,
      score: 0,
    })
    const end = COUNTDOWN_MS + ROUND_MS
    round.tick(end + RESULTS_MS - 1)
    expect(round.phase).toBe('results')
    round.tick(end + RESULTS_MS)
    expect(round.phase).toBe('lobby')
    expect(round.size).toBe(3)
    expect(round.players().every((p) => !p.ready && !p.infected)).toBe(true)
  })

  it('flags bots and staff in results', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(2), withBots: true })
    round.join(person(1, { isStaff: true }), 0)
    round.setReady('s1', true, 0)
    round.tick(COUNTDOWN_MS)
    round.tick(COUNTDOWN_MS + ROUND_MS)
    const results = round.results()
    expect(results.filter((r) => r.isBot)).toHaveLength(2)
    expect(results.find((r) => r.sid === 's1').isStaff).toBe(true)
  })

  it('resets bots and ends when the last human leaves mid-round', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(2), withBots: true })
    round.join(person(1), 0)
    round.setReady('s1', true, 0)
    round.tick(COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
    expect(round.leave('s1', COUNTDOWN_MS + 5)).toBe(true)
    expect(round.phase).toBe('lobby')
    expect(round.size).toBe(0)
    expect(round.leave('s1', 0)).toBe(false)
  })

  it('snapshot hides internals and keeps counters bounded', () => {
    const { round } = setup()
    const snap = round.snapshot('s1', COUNTDOWN_MS)
    expect(Object.keys(snap.players[0]).sort()).toEqual(
      [
        'avatarId',
        'infected',
        'immuneUntil',
        'isBot',
        'isStaff',
        'ready',
        'sid',
        'sprinting',
        'username',
        'x',
        'yaw',
        'z',
      ].sort(),
    )
    for (let i = 0; i < 80; i += 1) round.drainEvents()
    for (let i = 0; i < 70; i += 1) round.sprint('s1', COUNTDOWN_MS + i * 20000)
    expect(round.drainEvents().length).toBeLessThanOrEqual(50)
    expect(submissionFor('hash', 2)).toEqual({ index: 2 })
  })
})
