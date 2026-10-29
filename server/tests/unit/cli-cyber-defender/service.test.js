import { describe, expect, it } from 'vitest'
import {
  formatCommand,
  parseCommand,
} from '../../../src/modules/games/cli-cyber-defender/parser.js'
import { CliError } from '../../../src/modules/games/cli-cyber-defender/policy.js'
import { SCENARIOS } from '../../../src/modules/games/cli-cyber-defender/scenarios.js'
import {
  createCliDefenderService,
  segmentLine,
} from '../../../src/modules/games/cli-cyber-defender/service.js'

const RUN_ID = '11111111-1111-4111-8111-111111111111'

// randomInt(n) => 0 keeps the scenario order and front-loads the 10-second windows
function setup(start = 1_000_000) {
  const clock = { now: start }
  const service = createCliDefenderService({
    now: () => clock.now,
    randomInt: () => 0,
    createId: () => RUN_ID,
  })
  return { clock, service }
}

let action = 0
const nextAction = () => `action-${String((action += 1)).padStart(4, '0')}`

const scenarioOf = (snapshot) =>
  SCENARIOS.find((item) => item.alert.title === snapshot.current.alert.title)

function answersFor(snapshot) {
  const scenario = scenarioOf(snapshot)
  return scenario.steps.length
    ? scenario.steps.map(({ verb, target }) => formatCommand(verb, target))
    : ['dismiss']
}

// a command that is wrong for this incident, whatever its type
function wrongFor(snapshot) {
  return scenarioOf(snapshot).decoy ? 'isolate host not-the-host' : 'dismiss'
}

function send(service, snapshot, command) {
  return service.submitCommand(RUN_ID, {
    actionId: nextAction(),
    incidentId: snapshot.current.incidentId,
    command,
  })
}

// plays every step of the open incident and returns the last response
function solve(service, snapshot, clock) {
  let last = snapshot
  for (const command of answersFor(snapshot)) {
    if (clock) clock.now += 1000
    last = send(service, snapshot, command)
  }
  return last
}

function advanceTo(service, snapshot, predicate, clock) {
  let current = snapshot
  while (current.current && !predicate(scenarioOf(current)))
    current = solve(service, current, clock)
  return current
}

function expectCliError(fn, code) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(CliError)
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`expected ${code}`)
}

