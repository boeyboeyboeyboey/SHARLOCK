import { describe, expect, it } from 'vitest'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { generateCase } from '../../../src/modules/games/sql-injection-arcade/generator/index.js'
import {
  PRACTICE_SLOTS,
  TIMED_SLOT_CAP,
  maxTimedActions,
  maxTimedScore,
} from '../../../src/modules/games/sql-injection-arcade/policy.js'
import {
  createSqlRuleset,
  sqlRuleset,
} from '../../../src/modules/games/sql-injection-arcade/ruleset.js'
import { SEED, junkAction, solutionFor } from './helpers.js'

const NOW = new Date('2026-10-29T10:00:00Z')
const ruleset = createSqlRuleset({ randomSeed: () => SEED })
const classContext = { kind: 'cohort', cohortId: 'c1' }
const personalContext = { kind: 'personal', cohortId: null }

function start(context = classContext) {
  const created = ruleset.createState({ now: NOW, context })
  const meta = {
    now: NOW,
    deadlineAt: created.deadlineAt,
    mode: created.mode,
    status: 'active',
    context,
  }
  return { state: created.state, meta, created }
}

const caseOf = (run) => {
  const last = run.state.cases.at(-1)
  const index =
    last && last.outcome === 'open' ? run.state.cases.length - 1 : run.state.cases.length
  return generateCase({ seed: run.state.seed, index })
}

function send(run, action) {
  const payload = ruleset.validateAction(action.type, action.payload)
  run.state = ruleset.applyAction(run.state, { type: action.type, payload }, run.meta)
}

const solveCase = (run) => solutionFor(caseOf(run)).forEach((action) => send(run, action))
const failCase = (run) => {
  for (let i = 0; i < 3; i += 1) send(run, junkAction(caseOf(run)))
}
// swaps in a case that cannot be failed by junk alone only if needed
function failCurrent(run) {
  const c = caseOf(run)
  if (c.private.kind === 'second-order') {
    for (let i = 0; i < 3; i += 1) {
      send(run, { type: 'register', payload: { caseId: c.public.caseId, inputs: [`x${i}`] } })
      send(run, { type: 'change-password', payload: { caseId: c.public.caseId } })
    }
  } else if (c.private.kind === 'blind')
    send(run, { type: 'attempt', payload: { caseId: c.public.caseId, inputs: [';'] } }) || null
  else if (c.private.kind === 'repair') {
    const wrong = c.public.options.find((o) => o.id !== c.private.repair.correctId)
    send(run, { type: 'choose-fix', payload: { caseId: c.public.caseId, optionId: wrong.id } })
  } else failCase(run)
}

describe('registration and createState', () => {
  it('registers sql-2 as current and sql-1 as legacy', () => {
    const registry = createProductionAttemptRegistry()
    expect(registry.getCurrent(sqlRuleset.id).rulesetVersion).toBe('sql-2')
    expect(registry.get(sqlRuleset.id, 'sql-1').current).toBe(false)
    expect(registry.get(sqlRuleset.id, 'sql-2').competitive).toBe(true)
    expect(registry.getCurrent(sqlRuleset.id).maxActions).toBe(maxTimedActions())
    expect(maxTimedActions()).toBeLessThanOrEqual(255)
  })
  it('class context is a 180 s standard run with 3 lives', () => {
    const { created } = start()
    expect(created.mode).toBe('standard')
    expect(created.deadlineAt.getTime() - NOW.getTime()).toBe(180000)
    expect(created.state.seed).toMatch(/^[0-9a-f]{32}$/)
    const view = ruleset.serializePublicState(created.state, {
      mode: 'standard',
      status: 'active',
      now: NOW,
      deadlineAt: created.deadlineAt,
    })
    expect(view).toMatchObject({ lives: 3, maxLives: 3, totalCases: null })
  })
  it('personal context is untimed practice of 12 cases plus repairs', () => {
    const { created } = start(personalContext)
    expect(created.mode).toBe('practice')
    expect(created.deadlineAt).toBeNull()
    expect(PRACTICE_SLOTS).toBe(15)
    expect(createSqlRuleset().createState({ now: NOW, context: classContext }).state.seed).not.toBe(
      createSqlRuleset().createState({ now: NOW, context: classContext }).state.seed,
    )
  })
})

