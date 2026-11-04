import { describe, expect, it } from 'vitest'
import { createRound } from '../../../src/modules/games/botnet-tag/rounds.js'
import { stationById } from '../../../src/modules/games/botnet-tag/arena.js'
import {
  submissionFor,
  failReason,
  LATE_REASON,
} from '../../../src/modules/games/botnet-tag/puzzles.js'
import {
  COUNTDOWN_MS,
  GRACE_MS,
  IMMUNITY_MS,
  LOBBY_IDLE_MS,
  MAX_PLAYERS,
  MAX_SCORE,
  MIN_SAVED_ROUND_MS,
  RESULTS_MS,
  ROUND_MS,
  STATION_COOLDOWN_MS,
  STATION_LOCKOUT_MS,
  STATION_REACH,
  BASE_SPEED,
  TAG_COOLDOWN_MS,
} from '../../../src/modules/games/botnet-tag/rules.js'
import { botnetTagRuleset } from '../../../src/modules/games/botnet-tag/ruleset.js'
import { createRng } from './rng.js'

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

  it('refills bots and counts down again when a player leaves a countdown', () => {
    const round = lobby(2, { withBots: true })
    round.setReady('s1', true, 0)
    round.setReady('s2', true, 0)
    expect(round.size).toBe(3)
    expect(round.phase).toBe('countdown')
    round.leave('s2', 1000)
    expect(round.size).toBe(3)
    expect(round.phase).toBe('countdown')
    expect(round.phaseEndsAt).toBe(1000 + COUNTDOWN_MS)
    round.tick(1000 + COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
  })

  it('refills bots and counts down again when staff unready during a countdown', () => {
    const round = lobby(1, { withBots: true })
    round.join(person(9, { isStaff: true }), 0)
    round.setReady('s9', true, 0)
    round.setReady('s1', true, 0)
    expect(round.players().filter((p) => p.isBot)).toHaveLength(1)
    expect(round.phase).toBe('countdown')
    round.setReady('s9', false, 1000)
    expect(round.players().filter((p) => p.isBot)).toHaveLength(2)
    expect(round.phase).toBe('countdown')
    expect(round.phaseEndsAt).toBe(1000 + COUNTDOWN_MS)
    round.tick(1000 + COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
    expect(round.players().map((p) => p.sid)).not.toContain('s9')
  })

  it('stays in the lobby when a countdown is cancelled by a student unreadying', () => {
    const round = lobby(2, { withBots: true })
    round.setReady('s1', true, 0)
    round.setReady('s2', true, 0)
    round.setReady('s2', false, 1000)
    expect(round.phase).toBe('lobby')
    expect(round.phaseEndsAt).toBeNull()
  })

  it('takes the bots away when the last counted player leaves a countdown', () => {
    const round = lobby(1, { withBots: true })
    round.join(person(9, { isStaff: true }), 0)
    round.setReady('s1', true, 0)
    expect(round.phase).toBe('countdown')
    round.leave('s1', 1000)
    expect(round.phase).toBe('lobby')
    expect(round.players().map((p) => p.sid)).toEqual(['s9'])
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

  it('limits sprint by cooldown, and refuses it to the infected', () => {
    const round = startPlay(3)
    const t = COUNTDOWN_MS
    const zero = round.players().find((player) => player.infected)
    expect(round.sprint(zero.sid, t)).toEqual({ ok: false, reason: 'infected' })
    expect(zero.sprintStartedAt).toBeNull()
    round.getPlayer('s1').infected = false
    expect(round.sprint('s1', t).ok).toBe(true)
    expect(round.sprint('s1', t + 3000).reason).toBe('cooldown')
    expect(round.sprint('s1', t + 8500).ok).toBe(true)
    expect(round.getPlayer('s1').sprintStartedAt).toBe(t + 8500)
  })
})

describe('tag flow', () => {
  const PLAY = COUNTDOWN_MS + GRACE_MS

  it('lets nobody tag during the grace period and tells the players', () => {
    const { round, b } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    expect(round.snapshot('s2', COUNTDOWN_MS).graceEndsAt).toBe(PLAY)
    expect(round.tag('s1', 's2', PLAY - 1)).toEqual({ ok: false, reason: 'grace' })
    expect(b.infected).toBe(false)
    expect(round.tag('s1', 's2', PLAY).ok).toBe(true)
  })

  it('infects a clean target in reach and counts the tag', () => {
    const { round, a, b } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    expect(round.tag('s2', 's1', PLAY).ok).toBe(false)
    expect(round.tag('s1', 's2', PLAY).ok).toBe(true)
    expect(b.infected).toBe(true)
    expect(a.tags).toBe(1)
    expect(round.tag('s1', 's2', PLAY + 1).ok).toBe(false)
    expect(round.drainEvents().some((e) => e.type === 'tag')).toBe(true)
  })

  it('tags one player at a time, then waits out the cooldown', () => {
    const { round, b, c } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    place(round, 's3', 8, 1)
    expect(round.tag('s1', 's2', PLAY).ok).toBe(true)
    expect(round.snapshot('s1', PLAY).players.find((p) => p.sid === 's1').tagReadyAt).toBe(
      PLAY + TAG_COOLDOWN_MS,
    )
    expect(round.tag('s1', 's3', PLAY + 1)).toEqual({ ok: false, reason: 'cooldown' })
    expect(round.tag('s1', 's3', PLAY + TAG_COOLDOWN_MS - 1).reason).toBe('cooldown')
    expect(c.infected).toBe(false)
    expect(b.infected).toBe(true)
    expect(round.tag('s1', 's3', PLAY + TAG_COOLDOWN_MS).ok).toBe(true)
  })

  it('refuses a far or immune target', () => {
    const { round, b } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 14, 0)
    expect(round.tag('s1', 's2', PLAY).ok).toBe(false)
    place(round, 's2', 9, 0)
    b.immuneUntil = PLAY + 5000
    expect(round.tag('s1', 's2', PLAY).ok).toBe(false)
    expect(round.tag('s1', 's2', PLAY + 5000).ok).toBe(true)
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

  it('gives the failing player a reason that never reveals the answer', () => {
    const { round, b } = setup()
    place(round, 's2', station.x, station.z)
    const started = round.stationStart('s2', 'st-hash', T0)
    expect(round.snapshot('s2', T0 + 500).you.failReason).toBeNull()
    round.stationSubmit('s2', { index: 99 }, T0 + 1000)
    const mine = round.snapshot('s2', T0 + 1100)
    expect(mine.you.failReason).toBe(failReason('hash'))
    expect(round.snapshot('s3', T0 + 1100).you.failReason).toBeNull()
    expect(JSON.stringify(round.snapshot('s3', T0 + 1100))).not.toContain(mine.you.failReason)
    expect(round.snapshot('s2', T0 + 1000 + STATION_LOCKOUT_MS).you.failReason).toBeNull()
    expect(started.puzzle).not.toHaveProperty('answer')
    expect(b.failReason).toBe(failReason('hash'))
    const again = round.stationStart('s2', 'st-hash', T0 + 1000 + STATION_LOCKOUT_MS)
    round.tick(again.puzzle.deadline + 1)
    expect(round.snapshot('s2', again.puzzle.deadline + 2).you.failReason).toBe(LATE_REASON)
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

  it('tells the second solver a station was taken, without a lockout', () => {
    const { round, b, c } = setup()
    place(round, 's2', station.x, station.z)
    place(round, 's3', station.x, station.z)
    round.stationStart('s2', 'st-hash', T0)
    round.stationStart('s3', 'st-hash', T0)
    expect(submitRight(round, 's2', T0 + 2000).ok).toBe(true)
    expect(submitRight(round, 's3', T0 + 3000)).toEqual({ ok: false, reason: 'cooling' })
    expect(c.patches).toBe(0)
    expect(c.lockedUntil).toBe(0)
    expect(round.snapshot('s3', T0 + 3100).you.notice).toBe('Someone patched this station first')
    expect(round.snapshot('s2', T0 + 3100).you.notice).toBeNull()
    expect(round.snapshot('s3', T0 + 9000).you.notice).toBeNull()
    expect(b.patches).toBe(1)
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
  return round.stationSubmit(sid, round.answerFor(sid), at)
}

describe('patient zero spawn', () => {
  it('starts as far from the others as the spawn set allows', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const round = startPlay(3, { rng: createRng(seed) })
      const zero = round.players().find((p) => p.infected)
      const others = round.players().filter((p) => !p.infected)
      expect(zero.startedInfected).toBe(true)
      for (const other of others) {
        expect(Math.hypot(zero.x - other.x, zero.z - other.z)).toBeGreaterThanOrEqual(22)
      }
    }
  })
})

describe('who decides the start', () => {
  it('removes a student who never presses ready, with the time left in their snapshot', () => {
    const round = lobby(2, { withBots: true })
    expect(round.idlePlayers(LOBBY_IDLE_MS - 1)).toEqual([])
    round.setReady('s1', true, LOBBY_IDLE_MS - 1)
    expect(round.snapshot('s2', 100).you.readyBy).toBe(LOBBY_IDLE_MS)
    expect(round.snapshot('s1', 100).you.readyBy).toBeNull()
    expect(round.idlePlayers(LOBBY_IDLE_MS)).toEqual(['s2'])
    round.leave('s2', LOBBY_IDLE_MS)
    expect(round.phase).toBe('countdown')
  })

  it('restarts the wait on each toggle and after a round', () => {
    const round = lobby(1)
    round.setReady('s1', true, 40000)
    round.setReady('s1', false, 41000)
    expect(round.idlePlayers(41000 + LOBBY_IDLE_MS - 1)).toEqual([])
    expect(round.idlePlayers(41000 + LOBBY_IDLE_MS)).toEqual(['s1'])

    const played = startPlay(3)
    const end = COUNTDOWN_MS + ROUND_MS
    expect(played.idlePlayers(end - 1)).toEqual([])
    played.tick(end)
    played.tick(end + RESULTS_MS)
    expect(played.phase).toBe('lobby')
    expect(played.idlePlayers(end + RESULTS_MS + LOBBY_IDLE_MS - 1)).toEqual([])
    expect(played.idlePlayers(end + RESULTS_MS + LOBBY_IDLE_MS)).toHaveLength(3)
  })

  // how to play on the client restarts the limit with this message while the guide is open
  it('restarts the wait on a ready message that changes nothing', () => {
    const round = lobby(1)
    round.setReady('s1', false, 40000)
    expect(round.idlePlayers(40000 + LOBBY_IDLE_MS - 1)).toEqual([])
    expect(round.snapshot('s1', 40000).you.readyBy).toBe(40000 + LOBBY_IDLE_MS)
    expect(round.phase).toBe('lobby')
  })

  it('never removes staff, who do not hold the students up and only watch', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(3), withBots: true })
    round.join(person(1), 0)
    round.join(person(9, { isStaff: true }), 0)
    round.setReady('s1', true, 0)
    expect(round.idlePlayers(1)).toEqual([])
    expect(round.phase).toBe('countdown')
    round.tick(COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
    expect(round.players().map((p) => p.sid)).not.toContain('s9')
    expect(round.players()).toHaveLength(3)
    const seen = round.snapshot('s9', COUNTDOWN_MS)
    expect(seen.watching).toBe(true)
    expect(seen.you).toBeNull()
    expect(seen.players.map((p) => p.sid)).not.toContain('s9')
    expect(round.move('s9', { x: 1, z: 1 }, COUNTDOWN_MS + 50).reason).toBe('not_playing')
    round.tick(COUNTDOWN_MS + ROUND_MS)
    expect(round.results().map((r) => r.sid)).not.toContain('s9')
    round.tick(COUNTDOWN_MS + ROUND_MS + RESULTS_MS)
    expect(
      round.snapshot('s9', COUNTDOWN_MS + ROUND_MS + RESULTS_MS).players.map((p) => p.sid),
    ).toContain('s9')
  })

  it('plays staff who pressed ready, and lets a watcher leave', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(3), withBots: true })
    round.join(person(1), 0)
    round.join(person(8, { isStaff: true }), 0)
    round.join(person(9, { isStaff: true }), 0)
    round.setReady('s8', true, 0)
    round.setReady('s1', true, 0)
    round.tick(COUNTDOWN_MS)
    expect(round.players().map((p) => p.sid)).toContain('s8')
    expect(round.size).toBe(4)
    expect(round.leave('s9', COUNTDOWN_MS + 1)).toBe(true)
    expect(round.size).toBe(3)
    expect(round.phase).toBe('playing')
  })

  it('counts only students as idle', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(3), withBots: true })
    round.join(person(1), 0)
    round.join(person(9, { isStaff: true }), 0)
    expect(round.idlePlayers(LOBBY_IDLE_MS)).toEqual(['s1'])
  })

  it('does not start for staff who only watch', () => {
    const round = createRound({ id: 'r', cohortId: 'c', rng: createRng(3), withBots: true })
    round.join(person(9, { isStaff: true }), 0)
    round.tick(COUNTDOWN_MS)
    expect(round.phase).toBe('lobby')
    expect(round.size).toBe(1)
  })
})

