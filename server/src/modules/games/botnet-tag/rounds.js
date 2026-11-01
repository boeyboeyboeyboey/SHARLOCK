import { publicLook } from '../../presence/look.js'
import { ARENA, stationById } from './arena.js'
import {
  generatePuzzle,
  checkPuzzle,
  shuffle,
  submissionFor,
  failReason,
  LATE_REASON,
} from './puzzles.js'
import {
  COUNTDOWN_MS,
  GRACE_MS,
  IMMUNITY_MS,
  LOBBY_IDLE_MS,
  MAX_PLAYERS,
  MAX_SCORE,
  MIN_PLAYERS,
  MIN_SAVED_ROUND_MS,
  RESULTS_MS,
  ROUND_MS,
  STATION_COOLDOWN_MS,
  STATION_LOCKOUT_MS,
  STATION_REACH,
  canStartSprint,
  canTag,
  patientZeroCount,
  pickSpawns,
  scoreFor,
  sprintActive,
  sprintCooldownEnd,
  validateMove,
} from './rules.js'
import { stepBot } from './bots.js'

const MAX_EVENTS = 50
const MAX_COUNTER = 999
const MAX_NAME = 24
const NOTICE_MS = 4000
const STATION_TAKEN = 'Someone patched this station first'
const BOT_NAMES = ['Ada', 'Grace', 'Linus', 'Alan', 'Ken', 'Dennis', 'Hedy', 'Tim']

