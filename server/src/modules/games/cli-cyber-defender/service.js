import { randomInt as cryptoRandomInt, randomUUID } from 'node:crypto'
import { SYNTAX_HINTS, formatCommand, isIpv4, parseCommand } from './parser.js'
import {
  GAME_ID,
  INCIDENT_COUNT,
  MAX_COMMANDS_PER_RUN,
  MAX_HINT_TIER,
  MAX_LOOKUPS_PER_INCIDENT,
  MAX_MISTAKES_PER_INCIDENT,
  LEAVE_HOLD_SECONDS,
  MAX_PAUSES_PER_RUN,
  MAX_SCORE,
  PAUSE_BUDGET_SECONDS,
  RULESET_VERSION,
  TIME_PENALTY_SECONDS,
  actionConflict,
  commandLimit,
  hintExhausted,
  hintUnavailable,
  incidentClosed,
  pauseUnavailable,
  leaveHoldSpent,
  pausesSpent,
  runPaused,
  runFinished,
  runNotFinished,
  runNotFound,
  terminalFull,
} from './policy.js'
import { RESPONSE_STAGE, SCENARIOS, TIER_PLAN, TOPICS } from './scenarios.js'
import { outcomesByTopic } from './ruleset.js'
import { deriveProgress, generateWindows } from './schedule.js'

const MAX_RUNS = 500
const MAX_RUNS_PER_PLAYER = 3
const IDLE_MS = 10 * 60 * 1000
const HOLD_MS = 60 * 60 * 1000
const PAUSE_BUDGET_MS = PAUSE_BUDGET_SECONDS * 1000
const LEAVE_HOLD_MS = LEAVE_HOLD_SECONDS * 1000

function incidentId(index) {
  return `incident-${String(index + 1).padStart(2, '0')}`
}

function shuffle(items, randomInt) {
  const ordered = [...items]
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1)
    ;[ordered[index], ordered[swap]] = [ordered[swap], ordered[index]]
  }
  return ordered
}

// a shift draws easy, then medium, then hard incidents; each tier mixes its decoys with real
// incidents (shuffled together) and the hard tier only holds two-step incidents
function pickScenarios(pool, randomInt) {
  const picked = TIER_PLAN.flatMap(({ tier, count, decoys, twoStep }) => {
    const inTier = pool.filter((scenario) => scenario.tier === tier)
    const chosenDecoys = shuffle(
      inTier.filter((scenario) => scenario.decoy),
      randomInt,
    ).slice(0, decoys)
    const real = shuffle(
      inTier.filter((scenario) => !scenario.decoy && scenario.steps.length === (twoStep ? 2 : 1)),
      randomInt,
    ).slice(0, count - decoys)
    return shuffle([...chosenDecoys, ...real], randomInt)
  })
  return picked.length === INCIDENT_COUNT
    ? picked
    : shuffle(pool, randomInt).slice(0, INCIDENT_COUNT)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// split each alert line into plain text and tappable names; decoys are tappable too,
// and a name only matches as a whole token so 10.20.0.1 never matches inside 10.20.0.15
export function segmentLine(line, entities) {
  if (!entities?.length) return [{ text: line }]
  const names = [...entities].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const pattern = new RegExp(`(?<![\\w.-])(${names.join('|')})(?![\\w-]|\\.\\d)`, 'g')
  const segments = []
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: line.slice(last, match.index) })
    segments.push({ target: match[0], kind: isIpv4(match[0]) ? 'ip' : 'name' })
    last = match.index + match[0].length
  }
  if (last < line.length) segments.push({ text: line.slice(last) })
  return segments
}

function publicAlert(scenario) {
  const { alert, entities } = scenario
  return {
    title: alert.title,
    severity: alert.severity,
    source: alert.source,
    lines: [...alert.lines],
    segments: alert.lines.map((line) => segmentLine(line, entities)),
  }
}

function expectedCommands(scenario) {
  return scenario.steps.length
    ? scenario.steps.map(({ verb, target }) => formatCommand(verb, target))
    : ['dismiss']
}

function review(scenario) {
  const commands = expectedCommands(scenario)
  return {
    expectedCommand: commands.join(' then '),
    expectedCommands: commands,
    decoy: Boolean(scenario.decoy),
    explanation: scenario.explanation,
    concepts: concepts(scenario),
  }
}

function concepts(scenario) {
  return {
    attack: scenario.concepts?.attack ?? null,
    cia: [...(scenario.concepts?.cia ?? [])],
    stage: RESPONSE_STAGE,
  }
}