describe('rounds that are not saved', () => {
  it('counts a round under 20 seconds as short, and one at 20 seconds as saved', () => {
    const quick = setup()
    place(quick.round, 's1', 8, 0)
    place(quick.round, 's2', 9, 0)
    place(quick.round, 's3', 8, 1)
    const early = COUNTDOWN_MS + MIN_SAVED_ROUND_MS - 1
    quick.round.tag('s1', 's2', early - TAG_COOLDOWN_MS)
    quick.round.tag('s1', 's3', early)
    expect(quick.round.sideWon).toBe('botnet')
    expect(quick.round.unsavedReason).toBe('short')

    const fair = setup()
    place(fair.round, 's1', 8, 0)
    place(fair.round, 's2', 9, 0)
    place(fair.round, 's3', 8, 1)
    const enough = COUNTDOWN_MS + MIN_SAVED_ROUND_MS
    fair.round.tag('s1', 's2', enough - TAG_COOLDOWN_MS)
    fair.round.tag('s1', 's3', enough)
    expect(fair.round.sideWon).toBe('botnet')
    expect(fair.round.unsavedReason).toBeNull()
  })

  it('abandons the round when the last infected player leaves', () => {
    const { round } = setup()
    round.leave('s1', COUNTDOWN_MS + 30000)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBeNull()
    expect(round.unsavedReason).toBe('abandoned')
    expect(round.results().every((r) => r.sideWon === false)).toBe(true)
  })

  it('abandons the round when every clean player leaves a botnet that never spread', () => {
    const { round } = setup()
    round.leave('s2', COUNTDOWN_MS + 30000)
    expect(round.phase).toBe('playing')
    round.leave('s3', COUNTDOWN_MS + 31000)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBeNull()
    expect(round.unsavedReason).toBe('abandoned')
    const zero = round.results().find((r) => r.sid === 's1')
    expect(zero).toMatchObject({ sideWon: false, startedInfected: true })
  })

  it('gives the botnet the win when it had really spread before the last clean player left', () => {
    const { round } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    round.tag('s1', 's2', COUNTDOWN_MS + 30000)
    round.leave('s3', COUNTDOWN_MS + 31000)
    expect(round.sideWon).toBe('botnet')
    expect(round.unsavedReason).toBeNull()
  })

  it('remembers a real spread after the infected victim has left', () => {
    const { round } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    round.tag('s1', 's2', COUNTDOWN_MS + 30000)
    round.leave('s2', COUNTDOWN_MS + 31000)
    expect(round.phase).toBe('playing')
    round.leave('s3', COUNTDOWN_MS + 32000)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBe('botnet')
    expect(round.unsavedReason).toBeNull()
    expect(round.results().find((r) => r.sid === 's1')).toMatchObject({ sideWon: true, tags: 1 })
  })

  it('forgets the spread of the last play when the next one starts', () => {
    const { round } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    const tagged = COUNTDOWN_MS + 30000
    round.tag('s1', 's2', tagged)
    round.tick(COUNTDOWN_MS + ROUND_MS)
    expect(round.phase).toBe('results')
    const again = COUNTDOWN_MS + ROUND_MS + RESULTS_MS
    round.tick(again)
    for (const sid of ['s1', 's2', 's3']) round.setReady(sid, true, again)
    round.tick(again + COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
    const zero = round.players().find((p) => p.infected)
    for (const clean of round.players().filter((p) => !p.infected)) {
      round.leave(clean.sid, again + COUNTDOWN_MS + 30000)
    }
    expect(round.getPlayer(zero.sid)).not.toBeNull()
    expect(round.sideWon).toBeNull()
    expect(round.unsavedReason).toBe('abandoned')
  })

  it('numbers each play of a lobby and clears the reason for the next one', () => {
    const { round } = setup()
    expect(round.play).toBe(1)
    round.leave('s1', COUNTDOWN_MS + 30000)
    round.tick(COUNTDOWN_MS + 30000 + RESULTS_MS)
    expect(round.phase).toBe('lobby')
    const again = COUNTDOWN_MS + 30000 + RESULTS_MS
    round.join(person(4), again)
    for (const sid of ['s2', 's3', 's4']) round.setReady(sid, true, again)
    round.tick(again + COUNTDOWN_MS)
    expect(round.phase).toBe('playing')
    expect(round.play).toBe(2)
    expect(round.unsavedReason).toBeNull()
  })
})

describe('the ceiling', () => {
  // a survivor who solves in about 10 s and walks the row of three stations, through the real move and submit paths
  function fastSurvivorRound() {
    const { round } = setup()
    place(round, 's1', 18, 12)
    const route = ['st-firewall', 'st-patch', 'st-process']
    const me = round.getPlayer('s2')
    let t = COUNTDOWN_MS
    const start = stationById(route[0])
    place(round, 's2', start.x, start.z)
    for (let stop = 0; round.phase === 'playing'; stop += 1) {
      const station = stationById(route[stop % route.length])
      while (Math.hypot(me.x - station.x, me.z - station.z) > STATION_REACH - 0.1) {
        t += 50
        const stride = (BASE_SPEED * 50) / 1000
        const sign = Math.sign(station.x - me.x)
        expect(round.move('s2', { x: me.x + sign * stride, z: me.z, yaw: 0 }, t).ok).toBe(true)
      }
      const started = round.stationStart('s2', station.id, t)
      expect(started).toMatchObject({ ok: true })
      t = Math.min(t + 10000, started.puzzle.deadline - 100)
      if (t >= COUNTDOWN_MS + ROUND_MS) round.tick(t)
      else expect(submitRight(round, 's2', t).ok).toBe(true)
      round.tick(t)
    }
    return round.results().find((r) => r.sid === 's2')
  }

  it('is reached by a fast solver, and the score stops there', () => {
    const row = fastSurvivorRound()
    expect(row.outcome).toBe('survived')
    expect(row.patches).toBeGreaterThanOrEqual(9)
    expect(row.score).toBe(MAX_SCORE)
    const { score } = botnetTagRuleset.summarize({
      outcome: row.outcome,
      sideWon: row.sideWon,
      survivalSeconds: row.survivalSeconds,
      patches: row.patches,
      tags: row.tags,
    })
    expect(score).toBe(MAX_SCORE)
    expect(botnetTagRuleset.maxScore).toBe(MAX_SCORE)
  })
})

describe('round end and results', () => {
  it('ends when everyone is infected', () => {
    const { round } = setup()
    place(round, 's1', 8, 0)
    place(round, 's2', 9, 0)
    place(round, 's3', 8, 1)
    const t = COUNTDOWN_MS + 30500
    round.tag('s1', 's2', t)
    expect(round.phase).toBe('playing')
    round.tag('s1', 's3', t + TAG_COOLDOWN_MS)
    expect(round.phase).toBe('results')
    expect(round.sideWon).toBe('botnet')
    const results = round.results()
    const first = results.find((r) => r.sid === 's1')
    expect(first).toMatchObject({ outcome: 'infected', sideWon: true, tags: 2, survivalSeconds: 0 })
    expect(first.score).toBe(0 + 60 + 100)
    expect(first).toMatchObject({ startedInfected: true, cleanAtEnd: 0 })
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
      survivalSeconds: 120,
      score: 220,
      startedInfected: false,
      cleanAtEnd: 2,
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

  it('snapshot carries a public look, defaulting for bots and unknown outfits', () => {
    const round = lobby(1, { withBots: true })
    round.join({ sid: 'dressed', username: 'Dee', look: { hat: 'hat-flat-cap' } }, 0)
    round.setReady('s1', true, 0)
    const players = round.snapshot('s1', 0).players
    expect(players.find((p) => p.sid === 'dressed').look).toEqual({ hat: 'hat-flat-cap' })
    const bot = players.find((p) => p.isBot)
    expect(Object.keys(bot.look).length).toBeGreaterThan(0)
    expect(JSON.stringify(players)).not.toMatch(/email|userId/)
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
        'look',
        'ready',
        'sid',
        'sprinting',
        'tagReadyAt',
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
