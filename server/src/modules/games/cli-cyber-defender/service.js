import { randomInt as cryptoRandomInt, randomUUID } from 'node:crypto'
import { SYNTAX_HINTS, formatCommand, isIpv4, parseCommand } from './parser.js'
import {
  GAME_ID,
  INCIDENT_COUNT,
  MAX_COMMANDS_PER_RUN,
  MAX_SCORE,
  RULESET_VERSION,
  actionConflict,
  commandLimit,
  hintUnavailable,
  incidentClosed,
  pauseUnavailable,
  runPaused,
  runFinished,
  runNotFinished,
  runNotFound,
} from './policy.js'
import { RESPONSE_STAGE, SCENARIOS, TIER_PLAN, TOPICS } from './scenarios.js'
import { deriveProgress, generateWindows } from './schedule.js'

const MAX_RUNS = 500
const IDLE_MS = 10 * 60 * 1000

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

// a shift draws easy, then medium, then hard incidents, shuffled within each tier
function pickScenarios(pool, randomInt) {
  const picked = TIER_PLAN.flatMap(({ tier, count }) =>
    shuffle(
      pool.filter((scenario) => scenario.tier === tier),
      randomInt,
    ).slice(0, count),
  )
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

function review(scenario) {
  const { verb, target } = scenario.expected
  return {
    expectedCommand: formatCommand(verb, target),
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

export function createCliDefenderService({
  now = Date.now,
  randomInt = cryptoRandomInt,
  createId = randomUUID,
  scenarios = SCENARIOS,
} = {}) {
  const runs = new Map()

  function sweep(at) {
    for (const [runId, run] of runs) if (at - run.lastActivityAt > IDLE_MS) runs.delete(runId)
    while (runs.size >= MAX_RUNS) runs.delete(runs.keys().next().value)
  }

  // another player's run is indistinguishable from an unknown one
  function requireRun(runId, owner) {
    const run = runs.get(runId)
    if (run && now() - run.lastActivityAt > IDLE_MS) runs.delete(runId)
    else if (run && run.playerId === owner) return run
    throw runNotFound()
  }

  // game time skips paused spans, so every deadline freezes while a timed shift is paused
  function gameTime(run, wall) {
    return wall - run.pausedTotal - (run.pausedAt === null ? 0 : wall - run.pausedAt)
  }

  function snapshot(run, at) {
    const progress = deriveProgress(run, at)
    const scenario = progress.current && run.incidents[progress.current.index].scenario
    return {
      gameId: GAME_ID,
      rulesetVersion: RULESET_VERSION,
      runId: run.runId,
      mode: run.mode,
      status: run.completion ? 'completed' : progress.finished ? 'finished' : 'active',
      serverNow: at,
      paused: run.pausedAt !== null,
      incidentCount: run.incidents.length,
      resolvedCount: progress.incidents.filter(
        (item) => !['open', 'pending'].includes(item.outcome),
      ).length,
      current: progress.current && {
        incidentId: progress.current.incidentId,
        index: progress.current.index,
        opensAt: progress.current.opensAt,
        closesAt: progress.current.closesAt,
        windowSeconds:
          run.mode === 'timed' ? run.incidents[progress.current.index].windowSeconds : null,
        alert: run.pausedAt === null ? publicAlert(scenario) : null,
        hintLine: run.incidents[progress.current.index].hintUsed ? scenario.keyLine : null,
      },
      history: progress.incidents
        .filter((item) => !['open', 'pending'].includes(item.outcome))
        .map(({ incidentId: id, index, outcome, pointsAwarded }) => ({
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
    sweep(at)
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
      incidents: pickScenarios(scenarios, randomInt).map((scenario, index) => ({
        id: incidentId(index),
        scenario,
        windowSeconds: windows[index],
        resolution: null,
        hintUsed: false,
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

  // practice only: names the evidence line, never the answer, and is marked in the debrief
  function hintRun(runId, { incidentId: target }, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.mode !== 'practice' || run.completion) throw hintUnavailable()
    const progress = deriveProgress(run, gameTime(run, wall))
    if (!progress.current || progress.current.incidentId !== target) throw incidentClosed()
    const incident = run.incidents[progress.current.index]
    incident.hintUsed = true
    run.lastActivityAt = wall
    return {
      ...snapshot(run, gameTime(run, wall)),
      hint: { incidentId: target, lineIndex: incident.scenario.keyLine },
    }
  }

  function pauseRun(runId, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.mode !== 'timed' || run.completion) throw pauseUnavailable()
    if (run.pausedAt === null && !deriveProgress(run, gameTime(run, wall)).finished) {
      run.pausedAt = wall
      run.lastActivityAt = wall
    }
    return snapshot(run, gameTime(run, wall))
  }

  function resumeRun(runId, owner) {
    const run = requireRun(runId, owner)
    const wall = now()
    if (run.pausedAt !== null) {
      run.pausedTotal += wall - run.pausedAt
      run.pausedAt = null
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
    let outcome = 'syntax'
    let message = SYNTAX_HINTS[parsed.reason]
    if (parsed.ok) {
      const incident = run.incidents[before.current.index]
      const { verb, target: expected } = incident.scenario.expected
      outcome = parsed.verb === verb && parsed.target === expected ? 'correct' : 'wrong'
      incident.resolution = { at, outcome, command: parsed.normalized }
      message =
        outcome === 'correct'
          ? 'Containment confirmed.'
          : 'That action did not contain the incident. Incident closed.'
    }
    const after = snapshot(run, at)
    const response = {
      ...after,
      outcome,
      message,
      review: parsed.ok ? review(run.incidents[before.current.index].scenario) : null,
      command: parsed.ok ? parsed.normalized : null,
      pointsAwarded:
        outcome === 'syntax'
          ? 0
          : after.history.find((item) => item.incidentId === target).pointsAwarded,
    }
    run.actions.set(actionId, { fingerprint, response })
    return response
  }

  function completeRun(runId, { actionId }, owner) {
    const run = requireRun(runId, owner)
    if (run.completion) return { ...run.completion, actionId }
    const wall = now()
    const at = gameTime(run, wall)
    const progress = deriveProgress(run, at)
    if (!progress.finished) {
      if (run.mode === 'timed') throw runNotFinished()
      run.endedAt = at
    }
    run.lastActivityAt = wall
    const final = deriveProgress(run, at)
    const count = (outcome) => final.incidents.filter((item) => item.outcome === outcome).length

    const debrief = final.incidents.map((item) => {
      const incident = run.incidents[item.index]
      const { verb, target } = incident.scenario.expected
      return {
        incidentId: item.incidentId,
        index: item.index,
        title: incident.scenario.alert.title,
        topic: incident.scenario.topic,
        outcome: item.outcome,
        yourCommand: incident.resolution?.command ?? null,
        concepts: concepts(incident.scenario),
        hintUsed: incident.hintUsed,
        expectedCommand: formatCommand(verb, target),
        explanation: incident.scenario.explanation,
        pointsAwarded: item.pointsAwarded,
      }
    })

    const topicOutcomes = Object.keys(TOPICS)
      .filter((topic) => debrief.some((item) => item.topic === topic))
      .map((topic) => {
        const achieved = debrief
          .filter((item) => item.topic === topic)
          .every((item) => item.outcome === 'correct')
        const code = topic.toUpperCase().replace(/-/g, '_')
        return {
          topic,
          label: TOPICS[topic],
          achieved,
          feedbackCode: `CLI_${code}_${achieved ? 'ACHIEVED' : 'MISSED'}`,
        }
      })

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
      feedback: {
        summary: `You contained ${correct} of ${run.incidents.length} incidents.`,
      },
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
      const incidents = run.completion.debrief.map((item) => ({
        scenarioId: run.incidents[item.index].scenario.id,
        outcome: item.outcome,
        hintUsed: item.hintUsed,
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