// an early practice end skips the incident on screen and every later one; the player saw only
// the settled incidents and that first skipped one, so the rest stay out of the debrief
function reachedIncidents(incidents) {
  const firstSkipped = incidents.findIndex((item) => item.outcome === 'skipped')
  return firstSkipped === -1 ? incidents : incidents.slice(0, firstSkipped + 1)
}

function debriefSummary(correct, reached, total) {
  const summary = `You contained ${correct} of ${reached} incidents.`
  if (reached === total) return summary
  return `${summary} Practice ended after challenge ${reached} of ${total}.`
}

// open and pending incidents are still in play; every other outcome is settled
function isResolved(item) {
  return !['open', 'pending'].includes(item.outcome)
}

function countEvents(incident, kind) {
  return incident.events.filter((item) => item.kind === kind).length
}

// lookups only read scripted lines: no score, no streak change, no real host or shell
function runLookup(incident, parsed) {
  if (incident.lookups.length >= MAX_LOOKUPS_PER_INCIDENT) {
    return {
      outcome: 'lookup-limit',
      message: 'No lookups left for this incident. Decide with what you have.',
      closed: false,
      penalty: 0,
    }
  }
  const lines = incident.scenario.lookups?.[parsed.normalized] ?? [
    `No records for ${parsed.target} in this scope.`,
  ]
  incident.lookups.push({ command: parsed.normalized, lines })
  return {
    outcome: 'lookup',
    message: `${parsed.normalized}: ${lines.length} record${lines.length === 1 ? '' : 's'} found.`,
    closed: false,
    penalty: 0,
  }
}

function confirmStep(incident, at) {
  const { scenario } = incident
  const done = countEvents(incident, 'ok')
  incident.events.push({ at, kind: 'ok' })
  const closed = scenario.decoy || done + 1 === scenario.steps.length
  if (!closed) {
    return {
      outcome: 'step',
      message: 'Step confirmed. The incident is still active.',
      closed,
      penalty: 0,
    }
  }
  const mistakes = countEvents(incident, 'bad')
  incident.resolution = { at, outcome: mistakes ? 'wrong' : 'correct', closedByMistake: false }
  const message = scenario.decoy ? 'Alert dismissed as a false positive.' : 'Containment confirmed.'
  return { outcome: 'correct', message, closed, penalty: 0 }
}

// a one-step incident closes on the first mistake, a two-step one after the mistake limit
function recordMistake(incident, at, timed) {
  incident.events.push({ at, kind: 'bad' })
  const closed =
    incident.scenario.steps.length < 2 || countEvents(incident, 'bad') >= MAX_MISTAKES_PER_INCIDENT
  if (closed) incident.resolution = { at, outcome: 'wrong', closedByMistake: true }
  let message = closed
    ? 'That action did not resolve the incident. Incident closed.'
    : 'That was the wrong action. The incident is still open.'
  if (timed) message += ` ${TIME_PENALTY_SECONDS} seconds were cut from the clock.`
  return { outcome: 'wrong', message, closed, penalty: timed ? TIME_PENALTY_SECONDS : 0 }
}

// a decoy is closed by dismiss; a real incident needs each containment step in order
function runAction(incident, parsed, at, timed) {
  const { scenario } = incident
  incident.commands.push(parsed.normalized)
  const next = scenario.steps[countEvents(incident, 'ok')]
  const correct = scenario.decoy
    ? parsed.verb === 'dismiss'
    : Boolean(next) && parsed.verb === next.verb && parsed.target === next.target
  return correct ? confirmStep(incident, at) : recordMistake(incident, at, timed)
}

function applyCommand(incident, parsed, at, timed) {
  if (!parsed.ok) {
    return { outcome: 'syntax', message: SYNTAX_HINTS[parsed.reason], closed: false, penalty: 0 }
  }
  if (parsed.kind === 'lookup') return runLookup(incident, parsed)
  return runAction(incident, parsed, at, timed)
}