const isTime = (value) => typeof value === 'number' && Number.isFinite(value)
const round2 = (value) => Math.round(value * 100) / 100
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// pure state machine for one class's round: lobby, countdown, playing, results
export function createRound({
  id,
  cohortId,
  now = 0,
  rng = Math.random,
  withBots = false,
  botsIdle = false,
} = {}) {
  const players = new Map()
  // staff who had not pressed ready when the round started: they watch and take no part
  const watchers = new Map()
  const puzzles = new Map()
  const events = []
  let stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
  let phase = 'lobby'
  let phaseEndsAt = null
  let startedAt = null
  let graceEndsAt = null
  let play = 0
  let unsavedReason = null
  // a real tag happened this play, even if its victims have since left
  let spread = false
  let finalResults = []
  let sideWon = null
  let clock = isTime(now) ? now : 0
  let botSeq = 0

  const humans = () => [...players.values()].filter((player) => !player.isBot)
  const bots = () => [...players.values()].filter((player) => player.isBot)
  // the humans who decide the start; staff who have not pressed ready are only watching
  const counted = () => humans().filter((player) => !player.isStaff || player.ready)
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
      // public outfit ids only; bots and unknown accounts get the default outfit
      look: info.look ? { ...info.look } : publicLook(null),
      isStaff: info.isStaff === true,
      isBot,
      ready: isBot,
      x: 0,
      z: 0,
      yaw: 0,
      infected: false,
      immuneUntil: 0,
      lockedUntil: 0,
      failReason: null,
      notice: null,
      noticeUntil: 0,
      lastMoveAt: null,
      moveCredit: null,
      sprintStartedAt: null,
      infectedAt: null,
      startedInfected: false,
      patches: 0,
      tags: 0,
      idleSince: clock,
    }
  }

  function removeBots() {
    for (const player of [...players.values()]) {
      if (player.isBot) players.delete(player.sid)
    }
  }

  function fillBots() {
    while (counted().length + bots().length < MIN_PLAYERS && players.size < MAX_PLAYERS) {
      const name = BOT_NAMES[botSeq % BOT_NAMES.length]
      botSeq += 1
      const sid = `bot-${botSeq}`
      players.set(sid, makePlayer({ sid, username: `Bot ${name}`, avatarId: 'bot' }, true))
    }
  }

  function canStart() {
    const list = counted()
    if (list.length === 0 || list.length + bots().length < MIN_PLAYERS) return false
    return list.every((player) => player.ready)
  }

  function evaluateLobby(t) {
    if (phase === 'countdown' && !canStart()) {
      phase = 'lobby'
      phaseEndsAt = null
    }
    if (phase !== 'lobby') return
    // a cancelled countdown lands here too, as nothing else would look at the lobby again
    const list = counted()
    if (list.length === 0) removeBots()
    else if (withBots && list.some((player) => player.ready)) fillBots()
    if (canStart()) {
      phase = 'countdown'
      phaseEndsAt = t + COUNTDOWN_MS
    }
  }

  function resetForPlay(player) {
    Object.assign(player, {
      infected: false,
      immuneUntil: 0,
      lockedUntil: 0,
      failReason: null,
      notice: null,
      noticeUntil: 0,
      lastMoveAt: null,
      moveCredit: null,
      sprintStartedAt: null,
      infectedAt: null,
      startedInfected: false,
      patches: 0,
      tags: 0,
    })
  }

  function startPlaying(t) {
    for (const player of humans()) {
      if (!player.isStaff || player.ready) continue
      players.delete(player.sid)
      watchers.set(player.sid, player)
    }
    const list = shuffle(rng, [...players.values()])
    const zeroCount = patientZeroCount(list.length)
    const { zeros, others } = pickSpawns(shuffle(rng, ARENA.spawns), list.length, zeroCount)
    list.forEach((player, i) => {
      const spawn = i < zeroCount ? zeros[i] : others[i - zeroCount]
      resetForPlay(player)
      Object.assign(player, { x: spawn.x, z: spawn.z, yaw: 0, lastMoveAt: t })
    })
    for (const zero of list.slice(0, zeroCount)) {
      zero.infected = true
      zero.infectedAt = t
      zero.startedInfected = true
    }
    stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
    puzzles.clear()
    finalResults = []
    sideWon = null
    startedAt = t
    graceEndsAt = t + GRACE_MS
    play += 1
    unsavedReason = null
    spread = false
    phase = 'playing'
    phaseEndsAt = t + ROUND_MS
    pushEvent({ type: 'start', at: t })
  }

  // a null winner means one side left, so the round is abandoned
  function endRound(t, winner) {
    const endAt = Math.min(t, phaseEndsAt)
    sideWon = winner
    if (winner === null) unsavedReason = 'abandoned'
    else if (endAt - startedAt < MIN_SAVED_ROUND_MS) unsavedReason = 'short'
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
        score: Math.min(MAX_SCORE, scoreFor(stats, { sideWon: won })),
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

  // a side emptied by leaving is no win; everyone infected only counts if the botnet really spread
  function endAfterLeave(t) {
    const list = [...players.values()]
    const infected = list.filter((player) => player.infected)
    if (infected.length === 0 || (infected.length === list.length && !spread)) endRound(t, null)
    else checkEnd(t)
  }

  function backToLobby() {
    removeBots()
    puzzles.clear()
    for (const watcher of watchers.values()) players.set(watcher.sid, watcher)
    watchers.clear()
    for (const player of players.values()) {
      resetForPlay(player)
      player.ready = false
      player.idleSince = clock
    }
    stations = ARENA.stations.map((station) => ({ ...station, coolingUntil: 0 }))
    phase = 'lobby'
    phaseEndsAt = null
    startedAt = null
    graceEndsAt = null
  }

  function lockOut(player, t, reason) {
    player.lockedUntil = t + STATION_LOCKOUT_MS
    player.failReason = reason
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
    get graceEndsAt() {
      return graceEndsAt
    },
    // counts the plays of this lobby, so each saves under its own key
    get play() {
      return play
    },
    get unsavedReason() {
      return unsavedReason
    },
    get sideWon() {
      return sideWon
    },
    get size() {
      return players.size + watchers.size
    },

    // live player records, for bots and tests only
    players: () => [...players.values()],
    stationList: () => stations,
    getPlayer,
    hasPuzzle: (sid) => puzzles.has(sid),
    // tests only: the right submission for a player's open puzzle
    answerFor(sid) {
      const puzzle = puzzles.get(sid)
      return puzzle ? submissionFor(puzzle.kind, puzzle.answer) : null
    },
    // students who have not pressed ready in time; staff may stay and watch
    idlePlayers(at) {
      const t = timeOf(at)
      if (phase !== 'lobby' && phase !== 'countdown') return []
      return humans()
        .filter((player) => !player.isStaff && !player.ready)
        .filter((player) => t - player.idleSince >= LOBBY_IDLE_MS)
        .map((player) => player.sid)
    },

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
      if (watchers.delete(sid)) return true
      if (!players.delete(sid)) return false
      puzzles.delete(sid)
      if (humans().length === 0) backToLobby()
      else if (phase === 'playing') endAfterLeave(t)
      else evaluateLobby(t)
      return true
    },

    setReady(sid, ready, at) {
      const t = timeOf(at)
      const player = getPlayer(sid)
      if (!player || player.isBot || typeof ready !== 'boolean') return false
      if (phase !== 'lobby' && phase !== 'countdown') return false
      player.ready = ready
      player.idleSince = t
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
      player.moveCredit = verdict.credit
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
      if (t < graceEndsAt) return { ok: false, reason: 'grace' }
      if (!canTag(tagger, target, t)) return { ok: false, reason: 'no_tag' }
      target.infected = true
      target.infectedAt = t
      spread = true
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
        lockOut(player, t, LATE_REASON)
        return { ok: false, reason: 'late' }
      }
      if (!checkPuzzle(puzzle.kind, puzzle.answer, submission)) {
        lockOut(player, t, failReason(puzzle.kind))
        return { ok: false, reason: 'wrong' }
      }
      const station = stations.find((item) => item.id === puzzle.stationId)
      if (station.coolingUntil > t) {
        player.notice = STATION_TAKEN
        player.noticeUntil = t + NOTICE_MS
        return { ok: false, reason: 'cooling' }
      }
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
          if (player) lockOut(player, t, LATE_REASON)
        }
        for (const bot of botsIdle ? [] : bots()) {
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
      const awaitingReady =
        me && !me.isBot && !me.isStaff && !me.ready && (phase === 'lobby' || phase === 'countdown')
      return {
        id,
        phase,
        now: t,
        phaseEndsAt,
        startedAt,
        graceEndsAt,
        watching: watchers.has(forSid),
        roundMs: ROUND_MS,
        sideWon,
        players: [...players.values()].map((player) => ({
          sid: player.sid,
          username: player.username,
          avatarId: player.avatarId,
          look: player.look,
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
              failReason: t < me.lockedUntil ? me.failReason : null,
              notice: t < me.noticeUntil ? me.notice : null,
              readyBy: awaitingReady ? me.idleSince + LOBBY_IDLE_MS : null,
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