describe('scoring and run end', () => {
  it('solving a full practice run scores tiers, first-try bonuses and repairs, then ends', () => {
    const run = start(personalContext)
    let expected = 0
    for (let slot = 0; slot < PRACTICE_SLOTS; slot += 1) {
      const c = caseOf(run)
      expected += c.private.kind === 'repair' ? 10 : c.private.tier * 10 + 10
      solveCase(run)
    }
    expect(ruleset.canComplete(run.state, run.meta)).toBe(true)
    expect(ruleset.summarize(run.state).score).toBe(expected)
    expect(ruleset.summarize(run.state).score).toBeLessThanOrEqual(maxTimedScore())
    expect(() => solveCase(run)).toThrow(/ended/)
    const topics = ruleset.summarize(run.state).topicOutcomes.map((t) => t.topic)
    expect(topics).toContain('parameterized-queries')
  })
  it('a slip removes the first-try bonus and a case closes after 3 tries', () => {
    const run = start(personalContext)
    const c = caseOf(run)
    send(run, junkAction(c))
    solutionFor(c).forEach((action) => send(run, action))
    expect(run.state.cases[0]).toMatchObject({
      outcome: 'solved',
      points: c.private.tier * 10,
      slips: 1,
    })
    const second = caseOf(run)
    for (let i = 0; i < 3; i += 1) send(run, junkAction(second))
    expect(run.state.cases[1]).toMatchObject({ outcome: 'failed', points: 0, tries: 3 })
    expect(ruleset.serializePublicState(run.state, { ...run.meta }).last.explanation).toBeTruthy()
  })
  it('timed runs lose a life per failed case and end at 0 lives', () => {
    const run = start()
    let slot = 0
    while (!ruleset.canComplete(run.state, run.meta) && slot < 20) {
      if (caseOf(run).private.kind === 'repair') solveCase(run)
      else failCurrent(run)
      slot += 1
      const open = run.state.cases.at(-1).outcome === 'open'
      if (open) while (run.state.cases.at(-1).outcome === 'open') failCurrent(run)
    }
    const view = ruleset.serializePublicState(run.state, run.meta)
    expect(view.failed).toBe(3)
    expect(view.lives).toBe(0)
    expect(view.current).toBeNull()
    expect(() => solveCase(run)).toThrow(/ended/)
  })
  it('a wrong repair scores 0 and costs no life', () => {
    const run = start()
    for (let slot = 0; slot < 4; slot += 1) solveCase(run)
    const c = caseOf(run)
    const wrong = c.public.options.find((o) => o.id !== c.private.repair.correctId)
    send(run, { type: 'choose-fix', payload: { caseId: c.public.caseId, optionId: wrong.id } })
    expect(run.state.cases.at(-1)).toMatchObject({ kind: 'repair', outcome: 'failed', points: 0 })
    expect(ruleset.serializePublicState(run.state, run.meta)).toMatchObject({ lives: 3, failed: 0 })
  })
  it('ends at the deadline and at the slot cap', () => {
    const run = start()
    run.meta = { ...run.meta, now: new Date(NOW.getTime() + 180000) }
    expect(ruleset.canComplete(run.state, run.meta)).toBe(true)
    expect(() => solveCase(run)).toThrow(/ended/)
    const capped = start()
    for (let slot = 0; slot < TIMED_SLOT_CAP; slot += 1) solveCase(capped)
    expect(ruleset.canComplete(capped.state, capped.meta)).toBe(true)
    expect(ruleset.summarize(capped.state).score).toBeLessThanOrEqual(maxTimedScore())
  })
})