describe('cli defender service', () => {
  it('starts a run with only the current alert and no answers', () => {
    const { service } = setup()
    const snapshot = service.startRun({ mode: 'timed' })
    expect(snapshot).toMatchObject({
      gameId: 'cli-cyber-defender',
      rulesetVersion: 'cli-3',
      runId: RUN_ID,
      mode: 'timed',
      status: 'active',
      incidentCount: 8,
      score: 0,
      maxScore: 2700,
      saved: false,
    })
    expect(snapshot.current).toMatchObject({
      incidentId: 'incident-01',
      windowSeconds: 30,
      stepsDone: 0,
      mistakes: 0,
      penaltySeconds: 0,
      lookups: { used: 0, limit: 6, results: [] },
    })
    const payload = JSON.stringify(snapshot)
    for (const word of ['decoy', '"steps"', 'expected', 'twoStep'])
      expect(payload).not.toContain(word)
    for (const scenario of SCENARIOS) {
      expect(payload).not.toContain(scenario.explanation)
      for (const lines of Object.values(scenario.lookups))
        for (const line of lines) expect(payload).not.toContain(line)
    }
  })

  it('plays a perfect timed shift to 2,700 including two-step incidents', () => {
    const { clock, service } = setup()
    let snapshot = service.startRun({ mode: 'timed' })
    const outcomes = []
    while (snapshot.current) {
      for (const command of answersFor(snapshot)) {
        clock.now += 1000
        const response = send(service, snapshot, command.toUpperCase())
        outcomes.push(response.outcome)
        if (response.outcome === 'step') {
          expect(response.review).toBeNull()
          expect(response.incidentClosed).toBe(false)
          expect(response.current.stepsDone).toBe(1)
          expect(response.current.incidentId).toBe(snapshot.current.incidentId)
        } else snapshot = response
      }
    }
    expect(outcomes.filter((item) => item === 'step')).toHaveLength(2)
    expect(snapshot.score).toBe(2700)
    expect(snapshot.score).toBe(snapshot.maxScore)
    expect(snapshot.status).toBe('finished')
    const result = service.completeRun(RUN_ID, { actionId: nextAction() })
    expect(result).toMatchObject({ score: 2700, maxScore: 2700, saved: false, status: 'completed' })
    expect(result.result).toMatchObject({ correct: 8, wrong: 0, missed: 0, bestStreak: 10 })
    expect(result.debrief).toHaveLength(8)
    expect(result.debrief.filter((item) => item.decoy)).toHaveLength(2)
    for (const item of result.debrief) expect(item.expectedCommands).toEqual(item.yourCommands)
    expect(result.topicOutcomes.every((topic) => topic.achieved)).toBe(true)
    const again = service.completeRun(RUN_ID, { actionId: nextAction() })
    expect(again.score).toBe(result.score)
    expectCliError(
      () =>
        service.submitCommand(RUN_ID, {
          actionId: nextAction(),
          incidentId: 'incident-08',
          command: 'block ip 192.0.2.1',
        }),
      'CLI_RUN_FINISHED',
    )
  })

  it('dismisses a decoy and treats containment of a decoy as a mistake', () => {
    const { clock, service } = setup()
    const decoy = advanceTo(service, service.startRun({ mode: 'timed' }), (s) => s.decoy, clock)
    expect(scenarioOf(decoy).decoy).toBe(true)
    const wrong = send(service, decoy, 'block ip 192.0.2.250')
    expect(wrong).toMatchObject({ outcome: 'wrong', incidentClosed: true, pointsAwarded: 0 })
    expect(wrong.review).toMatchObject({ decoy: true, expectedCommand: 'dismiss' })
    expect(wrong.streak).toBe(0)
    const fresh = setup()
    const again = advanceTo(
      fresh.service,
      fresh.service.startRun({ mode: 'timed' }),
      (s) => s.decoy,
    )
    const ok = send(fresh.service, again, 'dismiss')
    expect(ok).toMatchObject({ outcome: 'correct', incidentClosed: true })
    expect(ok.pointsAwarded).toBeGreaterThan(0)
    expect(ok.message).toMatch(/dismissed/i)
  })

  it('treats dismissing a real incident as a mistake', () => {
    const { clock, service } = setup()
    const real = advanceTo(service, service.startRun({ mode: 'timed' }), (s) => !s.decoy, clock)
    const response = send(service, real, 'dismiss')
    expect(response).toMatchObject({ outcome: 'wrong', incidentClosed: true, score: real.score })
    expect(response.review.decoy).toBe(false)
  })

  it('carries the time penalty to the next window when a mistake closes the incident (timed only)', () => {
    const { service } = setup()
    const started = service.startRun({ mode: 'timed' })
    const wrong = send(service, started, wrongFor(started))
    expect(wrong).toMatchObject({ outcome: 'wrong', incidentClosed: true, timePenaltySeconds: 5 })
    const next = wrong.current
    expect(next.penaltySeconds).toBe(5)
    expect((next.closesAt - next.opensAt) / 1000).toBe(next.windowSeconds - 5)

    const practice = setup()
    const first = practice.service.startRun({ mode: 'practice' })
    const mistake = send(practice.service, first, wrongFor(first))
    expect(mistake.timePenaltySeconds).toBe(0)
    expect(mistake.current).toMatchObject({ closesAt: null, penaltySeconds: 0 })
  })

  it('keeps a two-step incident open until both ordered steps are done', () => {
    const { clock, service } = setup()
    const hard = advanceTo(service, service.startRun({ mode: 'timed' }), (s) => s.tier === 3, clock)
    const [first, second] = answersFor(hard)
    const before = hard.current.closesAt
    // the second step first is a mistake that costs 5 seconds but leaves the incident open
    const early = send(service, hard, second)
    expect(early).toMatchObject({ outcome: 'wrong', incidentClosed: false, timePenaltySeconds: 5 })
    expect(early.review).toBeNull()
    expect(early.current).toMatchObject({ incidentId: hard.current.incidentId, mistakes: 1 })
    expect(early.current.closesAt).toBe(before - 5000)
    expect(early.current.penaltySeconds).toBe(5)
    const step = send(service, hard, first)
    expect(step).toMatchObject({ outcome: 'step', incidentClosed: false })
    expect(step.pointsAwarded).toBe(100)
    expect(step.current.stepsDone).toBe(1)
    expect(JSON.stringify(step)).not.toContain(second)
    const done = send(service, hard, second)
    expect(done).toMatchObject({ outcome: 'correct', incidentClosed: true })
    expect(done.pointsAwarded).toBe(200)
    expect(done.review.expectedCommands).toEqual([first, second])
    // completed with a mistake: both steps scored, but the incident is not a clean success
    expect(done.history.at(-1)).toMatchObject({ outcome: 'wrong', pointsAwarded: 300 })
  })

  it('closes a two-step incident after three mistakes and ends it when the window runs out', () => {
    const { clock, service } = setup()
    const hard = advanceTo(service, service.startRun({ mode: 'timed' }), (s) => s.tier === 3, clock)
    send(service, hard, 'dismiss')
    send(service, hard, 'dismiss')
    const third = send(service, hard, 'dismiss')
    expect(third).toMatchObject({ outcome: 'wrong', incidentClosed: true })
    expect(third.review.expectedCommands).toHaveLength(2)

    const slow = setup()
    const second = advanceTo(
      slow.service,
      slow.service.startRun({ mode: 'timed' }),
      (s) => s.tier === 3,
      slow.clock,
    )
    const stepped = send(slow.service, second, answersFor(second)[0])
    slow.clock.now = stepped.current.closesAt
    expect(slow.service.getRun(RUN_ID).history.at(-1)).toMatchObject({
      outcome: 'missed',
      pointsAwarded: stepped.pointsAwarded,
    })
  })

  it('answers lookups from scripted lines without scoring or breaking the streak', () => {
    const { service } = setup()
    const started = service.startRun({ mode: 'timed' })
    const scenario = scenarioOf(started)
    const key = Object.keys(scenario.lookups)[0]
    const lookup = send(service, started, key.toUpperCase())
    expect(lookup).toMatchObject({ outcome: 'lookup', pointsAwarded: 0, score: 0, review: null })
    expect(lookup.current.lookups).toMatchObject({
      used: 1,
      limit: 6,
      results: [{ command: key, lines: scenario.lookups[key] }],
    })
    expect(lookup.current.closesAt).toBe(started.current.closesAt)
    const unknown = send(service, started, 'logs nowhere-9')
    expect(unknown.current.lookups.results[1].lines[0]).toMatch(/No records for nowhere-9/)
    const solved = solve(service, started)
    expect(solved.score).toBeGreaterThan(0)
    // a lookup between two correct answers keeps the streak
    const second = solved
    send(service, second, 'whois 192.0.2.1')
    const third = solve(service, second)
    expect(third.streak).toBeGreaterThanOrEqual(2)
  })

  it('allows at most six lookups per incident and caps the whole run at 120 commands', () => {
    const { service } = setup()
    const started = service.startRun({ mode: 'practice' })
    let last
    for (let index = 0; index < 6; index += 1) last = send(service, started, `logs host-${index}`)
    expect(last.outcome).toBe('lookup')
    const over = send(service, started, 'logs host-7')
    expect(over).toMatchObject({ outcome: 'lookup-limit', pointsAwarded: 0 })
    expect(over.current.lookups.used).toBe(6)
    expect(over.current.incidentId).toBe('incident-01')
    // a fresh incident has its own allowance
    const next = solve(service, started)
    expect(send(service, next, 'logs host-1').current.lookups.used).toBe(1)
    for (let index = 0; index < 120 - 8 - answersFor(started).length; index += 1)
      send(service, next, 'help me')
    expectCliError(() => send(service, next, 'help me'), 'CLI_COMMAND_LIMIT')
  })

  it('keeps the incident open after a syntax error', () => {
    const { service } = setup()
    service.startRun({ mode: 'timed' })
    const snapshot = service.submitCommand(RUN_ID, {
      actionId: nextAction(),
      incidentId: 'incident-01',
      command: 'blok ip 203.0.113.45',
    })
    expect(snapshot.outcome).toBe('syntax')
    expect(snapshot.message).toMatch(/not recognised/)
    expect(snapshot.current.incidentId).toBe('incident-01')
  })

  it('rejects a command that arrives at the deadline', () => {
    const { clock, service } = setup()
    const snapshot = service.startRun({ mode: 'timed' })
    clock.now = snapshot.current.closesAt
    expectCliError(() => send(service, snapshot, answersFor(snapshot)[0]), 'CLI_INCIDENT_CLOSED')
    const later = service.getRun(RUN_ID)
    expect(later.history[0]).toMatchObject({ incidentId: 'incident-01', outcome: 'missed' })
    expect(later.current.incidentId).toBe('incident-02')
  })

  it('accepts a command one millisecond before the deadline', () => {
    const { clock, service } = setup()
    const snapshot = service.startRun({ mode: 'timed' })
    clock.now = snapshot.current.closesAt - 1
    expect(send(service, snapshot, answersFor(snapshot)[0]).outcome).toBe('correct')
  })

  it('replays a duplicate action and rejects a reused id with different input', () => {
    const { clock, service } = setup()
    const snapshot = service.startRun({ mode: 'timed' })
    const body = {
      actionId: 'retry-action-1',
      incidentId: 'incident-01',
      command: answersFor(snapshot)[0],
    }
    const first = service.submitCommand(RUN_ID, body)
    clock.now += 2000
    const second = service.submitCommand(RUN_ID, body)
    expect(second).toEqual(first)
    expect(second.score).toBe(100)
    expectCliError(
      () => service.submitCommand(RUN_ID, { ...body, command: 'block ip 192.0.2.1' }),
      'CLI_ACTION_CONFLICT',
    )
    const lookupBody = {
      actionId: 'lookup-retry-1',
      incidentId: 'incident-02',
      command: 'logs lab-02',
    }
    const lookup = service.submitCommand(RUN_ID, lookupBody)
    expect(service.submitCommand(RUN_ID, lookupBody)).toBe(lookup)
    expect(lookup.current.lookups.used).toBe(1)
  })

  it('refuses to complete a timed run early but lets practice end early', () => {
    const { service } = setup()
    service.startRun({ mode: 'timed' })
    expectCliError(
      () => service.completeRun(RUN_ID, { actionId: nextAction() }),
      'CLI_RUN_NOT_FINISHED',
    )
    const practice = setup()
    const snapshot = practice.service.startRun({ mode: 'practice' })
    expect(snapshot.current.closesAt).toBeNull()
    const result = practice.service.completeRun(RUN_ID, { actionId: nextAction() })
    expect(result.mode).toBe('practice')
    expect(result.result.skipped).toBe(8)
    expect(result.score).toBe(0)
  })

  it('finishes a timed run by expiry and reports every miss', () => {
    const { clock, service } = setup()
    service.startRun({ mode: 'timed' })
    clock.now += 300000
    expect(service.getRun(RUN_ID)).toMatchObject({ status: 'finished', current: null })
    const result = service.completeRun(RUN_ID, { actionId: nextAction() })
    expect(result.result.missed).toBe(8)
    expect(result.topicOutcomes.every((topic) => !topic.achieved)).toBe(true)
  })

  it('freezes the deadline while a timed shift is paused', () => {
    const { clock, service } = setup()
    const started = service.startRun({ mode: 'timed' })
    const remaining = started.current.closesAt - started.serverNow
    clock.now += 2000
    const paused = service.pauseRun(RUN_ID)
    expect(paused.paused).toBe(true)
    expect(paused.current.alert).toBeNull()
    // far longer than the whole shift passes while paused
    clock.now += 5 * 60 * 1000
    expect(service.getRun(RUN_ID)).toMatchObject({ paused: true, resolvedCount: 0 })
    expectCliError(() => send(service, started, answersFor(started)[0]), 'CLI_RUN_PAUSED')
    const resumed = service.resumeRun(RUN_ID)
    expect(resumed.paused).toBe(false)
    expect(resumed.current.incidentId).toBe('incident-01')
    expect(resumed.current.alert.title).toBe(started.current.alert.title)
    expect(resumed.current.closesAt - resumed.serverNow).toBe(remaining - 2000)
    expect(send(service, started, answersFor(started)[0]).outcome).toBe('correct')
  })

  it('still expires the window after resuming', () => {
    const { clock, service } = setup()
    const started = service.startRun({ mode: 'timed' })
    service.pauseRun(RUN_ID)
    clock.now += 30000
    service.resumeRun(RUN_ID)
    clock.now += started.current.closesAt - started.serverNow
    expect(service.getRun(RUN_ID).history[0]).toMatchObject({ outcome: 'missed' })
  })

  it('treats repeated pause and resume as no-ops and refuses practice pauses', () => {
    const { clock, service } = setup()
    service.startRun({ mode: 'timed' })
    service.pauseRun(RUN_ID)
    clock.now += 1000
    service.pauseRun(RUN_ID)
    clock.now += 1000
    const resumed = service.resumeRun(RUN_ID)
    const again = service.resumeRun(RUN_ID)
    expect(again.serverNow).toBe(resumed.serverNow)
    expect(again.current.closesAt).toBe(resumed.current.closesAt)
    const practice = setup()
    practice.service.startRun({ mode: 'practice' })
    expectCliError(() => practice.service.pauseRun(RUN_ID), 'CLI_PAUSE_UNAVAILABLE')
  })

  it('orders a shift easy to hard with two decoys and two two-step incidents every time', () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const service = createCliDefenderService({ createId: () => RUN_ID })
      const picked = []
      let snapshot = service.startRun({ mode: 'practice' })
      while (snapshot.current) {
        picked.push(scenarioOf(snapshot))
        snapshot = solve(service, snapshot)
      }
      expect(picked.map((item) => item.tier)).toEqual([1, 1, 1, 2, 2, 2, 3, 3])
      expect(picked.filter((item) => item.decoy)).toHaveLength(2)
      expect(picked.slice(0, 6).filter((item) => item.decoy)).toHaveLength(2)
      expect(picked.slice(6).map((item) => item.steps.length)).toEqual([2, 2])
      expect(snapshot.score).toBe(2700)
    }
  })

  it('reveals the review only once an incident closes', () => {
    const { service } = setup()
    const started = service.startRun({ mode: 'practice' })
    expect(JSON.stringify(started)).not.toContain('expectedCommand')
    const typo = send(service, started, 'blok ip 1.2.3.4')
    expect(typo.review).toBeNull()
    const wrong = send(service, started, wrongFor(started))
    const scenario = scenarioOf(started)
    expect(wrong.review).toEqual({
      expectedCommand: answersFor(started).join(' then '),
      expectedCommands: answersFor(started),
      decoy: Boolean(scenario.decoy),
      explanation: scenario.explanation,
      concepts: { ...scenario.concepts, stage: 'Containment' },
    })
  })

  it('gives practice hints that name a lookup and marks them in the debrief', () => {
    const { service } = setup()
    const started = service.startRun({ mode: 'practice' })
    const scenario = scenarioOf(started)
    expect(started.current.hintLookup).toBeNull()
    const hinted = service.hintRun(RUN_ID, { incidentId: 'incident-01' })
    expect(hinted.hint).toEqual({
      incidentId: 'incident-01',
      lineIndex: scenario.keyLine,
      lookup: scenario.hintLookup,
    })
    expect(hinted.current).toMatchObject({
      hintLine: scenario.keyLine,
      hintLookup: scenario.hintLookup,
    })
    expectCliError(
      () => service.hintRun(RUN_ID, { incidentId: 'incident-02' }),
      'CLI_INCIDENT_CLOSED',
    )
    const result = service.completeRun(RUN_ID, { actionId: nextAction() })
    expect(result.debrief[0]).toMatchObject({ hintUsed: true })
    expect(result.debrief[1]).toMatchObject({ hintUsed: false })
    expect(result.debrief[0].concepts.stage).toBe('Containment')
    const timed = setup()
    timed.service.startRun({ mode: 'timed' })
    expectCliError(
      () => timed.service.hintRun(RUN_ID, { incidentId: 'incident-01' }),
      'CLI_HINT_UNAVAILABLE',
    )
  })

  it('forgets idle runs', () => {
    const { clock, service } = setup()
    service.startRun({ mode: 'practice' })
    clock.now += 10 * 60 * 1000 + 1
    expectCliError(() => service.getRun(RUN_ID), 'CLI_RUN_NOT_FOUND')
  })
})