export function createCliDefenderService({
  now = Date.now,
  randomInt = cryptoRandomInt,
  createId = randomUUID,
  scenarios = SCENARIOS,
  maxRuns = MAX_RUNS,
} = {}) {
  const runs = new Map()

  // a paused run and a finished run whose save failed wait longer, so the player can come back
  function isExpired(run, wall) {
    const waiting = run.pausedAt !== null || (run.completion && !run.savedAttempt)
    return wall - run.lastActivityAt > (waiting ? HOLD_MS : IDLE_MS)
  }

  // the paused time that counts: past the budget the game clock runs again while the alert stays hidden
  function pausedSpan(run, wall) {
    if (run.pausedAt === null) return 0
    const left = run.heldForLeave
      ? LEAVE_HOLD_MS - run.leaveHeldTotal
      : PAUSE_BUDGET_MS - run.pausedTotal
    return Math.min(wall - run.pausedAt, Math.max(0, left))
  }

  // game time skips paused spans, so every deadline freezes while a timed shift is paused
  function gameTime(run, wall) {
    return wall - run.pausedTotal - run.leaveHeldTotal - pausedSpan(run, wall)
  }

  function endPause(run, wall) {
    if (run.heldForLeave) run.leaveHeldTotal += pausedSpan(run, wall)
    else run.pausedTotal += pausedSpan(run, wall)
    run.pausedAt = null
    run.heldForLeave = false
  }

  // lower is safer to drop; null marks a run someone may still be playing
  function evictionRank(run, wall) {
    if (run.completion) return run.savedAttempt ? 0 : 2
    if (run.pausedAt !== null || deriveProgress(run, gameTime(run, wall)).finished) return 1
    return null
  }

  function leastUseful(wall) {
    let chosen = null
    let chosenRank = null
    for (const run of runs.values()) {
      const rank = evictionRank(run, wall)
      if (rank === null) continue
      const better =
        chosen === null ||
        rank < chosenRank ||
        (rank === chosenRank && run.lastActivityAt < chosen.lastActivityAt)
      if (better) {
        chosen = run
        chosenRank = rank
      }
    }
    return chosen
  }

  // one player only ever displaces their own runs; a full store drops idle runs, never a live game
  function makeRoom(owner, wall) {
    for (const [runId, run] of runs) if (isExpired(run, wall)) runs.delete(runId)
    // a live run ranks last, then the least useful goes first; activity only breaks a tie
    const keepRank = (run) => evictionRank(run, wall) ?? Infinity
    const own = [...runs.values()]
      .filter((run) => run.playerId === owner)
      .sort((a, b) => {
        const byRank = keepRank(a) - keepRank(b)
        return byRank === 0 || Number.isNaN(byRank) ? a.lastActivityAt - b.lastActivityAt : byRank
      })
    while (own.length >= MAX_RUNS_PER_PLAYER) runs.delete(own.shift().runId)
    if (runs.size < maxRuns) return
    const spare = leastUseful(wall)
    if (!spare) throw terminalFull()
    runs.delete(spare.runId)
  }

  // another player's run is indistinguishable from an unknown one
  function requireRun(runId, owner) {
    const run = runs.get(runId)
    if (run && isExpired(run, now())) runs.delete(runId)
    else if (run && run.playerId === owner) return run
    throw runNotFound()
  }

  function pauseBudget(run, wall) {
    if (run.mode !== 'timed') return null
    const span = pausedSpan(run, wall)
    return {
      pausesLeft: MAX_PAUSES_PER_RUN - run.pauseCount,
      msLeft: Math.max(0, PAUSE_BUDGET_MS - run.pausedTotal - (run.heldForLeave ? 0 : span)),
      leaveHoldMsLeft: Math.max(
        0,
        LEAVE_HOLD_MS - run.leaveHeldTotal - (run.heldForLeave ? span : 0),
      ),
    }
  }

  function runStatus(run, progress) {
    if (run.completion) return 'completed'
    return progress.finished ? 'finished' : 'active'
  }

  function snapshot(run, at) {
    const progress = deriveProgress(run, at)
    const incident = progress.current && run.incidents[progress.current.index]
    const scenario = incident?.scenario
    const resolved = progress.incidents.filter(isResolved)
    return {
      gameId: GAME_ID,
      rulesetVersion: RULESET_VERSION,
      runId: run.runId,
      mode: run.mode,
      status: runStatus(run, progress),
      serverNow: at,
      paused: run.pausedAt !== null,
      heldForLeave: run.heldForLeave,
      pauseBudget: pauseBudget(run, now()),
      incidentCount: run.incidents.length,
      resolvedCount: resolved.length,
      current: progress.current && {
        incidentId: progress.current.incidentId,
        index: progress.current.index,
        opensAt: progress.current.opensAt,
        closesAt: progress.current.closesAt,
        windowSeconds: run.mode === 'timed' ? incident.windowSeconds : null,
        alert: run.pausedAt === null ? publicAlert(scenario) : null,
        hintLine: incident.hintUsed ? scenario.keyLine : null,
        hintLookup: incident.hintUsed ? scenario.hintLookup : null,
        hintTier: incident.hintTier ?? 0,
        hintConcept: (incident.hintTier ?? 0) >= 2 ? scenario.hintConcept : null,
        stepsDone: progress.current.stepsDone,
        mistakes: progress.current.mistakes,
        penaltySeconds: progress.current.penaltySeconds,
        lookups: {
          used: incident.lookups.length,
          limit: MAX_LOOKUPS_PER_INCIDENT,
          results: incident.lookups.map((item) => ({
            command: item.command,
            lines: [...item.lines],
          })),
        },
      },
      history: resolved.map(({ incidentId: id, index, outcome, pointsAwarded }) => ({
        incidentId: id,
        index,
        outcome,
        pointsAwarded,
      })),
      score: progress.score,
      streak: progress.streak,
      multiplier: progress.multiplier,
      maxScore: MAX_SCORE,
      saved: false,
      context: run.context,
    }
  }

  function startRun({ mode, context = null }, owner) {
    const at = now()
    makeRoom(owner, at)
    const windows = generateWindows(randomInt)
    const run = {
      runId: createId(),
      playerId: owner,
      context,
      mode,
      startedAt: at,
      endedAt: null,
      lastActivityAt: at,
      pausedAt: null,
      pausedTotal: 0,
      pauseCount: 0,
      heldForLeave: false,
      leaveHeldTotal: 0,
      incidents: pickScenarios(scenarios, randomInt).map((scenario, index) => ({
        id: incidentId(index),
        scenario,
        windowSeconds: windows[index],
        resolution: null,
        hintUsed: false,
        hintTier: 0,
        events: [],
        lookups: [],
        commands: [],
      })),
      actions: new Map(),
      completion: null,
      savedAttempt: null,
    }
    runs.set(run.runId, run)
    return snapshot(run, at)
  }

  function getRun(runId, owner) {
    const run = requireRun(runId, owner)
    return snapshot(run, gameTime(run, now()))
  }

  // practice only, two tiers: 1 names the evidence line and a lookup, 2 adds the concept; never the answer
  function hintRun(runId, { incidentId: target }, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.mode !== 'practice' || run.completion) throw hintUnavailable()
    const progress = deriveProgress(run, gameTime(run, wall))
    if (!progress.current || progress.current.incidentId !== target) throw incidentClosed()
    const incident = run.incidents[progress.current.index]
    if ((incident.hintTier ?? 0) >= MAX_HINT_TIER) throw hintExhausted()
    incident.hintTier = (incident.hintTier ?? 0) + 1
    incident.hintUsed = true
    run.lastActivityAt = wall
    return {
      ...snapshot(run, gameTime(run, wall)),
      hint: {
        incidentId: target,
        lineIndex: incident.scenario.keyLine,
        lookup: incident.scenario.hintLookup,
        tier: incident.hintTier,
        concept: incident.hintTier >= 2 ? incident.scenario.hintConcept : null,
      },
    }
  }

  function pauseRun(runId, owner, { forLeave = false } = {}) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.mode !== 'timed' || run.completion) throw pauseUnavailable()
    if (run.pausedAt === null && !deriveProgress(run, gameTime(run, wall)).finished) {
      if (forLeave) {
        if (run.leaveHeldTotal >= LEAVE_HOLD_MS) throw leaveHoldSpent()
        run.heldForLeave = true
      } else {
        if (run.pauseCount >= MAX_PAUSES_PER_RUN || run.pausedTotal >= PAUSE_BUDGET_MS)
          throw pausesSpent()
        run.pauseCount += 1
      }
      run.pausedAt = wall
      run.lastActivityAt = wall
    }
    return snapshot(run, gameTime(run, wall))
  }

  function resumeRun(runId, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.pausedAt !== null) {
      endPause(run, wall)
      run.lastActivityAt = wall
    }
    return snapshot(run, gameTime(run, wall))
  }

  function submitCommand(runId, { actionId, incidentId: target, command }, owner) {
    const run = requireRun(runId, owner)
    const fingerprint = `${target}\n${command}`
    const previous = run.actions.get(actionId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw actionConflict()
      return previous.response
    }
    if (run.completion) throw runFinished()
    if (run.pausedAt !== null) throw runPaused()
    if (run.actions.size >= MAX_COMMANDS_PER_RUN) throw commandLimit()
    // the receipt time is taken once on the server, so a browser clock cannot extend a window
    const wall = now()
    const at = gameTime(run, wall)
    const before = deriveProgress(run, at)
    if (!before.current || before.current.incidentId !== target) throw incidentClosed()
    run.lastActivityAt = wall

    const parsed = parseCommand(command)
    const incident = run.incidents[before.current.index]
    const { outcome, message, closed, penalty } = applyCommand(
      incident,
      parsed,
      at,
      run.mode === 'timed',
    )
    const after = snapshot(run, at)
    const response = {
      ...after,
      outcome,
      message,
      review: closed ? review(incident.scenario) : null,
      command: parsed.ok ? parsed.normalized : null,
      incidentClosed: closed,
      timePenaltySeconds: penalty,
      pointsAwarded: outcome === 'syntax' ? 0 : after.score - before.score,
    }
    run.actions.set(actionId, { fingerprint, response })
    return response
  }

  function completeRun(runId, { actionId }, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.completion) {
      run.lastActivityAt = wall
      return { ...run.completion, actionId }
    }
    const at = gameTime(run, wall)
    const progress = deriveProgress(run, at)
    if (!progress.finished) {
      if (run.mode === 'timed') throw runNotFinished()
      run.endedAt = at
    }
    run.lastActivityAt = wall
    if (run.pausedAt !== null) endPause(run, wall)
    const final = deriveProgress(run, at)
    const count = (outcome) => final.incidents.filter((item) => item.outcome === outcome).length
    // the saved attempt keeps all eight outcomes; the debrief only explains what the player reached
    run.finalIncidents = final.incidents
    const reached = reachedIncidents(final.incidents)

    const debrief = reached.map((item) => {
      const incident = run.incidents[item.index]
      const commands = expectedCommands(incident.scenario)
      return {
        incidentId: item.incidentId,
        index: item.index,
        title: incident.scenario.alert.title,
        topic: incident.scenario.topic,
        outcome: item.outcome,
        yourCommand: incident.commands.at(-1) ?? null,
        yourCommands: [...incident.commands],
        lookupsUsed: incident.lookups.length,
        decoy: Boolean(incident.scenario.decoy),
        concepts: concepts(incident.scenario),
        hintUsed: incident.hintUsed,
        expectedCommand: commands.join(' then '),
        expectedCommands: commands,
        explanation: incident.scenario.explanation,
        pointsAwarded: item.pointsAwarded,
      }
    })

    const topicOutcomes = outcomesByTopic(debrief).map(({ topic, achieved, feedbackCode }) => ({
      topic,
      label: TOPICS[topic],
      achieved,
      feedbackCode,
    }))

    const correct = count('correct')
    run.completion = {
      gameId: GAME_ID,
      rulesetVersion: RULESET_VERSION,
      runId: run.runId,
      mode: run.mode,
      status: 'completed',
      score: final.score,
      maxScore: MAX_SCORE,
      saved: false,
      result: {
        correct,
        wrong: count('wrong'),
        missed: count('missed'),
        skipped: count('skipped'),
        bestStreak: final.bestStreak,
      },
      feedback: { summary: debriefSummary(correct, reached.length, run.incidents.length) },
      topicOutcomes,
      debrief,
    }
    return { ...run.completion, actionId }
  }

  // finishes the run, then stores it as a saved attempt exactly once (resultKey is the run id).
  // a failed save keeps the score on screen with saved:false and a code, and a retry saves it
  async function completeAndRecord(runId, body, owner, attempts) {
    const completion = completeRun(runId, body, owner)
    const run = runs.get(runId)
    if (!run.savedAttempt) {
      const incidents = run.finalIncidents.map((item) => ({
        scenarioId: run.incidents[item.index].scenario.id,
        outcome: item.outcome,
        hintUsed: run.incidents[item.index].hintUsed,
        trail: run.incidents[item.index].events.map((event) => event.kind),
      }))
      try {
        run.savedAttempt = await attempts.recordCompletedAttempt({ id: owner }, GAME_ID, {
          context: run.context,
          mode: run.mode === 'timed' ? 'standard' : 'practice',
          startedAt: new Date(run.startedAt),
          state: { mode: run.mode, incidents },
          resultKey: run.runId,
        })
      } catch (error) {
        if (error?.name !== 'AttemptError' && error?.name !== 'CohortError') throw error
        return {
          ...completion,
          saved: false,
          saveError: { code: error.code, message: error.message },
        }
      }
    }
    const { attemptId, score, maxScore, persisted, context } = run.savedAttempt
    return {
      ...completion,
      saved: true,
      attempt: { attemptId, score, maxScore, persisted, context },
    }
  }

  return {
    startRun,
    getRun,
    hintRun,
    pauseRun,
    resumeRun,
    submitCommand,
    completeRun,
    completeAndRecord,
  }
}