describe('hints, stages and validation', () => {
  it('hints are practice only, mark the case assisted and drop the bonus', () => {
    const timed = start()
    expect(() =>
      send(timed, { type: 'hint', payload: { caseId: caseOf(timed).public.caseId } }),
    ).toThrow()
    const run = start(personalContext)
    const c = caseOf(run)
    expect(ruleset.serializePublicState(run.state, run.meta).current.hint).toBeNull()
    send(run, { type: 'hint', payload: { caseId: c.public.caseId } })
    expect(ruleset.serializePublicState(run.state, run.meta).current.hint).toBeTruthy()
    expect(() => send(run, { type: 'hint', payload: { caseId: c.public.caseId } })).toThrow()
    solutionFor(c).forEach((action) => send(run, action))
    expect(run.state.cases[0]).toMatchObject({ assisted: true, points: c.private.tier * 10 })
  })
  it('a blind case needs the true/false pair and a letter probe before the answer', () => {
    const run = start(personalContext)
    for (let guard = 0; guard < 15 && caseOf(run).private.kind !== 'blind'; guard += 1)
      solveCase(run)
    const c = caseOf(run)
    expect(c.private.kind).toBe('blind')
    const [yes, no, letter, answer] = solutionFor(c)
    expect(() => send(run, answer)).toThrow(/Prove/)
    send(run, yes)
    send(run, letter)
    expect(ruleset.serializePublicState(run.state, run.meta).current).toMatchObject({
      stage: 1,
      canAnswer: false,
    })
    send(run, no)
    send(run, letter)
    expect(ruleset.serializePublicState(run.state, run.meta).current).toMatchObject({
      stage: 2,
      canAnswer: true,
      triesLeft: 2,
    })
    send(run, answer)
    expect(run.state.cases.at(-1).outcome).toBe('solved')
    const wrongRun = start(personalContext)
    for (let guard = 0; guard < 15 && caseOf(wrongRun).private.kind !== 'blind'; guard += 1)
      solveCase(wrongRun)
    const w = solutionFor(caseOf(wrongRun))
    w.slice(0, 3).forEach((action) => send(wrongRun, action))
    send(wrongRun, {
      ...w[3],
      payload: { ...w[3].payload, value: w[3].payload.value === 'yes' ? 'no' : 'yes' },
    })
    expect(wrongRun.state.cases.at(-1).outcome).toBe('failed')
  })
  it('a blind case fails after 6 probes without proof, and a second-order case needs both steps', () => {
    const run = start(personalContext)
    for (let guard = 0; guard < 15 && caseOf(run).private.kind !== 'blind'; guard += 1)
      solveCase(run)
    const c = caseOf(run)
    for (let i = 0; i < 6; i += 1)
      send(run, { type: 'attempt', payload: { caseId: c.public.caseId, inputs: [';'] } })
    expect(run.state.cases.at(-1).outcome).toBe('failed')
    const next = start(personalContext)
    for (let guard = 0; guard < 15 && caseOf(next).private.kind !== 'second-order'; guard += 1)
      solveCase(next)
    const t = caseOf(next)
    const id = t.public.caseId
    expect(() => send(next, { type: 'change-password', payload: { caseId: id } })).toThrow()
    const taken = t.private.model.rows[0].user
    send(next, { type: 'register', payload: { caseId: id, inputs: [taken] } })
    expect(next.state.cases.at(-1)).toMatchObject({ tries: 1, stored: '' })
    send(next, { type: 'register', payload: { caseId: id, inputs: ['newcomer'] } })
    expect(() =>
      send(next, { type: 'register', payload: { caseId: id, inputs: ['again'] } }),
    ).toThrow()
    expect(ruleset.serializePublicState(next.state, next.meta).current).toMatchObject({
      phase: 'change',
      stored: 'newcomer',
    })
  })
  it('rejects stale cases, extra fields, bad types and oversized input', () => {
    const run = start(personalContext)
    const id = caseOf(run).public.caseId
    expect(() =>
      send(run, { type: 'attempt', payload: { caseId: 'zzzzzz', inputs: ['x', 'y'] } }),
    ).toThrow(/current/)
    for (const [type, payload] of [
      ['attempt', { caseId: id, inputs: ['x'], score: 100 }],
      ['attempt', { caseId: id, inputs: 'x' }],
      ['attempt', { caseId: id, inputs: ['x'.repeat(121)] }],
      ['attempt', { caseId: id, inputs: [1] }],
      ['attempt', { caseId: id, inputs: ['a', 'b', 'c'] }],
      ['register', { caseId: id, inputs: ['x'.repeat(41)] }],
      ['answer', { caseId: id, value: 'maybe' }],
      ['choose-fix', { caseId: id, optionId: 'z' }],
      ['hint', { caseId: id, extra: 1 }],
      ['test-payload', { username: '', password: '' }],
      ['hint', null],
    ])
      expect(() => ruleset.validateAction(type, payload), type).toThrow()
    expect(() => send(run, { type: 'change-password', payload: { caseId: id } })).toThrow()
  })
})

describe('public state keeps answers private', () => {
  it('never serializes seeds, models or the fix before a case closes', () => {
    const run = start(personalContext)
    for (let slot = 0; slot < 15; slot += 1) {
      const c = caseOf(run)
      const text = JSON.stringify({
        ...ruleset.serializePublicState(run.state, run.meta),
        last: null,
      })
      expect(text).not.toContain(SEED)
      expect(text).not.toContain(c.private.explanation)
      expect(text).not.toContain('correctId')
      if (c.private.kind === 'blind') expect(text).not.toContain(c.private.model.hiddenValue)
      if (c.private.kind === 'union')
        for (const row of c.private.model.target.rows)
          expect(text).not.toContain(row.passcode ?? row.keycode ?? row.secret ?? row.pin)
      solveCase(run)
    }
    const done = ruleset.serializePublicState(run.state, { ...run.meta, status: 'completed' })
    expect(done.review).toHaveLength(15)
    expect(done.current).toBeNull()
    expect(done.last.explanation).toBeTruthy()
  })
})