describe('alert segments', () => {
  it('makes every listed name tappable without losing text', () => {
    for (const scenario of SCENARIOS) {
      const segments = scenario.alert.lines.map((line) => segmentLine(line, scenario.entities))
      segments.forEach((parts, index) =>
        expect(parts.map((part) => part.text ?? part.target).join('')).toBe(
          scenario.alert.lines[index],
        ),
      )
      const targets = new Set(segments.flat().flatMap((part) => (part.target ? [part.target] : [])))
      expect([...targets].sort()).toEqual([...scenario.entities].sort())
      for (const step of scenario.steps) expect(targets.has(step.target)).toBe(true)
    }
  })

  it('matches names only as whole tokens', () => {
    expect(segmentLine('to 10.20.0.15 and 10.20.0.1.', ['10.20.0.1'])).toEqual([
      { text: 'to 10.20.0.15 and ' },
      { target: '10.20.0.1', kind: 'ip' },
      { text: '.' },
    ])
    expect(segmentLine('lab-02x and lab-02', ['lab-02'])).toEqual([
      { text: 'lab-02x and ' },
      { target: 'lab-02', kind: 'name' },
    ])
  })
})

describe('scenario integrity', () => {
  it('has a balanced pool of unique, answerable incidents', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(16)
    expect(new Set(SCENARIOS.map((item) => item.id)).size).toBe(SCENARIOS.length)
    expect(new Set(SCENARIOS.map((item) => item.alert.title)).size).toBe(SCENARIOS.length)
    const decoys = SCENARIOS.filter((item) => item.decoy)
    const twoStep = SCENARIOS.filter((item) => item.steps.length === 2)
    expect(decoys.length).toBeGreaterThanOrEqual(5)
    expect(twoStep.length).toBeGreaterThanOrEqual(3)
    expect(twoStep.every((item) => item.tier === 3)).toBe(true)
    expect(decoys.every((item) => item.steps.length === 0 && item.tier < 3)).toBe(true)
    const verbs = SCENARIOS.flatMap((item) => item.steps.map((step) => step.verb))
    for (const verb of ['block-ip', 'disable-user', 'isolate-host'])
      expect(verbs.filter((item) => item === verb).length).toBeGreaterThanOrEqual(3)
    for (const scenario of SCENARIOS) {
      const lookupText = Object.entries(scenario.lookups).flat(2).join(' ')
      const alertText = scenario.alert.lines.join(' ')
      for (const step of scenario.steps) {
        expect(formatCommand(step.verb, step.target).length).toBeLessThanOrEqual(120)
        // the culprit is a candidate in the alert and is revealed by a lookup, never named as such
        expect(alertText).toContain(step.target)
        expect(lookupText).toContain(step.target)
      }
      expect(Object.keys(scenario.lookups).length).toBeGreaterThanOrEqual(2)
      for (const key of Object.keys(scenario.lookups))
        expect(parseCommand(key)).toMatchObject({ ok: true, kind: 'lookup', normalized: key })
      expect(parseCommand(scenario.hintLookup)).toMatchObject({ ok: true, kind: 'lookup' })
      expect(scenario.explanation.length).toBeGreaterThan(20)
      expect([1, 2, 3]).toContain(scenario.tier)
      expect(scenario.alert.lines[scenario.keyLine]).toBeTruthy()
      expect(scenario.concepts.attack).toBeTruthy()
      expect(scenario.concepts.cia.length).toBeGreaterThan(0)
    }
    expect([1, 2, 3].map((tier) => SCENARIOS.filter((item) => item.tier === tier).length)).toEqual([
      5, 7, 4,
    ])
  })

  it('only uses documentation or private address space', () => {
    const text = SCENARIOS.flatMap((item) => [
      ...item.alert.lines,
      ...Object.entries(item.lookups).flat(2),
      ...item.entities,
    ]).join(' ')
    const ips = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []
    expect(ips.length).toBeGreaterThan(20)
    for (const ip of ips) expect(ip).toMatch(/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|10\.)/)
  })

  it('hides a run from every other player', () => {
    const { service } = setup()
    service.startRun({ mode: 'practice', context: { kind: 'personal' } }, 'player-a')
    expect(() => service.getRun(RUN_ID, 'player-a')).not.toThrow()
    for (const call of [
      () => service.getRun(RUN_ID, 'player-b'),
      () => service.hintRun(RUN_ID, { incidentId: 'incident-01' }, 'player-b'),
      () => service.pauseRun(RUN_ID, 'player-b'),
      () => service.resumeRun(RUN_ID, 'player-b'),
      () =>
        service.submitCommand(
          RUN_ID,
          { actionId: 'action-9999', incidentId: 'incident-01', command: 'x' },
          'player-b',
        ),
      () => service.completeRun(RUN_ID, { actionId: 'action-9998' }, 'player-b'),
    ])
      expectCliError(call, 'CLI_RUN_NOT_FOUND')
  })

  it('records a finished run once and keeps the score when saving fails', async () => {
    const { service } = setup()
    service.startRun({ mode: 'practice', context: { kind: 'personal' } }, 'player-a')
    const calls = []
    let failing = true
    const attempts = {
      async recordCompletedAttempt(actor, gameId, input) {
        calls.push({ actor, gameId, input })
        if (failing)
          throw Object.assign(new Error('gone'), { name: 'CohortError', code: 'COHORT_NOT_FOUND' })
        return {
          attemptId: 'a1',
          score: 0,
          maxScore: 2700,
          persisted: true,
          context: input.context,
        }
      },
    }
    const first = await service.completeAndRecord(
      RUN_ID,
      { actionId: nextAction() },
      'player-a',
      attempts,
    )
    expect(first).toMatchObject({ saved: false, saveError: { code: 'COHORT_NOT_FOUND' } })
    failing = false
    const second = await service.completeAndRecord(
      RUN_ID,
      { actionId: nextAction() },
      'player-a',
      attempts,
    )
    expect(second).toMatchObject({ saved: true, attempt: { attemptId: 'a1' } })
    await service.completeAndRecord(RUN_ID, { actionId: nextAction() }, 'player-a', attempts)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({
      actor: { id: 'player-a' },
      gameId: 'cli-cyber-defender',
      input: { mode: 'practice', resultKey: RUN_ID, state: { mode: 'practice' } },
    })
    expect(calls[1].input.state.incidents).toHaveLength(8)
    expect(calls[1].input.state.incidents[0]).toEqual({
      scenarioId: expect.any(String),
      outcome: 'skipped',
      hintUsed: false,
      trail: [],
    })
  })
})
