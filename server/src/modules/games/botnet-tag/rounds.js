import { ARENA, stationById } from './arena.js'
import { generatePuzzle, checkPuzzle, shuffle, submissionFor } from './puzzles.js'
import {
  COUNTDOWN_MS,
  IMMUNITY_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RESULTS_MS,
  ROUND_MS,
  STATION_COOLDOWN_MS,
  STATION_LOCKOUT_MS,
  STATION_REACH,
  canStartSprint,
  canTag,
  patientZeroCount,
  scoreFor,
  sprintActive,
  sprintCooldownEnd,
  validateMove,
} from './rules.js'
import { stepBot } from './bots.js'

const MAX_EVENTS = 50
const MAX_COUNTER = 999
const MAX_NAME = 24
const BOT_NAMES = ['Ada', 'Grace', 'Linus', 'Alan', 'Ken', 'Dennis', 'Hedy', 'Tim']

const isTime = (value) => typeof value === 'number' && Number.isFinite(value)
const round2 = (value) => Math.round(value * 100) / 100
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// pure state machine for one class's round: lobby, countdown, playing, results
export function createRound({ id, cohortId, now = 0, rng = Math.random, withBots = false } = {}) {
  const players = new Map()
  const puzzles = new Map()
  const events = []
  let stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
  let phase = 'lobby'
  let phaseEndsAt = null
  let startedAt = null
  let finalResults = []
  let sideWon = null
  let clock = isTime(now) ? now : 0
  let botSeq = 0

  const humans = () => [...players.values()].filter((player) => !player.isBot)
  const timeOf = (value) => {
    if (isTime(value) && value >= clock) clock = value
    return clock
  }
  const getPlayer = (sid) => (typeof sid === 'string' ? (players.get(sid) ?? null) : null)
  const pushEvent = (event) => {
    events.push(event)
    if (events.length > MAX_EVENTS) events.shift()
  }
  const bump = (player, field) => {
    player[field] = Math.min(MAX_COUNTER, player[field] + 1)
  }

  function makePlayer(info, isBot) {
    return {
      sid: info.sid,
      username: String(info.username ?? '').slice(0, MAX_NAME),
      avatarId: typeof info.avatarId === 'string' ? info.avatarId : null,
      isStaff: info.isStaff === true,
      isBot,
      ready: isBot,
      x: 0,
      z: 0,
      yaw: 0,
      infected: false,
      immuneUntil: 0,
      lockedUntil: 0,
      lastMoveAt: null,
      sprintStartedAt: null,
      infectedAt: null,
      startedInfected: false,
      patches: 0,
      tags: 0,
    }
  }

  function removeBots() {
    for (const player of [...players.values()]) {
      if (player.isBot) players.delete(player.sid)
    }
  }

  function fillBots() {
    while (players.size < MIN_PLAYERS) {
      const name = BOT_NAMES[botSeq % BOT_NAMES.length]
      botSeq += 1
      const sid = `bot-${botSeq}`
      players.set(sid, makePlayer({ sid, username: `Bot ${name}`, avatarId: 'bot' }, true))
    }
  }

  function canStart() {
    const list = humans()
    return players.size >= MIN_PLAYERS && list.length > 0 && list.every((player) => player.ready)
  }

  function evaluateLobby(t) {
    if (phase === 'lobby') {
      const list = humans()
      if (list.length === 0) removeBots()
      else if (withBots && list.some((player) => player.ready)) fillBots()
      if (canStart()) {
        phase = 'countdown'
        phaseEndsAt = t + COUNTDOWN_MS
      }
    } else if (phase === 'countdown' && !canStart()) {
      phase = 'lobby'
      phaseEndsAt = null
    }
  }

  function resetForPlay(player) {
    Object.assign(player, {
      infected: false,
      immuneUntil: 0,
      lockedUntil: 0,
      lastMoveAt: null,
      sprintStartedAt: null,
      infectedAt: null,
      startedInfected: false,
      patches: 0,
      tags: 0,
    })
  }

  function startPlaying(t) {
    const list = [...players.values()]
    const spawns = shuffle(rng, ARENA.spawns)
    list.forEach((player, i) => {
      const spawn = spawns[i % spawns.length]
      resetForPlay(player)
      Object.assign(player, { x: spawn.x, z: spawn.z, yaw: 0, lastMoveAt: t })
    })
    for (const zero of shuffle(rng, list).slice(0, patientZeroCount(list.length))) {
      zero.infected = true
      zero.infectedAt = t
      zero.startedInfected = true
    }
    stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
    puzzles.clear()
    finalResults = []
    sideWon = null
    startedAt = t
    phase = 'playing'
    phaseEndsAt = t + ROUND_MS
    pushEvent({ type: 'start', at: t })
  }

  function endRound(t, winner) {
    const endAt = Math.min(t, phaseEndsAt)
    sideWon = winner
    puzzles.clear()
    const cleanAtEnd = [...players.values()].filter((player) => !player.infected).length
    finalResults = [...players.values()].map((player) => {
      const survivedUntil = player.infected ? player.infectedAt : endAt
      const survivalSeconds = Math.max(0, (survivedUntil - startedAt) / 1000)
      const won = player.infected ? winner === 'botnet' : winner === 'survivors'
      const stats = { survivalSeconds, patches: player.patches, tags: player.tags }
      return {
        sid: player.sid,
        username: player.username,
        outcome: player.infected ? 'infected' : 'survived',
        sideWon: won,
        survivalSeconds: Math.floor(survivalSeconds),
        patches: player.patches,
        tags: player.tags,
        startedInfected: player.startedInfected,
        cleanAtEnd,
        score: scoreFor(stats, { sideWon: won }),
        isBot: player.isBot,
        isStaff: player.isStaff,
      }
    })
    phase = 'results'
    phaseEndsAt = t + RESULTS_MS
    pushEvent({ type: 'end', at: t, winner })
  }

  function checkEnd(t) {
    if (phase !== 'playing') return
    const clean = [...players.values()].filter((player) => !player.infected).length
    if (clean === 0) endRound(t, 'botnet')
    else if (t >= phaseEndsAt) endRound(t, 'survivors')
  }

  function backToLobby() {
    removeBots()
    puzzles.clear()
    for (const player of players.values()) {
      resetForPlay(player)
      player.ready = false
    }
    stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
    phase = 'lobby'
    phaseEndsAt = null
    startedAt = null
  }

  function lockOut(player, t) {
    player.lockedUntil = t + STATION_LOCKOUT_MS
  }

  const api = {
    id,
    cohortId,
    get phase() {
      return phase
    },
    get phaseEndsAt() {
      return phaseEndsAt
    },
    get startedAt() {
      return startedAt
    },
    get sideWon() {
      return sideWon
    },
    get size() {
      return players.size
    },

    // live player records, for bots and tests only
    players: () => [...players.values()],
    stationList: () => stations,
    getPlayer,
    hasPuzzle: (sid) => puzzles.has(sid),

    join(info, at) {
      const t = timeOf(at)
      if (!info || typeof info.sid !== 'string' || info.sid === '')
        return { ok: false, reason: 'invalid' }
      if (typeof info.username !== 'string' || info.username === '')
        return { ok: false, reason: 'invalid' }
      if (phase !== 'lobby') return { ok: false, reason: 'not_lobby' }
      if (players.has(info.sid)) return { ok: false, reason: 'duplicate' }
      if (players.size >= MAX_PLAYERS) {
        const bot = [...players.values()].find((player) => player.isBot)
        if (!bot) return { ok: false, reason: 'full' }
        players.delete(bot.sid)
      }
      players.set(info.sid, makePlayer(info, false))
      evaluateLobby(t)
      return { ok: true }
    },

    leave(sid, at) {
      const t = timeOf(at)
      if (!players.delete(sid)) return false
      puzzles.delete(sid)
      if (humans().length === 0) backToLobby()
      else if (phase === 'playing') checkEnd(t)
      else evaluateLobby(t)
      return true
    },

    setReady(sid, ready, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      if (!player || player.isBot || typeof ready !== 'boolean') return false
      if (phase !== 'lobby' && phase !== 'countdown') return false
      player.ready = ready
      evaluateLobby(t)
      return true
    },

    move(sid, pos, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      if (!player || phase !== 'playing') return { ok: false, reason: 'not_playing' }
      const verdict = validateMove(player, pos, t)
      if (!verdict.ok) return verdict
      if (Number.isFinite(pos.yaw)) player.yaw = round2(pos.yaw)
      else player.yaw = Math.atan2(verdict.x - player.x, verdict.z - player.z)
      player.x = verdict.x
      player.z = verdict.z
      player.lastMoveAt = t
      const puzzle = puzzles.get(sid)
      const station = puzzle ? stationById(puzzle.stationId) : null
      if (station && distance(player, station) > STATION_REACH * 1.5) puzzles.delete(sid)
      return verdict
    },

    sprint(sid, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      if (!player || phase !== 'playing') return { ok: false, reason: 'not_playing' }
      if (!canStartSprint(player, t)) return { ok: false, reason: 'cooldown' }
      player.sprintStartedAt = t
      return { ok: true, cooldownEndsAt: sprintCooldownEnd(player) }
    },

    tag(sid, targetSid, at) {
      const t = timeOf(at)
      const tagger = getPlayer(sid)
      const target = getPlayer(targetSid)
      if (!tagger || !target || phase !== 'playing') return { ok: false, reason: 'invalid' }
      if (!canTag(tagger, target, t)) return { ok: false, reason: 'no_tag' }
      target.infected = true
      target.infectedAt = t
      puzzles.delete(targetSid)
      bump(tagger, 'tags')
      pushEvent({ type: 'tag', at: t, from: sid, to: targetSid })
      checkEnd(t)
      return { ok: true }
    },

    stationStart(sid, stationId, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      if (!player || phase !== 'playing') return { ok: false, reason: 'not_playing' }
      const station = stations.find((item) => item.id === stationId)
      if (!station) return { ok: false, reason: 'unknown_station' }
      if (player.infected) return { ok: false, reason: 'infected' }
      if (puzzles.has(sid)) return { ok: false, reason: 'busy' }
      if (t < player.lockedUntil) return { ok: false, reason: 'locked' }
      if (t < station.coolingUntil) return { ok: false, reason: 'cooling' }
      if (distance(player, station) > STATION_REACH) return { ok: false, reason: 'too_far' }
      const generated = generatePuzzle(station.kind, rng)
      const deadline = t + generated.timeLimitMs
      puzzles.set(sid, {
        stationId,
        kind: generated.kind,
        answer: generated.answer,
        public: generated.public,
        deadline,
      })
      return {
        ok: true,
        puzzle: { stationId, kind: generated.kind, public: generated.public, deadline },
      }
    },

    stationSubmit(sid, submission, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      const puzzle = puzzles.get(sid)
      if (!player || !puzzle || phase !== 'playing') return { ok: false, reason: 'no_puzzle' }
      puzzles.delete(sid)
      if (t > puzzle.deadline) {
        lockOut(player, t)
        return { ok: false, reason: 'late' }
      }
      if (!checkPuzzle(puzzle.kind, puzzle.answer, submission)) {
        lockOut(player, t)
        return { ok: false, reason: 'wrong' }
      }
      const station = stations.find((item) => item.id === puzzle.stationId)
      if (station.coolingUntil > t) return { ok: false, reason: 'cooling' }
      station.coolingUntil = t + STATION_COOLDOWN_MS
      player.immuneUntil = t + IMMUNITY_MS
      bump(player, 'patches')
      pushEvent({ type: 'patch', at: t, sid, stationId: station.id })
      return { ok: true, immuneUntil: player.immuneUntil }
    },

    // bots know their own answer; they solve or fail on a roll
    botSubmit(sid, correct, at) {
      const player = getPlayer(sid)
      const puzzle = puzzles.get(sid)
      if (!player?.isBot || !puzzle) return { ok: false, reason: 'no_puzzle' }
      const submission = correct ? submissionFor(puzzle.kind, puzzle.answer) : {}
      return api.stationSubmit(sid, submission, at)
    },

    tick(at) {
      const t = timeOf(at)
      if (phase === 'countdown') {
        if (!canStart()) evaluateLobby(t)
        else if (t >= phaseEndsAt) startPlaying(t)
      } else if (phase === 'playing') {
        for (const [sid, puzzle] of puzzles) {
          if (t <= puzzle.deadline) continue
          puzzles.delete(sid)
          const player = getPlayer(sid)
          if (player) lockOut(player, t)
        }
        for (const bot of [...players.values()].filter((player) => player.isBot)) {
          if (phase !== 'playing') break
          stepBot(api, bot, t, rng)
        }
        checkEnd(t)
      } else if (phase === 'results' && t >= phaseEndsAt) {
        backToLobby()
      }
    },

    drainEvents() {
      return events.splice(0, events.length)
    },

    // public state only; the caller's own puzzle is the only private part
    snapshot(forSid, at) {
      const t = timeOf(at)
      const me = getPlayer(forSid)
      const puzzle = me ? puzzles.get(forSid) : null
      return {
        id,
        phase,
        now: t,
        phaseEndsAt,
        startedAt,
        roundMs: ROUND_MS,
        sideWon,
        players: [...players.values()].map((player) => ({
          sid: player.sid,
          username: player.username,
          avatarId: player.avatarId,
          x: round2(player.x),
          z: round2(player.z),
          yaw: player.yaw,
          infected: player.infected,
          immuneUntil: player.immuneUntil,
          sprinting: sprintActive(player, t),
          ready: player.ready,
          isBot: player.isBot,
          isStaff: player.isStaff,
        })),
        stations: stations.map(({ id: stationId, kind, x, z, coolingUntil }) => ({
          id: stationId,
          kind,
          x,
          z,
          coolingUntil,
        })),
        you: me
          ? {
              lockedUntil: me.lockedUntil,
              sprintReadyAt: sprintCooldownEnd(me),
              patches: me.patches,
              tags: me.tags,
              puzzle: puzzle
                ? {
                    stationId: puzzle.stationId,
                    kind: puzzle.kind,
                    public: puzzle.public,
                    deadline: puzzle.deadline,
                  }
                : null,
            }
          : null,
      }
    },

    results: () => finalResults.map((entry) => ({ ...entry })),
  }
  return api
}
