import { describe, expect, it } from 'vitest'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { generateRound } from '../../../src/modules/games/phishing-post-mortem/triage/generator/index.js'
import { createTriageRuleset } from '../../../src/modules/games/phishing-post-mortem/triage/ruleset.js'
import {
  TIER_POINTS,
  maxTimedScore,
  multiplier,
  parseAction,
} from '../../../src/modules/games/phishing-post-mortem/triage/policy.js'

const SEED = '0123456789abcdef0123456789abcdef'
const NOW = new Date('2026-10-28T10:00:00Z')
const ruleset = createTriageRuleset({ randomSeed: () => SEED })
const classContext = { kind: 'cohort', cohortId: 'c1' }

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

const roundAt = (state) => generateRound({ seed: state.seed, roundIndex: state.rounds.length })

function play(state, meta, call, partId) {
  const { email } = roundAt(state)
  const payload =
    call === 'report' ? { roundId: email.roundId, call, partId } : { roundId: email.roundId, call }
  return ruleset.applyAction(
    state,
    { type: 'triage-call', payload: ruleset.validateAction('triage-call', payload) },
    meta,
  )
}

// finds the call that is right (or wrong) for the current round
function callFor(state, wantCorrect, wantTell = true) {
  const { email, answer } = roundAt(state)
  const phish = answer.verdict === 'phish'
  const report = phish === wantCorrect
  if (!report) return ['trust']
  const wrongPart =
    email.parts.find((part) => !answer.tellPartIds.includes(part.id)) ?? email.parts[0]
  return ['report', wantTell && phish ? answer.tellPartIds[0] : wrongPart.id]
}

function step(run, wantCorrect, wantTell = true) {
  run.state = play(run.state, run.meta, ...callFor(run.state, wantCorrect, wantTell))
  return run.state.rounds.at(-1)
}

describe('triage createState', () => {
  it('class context is a 180 s standard run', () => {
    const { created } = start()
    expect(created.mode).toBe('standard')
    expect(created.deadlineAt.getTime() - NOW.getTime()).toBe(180000)
    expect(created.state.seed).toMatch(/^[0-9a-f]{32}$/)
  })

  it('personal context is untimed practice', () => {
    const { created } = start({ kind: 'personal', cohortId: null })
    expect(created.mode).toBe('practice')
    expect(created.deadlineAt).toBeNull()
  })

  it('uses a random 32 char seed by default', () => {
    const a = createTriageRuleset().createState({ now: NOW, context: classContext }).state.seed
    const b = createTriageRuleset().createState({ now: NOW, context: classContext }).state.seed
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })

  it('never leaks the seed in public state at any phase', () => {
    const run = start()
    const seen = []
    const check = (meta) => {
      const json = JSON.stringify(ruleset.serializePublicState(run.state, meta))
      seen.push(json)
      for (let i = 0; i + 8 <= SEED.length; i += 1) expect(json).not.toContain(SEED.slice(i, i + 8))
      expect(json).not.toContain('triage-1')
    }
    check(run.meta)
    for (let i = 0; i < 3; i += 1) {
      step(run, true)
      check(run.meta)
    }
    check({ ...run.meta, status: 'completed' })
    expect(seen.length).toBe(5)
  })
})

describe('triage scoring', () => {
  it('multiplier steps at streak 3 and 6', () => {
    expect([0, 2, 3, 5, 6, 20].map(multiplier)).toEqual([1, 1, 2, 2, 3, 3])
  })

  it('awards tier points plus the tell bonus with the streak multiplier', () => {
    const run = start({ kind: 'personal', cohortId: null })
    const expected = []
    for (let index = 0; index < 8; index += 1) {
      const { email, answer } = roundAt(run.state)
      const round = step(run, true, true)
      const tell = answer.verdict === 'phish' ? 10 : 0
      expected.push((TIER_POINTS[email.tier] + tell) * multiplier(index))
      expect(round.points).toBe(expected.at(-1))
      expect(round.tellHit).toBe(answer.verdict === 'phish')
    }
  })

  it('a wrong part on a phish is correct without the bonus and keeps the streak', () => {
    const run = start()
    let guard = 0
    while (roundAt(run.state).answer.verdict !== 'phish' && guard++ < 20) step(run, true)
    const before = run.state.rounds.length
    const { email } = roundAt(run.state)
    const round = step(run, true, false)
    expect(run.state.rounds.length).toBe(before + 1)
    expect(round.correct).toBe(true)
    expect(round.tellHit).toBe(false)
    expect(round.points).toBe(TIER_POINTS[email.tier] * multiplier(before))
  })

  it('trusting a phish and reporting a legit email are mistakes that reset the streak', () => {
    const run = start({ kind: 'personal', cohortId: null })
    step(run, true)
    step(run, true)
    const wrong = step(run, false)
    expect(wrong.correct).toBe(false)
    expect(wrong.points).toBe(0)
    const view = ruleset.serializePublicState(run.state, run.meta)
    expect(view.streak).toBe(0)
    expect(view.mistakes).toBe(1)
    const both = new Set()
    const probe = start({ kind: 'personal', cohortId: null })
    for (let i = 0; i < 12; i += 1) {
      both.add(roundAt(probe.state).answer.verdict)
      expect(step(probe, false).correct).toBe(false)
    }
    expect(both).toEqual(new Set(['phish', 'legit']))
  })
})

describe('triage run end', () => {
  it('ends a standard run on the third mistake', () => {
    const run = start()
    step(run, false)
    step(run, false)
    expect(ruleset.canComplete(run.state, run.meta)).toBe(false)
    step(run, false)
    expect(ruleset.canComplete(run.state, run.meta)).toBe(true)
    expect(() => play(run.state, run.meta, 'trust')).toThrow(
      expect.objectContaining({ status: 409 }),
    )
  })

  it('ends a standard run at time-up', () => {
    const run = start()
    const late = { ...run.meta, now: new Date(NOW.getTime() + 180000) }
    expect(ruleset.canComplete(run.state, run.meta)).toBe(false)
    expect(ruleset.canComplete(run.state, late)).toBe(true)
    expect(() => play(run.state, late, 'trust')).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('ends practice after 12 rounds and has no mistake limit', () => {
    const run = start({ kind: 'personal', cohortId: null })
    for (let i = 0; i < 12; i += 1) {
      expect(ruleset.canComplete(run.state, run.meta)).toBe(false)
      step(run, false)
    }
    expect(ruleset.canComplete(run.state, run.meta)).toBe(true)
    expect(ruleset.serializePublicState(run.state, run.meta).current).toBeNull()
    expect(() => play(run.state, run.meta, 'trust')).toThrow(
      expect.objectContaining({ status: 409 }),
    )
  })

  it('rejects a stale round id', () => {
    const run = start()
    const stale = { type: 'triage-call', payload: { roundId: 'zzzzzz', call: 'trust' } }
    expect(() => ruleset.applyAction(run.state, stale, run.meta)).toThrow(
      expect.objectContaining({ status: 409 }),
    )
  })

  it('rejects an unknown part on report', () => {
    const run = start()
    const { email } = roundAt(run.state)
    const action = {
      type: 'triage-call',
      payload: { roundId: email.roundId, call: 'report', partId: 'pzzzz' },
    }
    expect(() => ruleset.applyAction(run.state, action, run.meta)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })
})

describe('triage action parsing', () => {
  it('rejects malformed payloads', () => {
    const bad = [
      { roundId: 'abc123', call: 'report' },
      { roundId: 'abc123', call: 'trust', partId: 'p0001' },
      { roundId: 'abc123', call: 'report', partId: 'p0001', extra: 1 },
      { roundId: 'abc123', call: 'maybe' },
      { roundId: 'bad id', call: 'trust' },
      JSON.parse('{"roundId":"abc123","call":"trust","__proto__":{"x":1}}'),
      null,
      [],
    ]
    for (const payload of bad) expect(() => parseAction('triage-call', payload)).toThrow()
    expect(() => parseAction('other', { roundId: 'abc123', call: 'trust' })).toThrow()
    expect(
      parseAction('triage-call', { roundId: 'abc123', call: 'report', partId: 'p0a1b' }),
    ).toEqual({
      roundId: 'abc123',
      call: 'report',
      partId: 'p0a1b',
    })
  })

  it('surfaces parse errors as attempt errors', () => {
    expect(() => ruleset.validateAction('triage-call', { call: 'trust' })).toThrow(
      expect.objectContaining({ code: 'PHISH_INVALID_REQUEST' }),
    )
  })
})

describe('triage public state', () => {
  it('shows the current email without answer fields', () => {
    const run = start()
    const view = ruleset.serializePublicState(run.state, run.meta)
    expect(view.current.roundId).toBe(roundAt(run.state).email.roundId)
    const json = JSON.stringify(view.current)
    for (const field of ['verdict', 'tellPartIds', 'explanation', 'answer', 'type"'])
      expect(json).not.toContain(field)
    expect(view.last).toBeNull()
    expect(view.review).toBeUndefined()
    expect(view).toMatchObject({ mode: 'standard', maxMistakes: 3, totalRounds: null })
  })

  it('reveals only the previous round in last and the review only when completed', () => {
    const run = start()
    step(run, true)
    step(run, true)
    const view = ruleset.serializePublicState(run.state, run.meta)
    expect(view.last.roundId).toBe(run.state.rounds[1].roundId)
    expect(view.last.explanation).toBe(
      generateRound({ seed: SEED, roundIndex: 1 }).answer.explanation,
    )
    expect(view.current.roundId).toBe(roundAt(run.state).email.roundId)
    expect(view.review).toBeUndefined()
    const done = ruleset.serializePublicState(run.state, { ...run.meta, status: 'completed' })
    expect(done.current).toBeNull()
    expect(done.review).toHaveLength(2)
    expect(Object.keys(done.review[0]).sort()).toEqual(
      [
        'call',
        'correct',
        'explanation',
        'points',
        'senderAddress',
        'subject',
        'tellHit',
        'tier',
        'type',
        'verdict',
      ].sort(),
    )
  })

  it('practice reports its round total', () => {
    const run = start({ kind: 'personal', cohortId: null })
    const view = ruleset.serializePublicState(run.state, run.meta)
    expect(view).toMatchObject({ mode: 'practice', totalRounds: 12, maxMistakes: null })
  })
})

describe('triage summary and registry', () => {
  it('maxScore bounds a perfect 60 round run', () => {
    const run = start()
    for (let i = 0; i < 60; i += 1) step(run, true)
    expect(run.state.rounds).toHaveLength(60)
    const summary = ruleset.summarize(run.state, run.meta)
    expect(summary.score).toBeLessThanOrEqual(maxTimedScore())
    expect(ruleset.maxScore).toBe(maxTimedScore())
    expect(ruleset.canComplete(run.state, run.meta)).toBe(true)
  })

  it('summarizes topics by phish type', () => {
    const run = start()
    for (let i = 0; i < 6; i += 1) step(run, true)
    const summary = ruleset.summarize(run.state, run.meta)
    expect(summary.score).toBe(run.state.rounds.reduce((sum, round) => sum + round.points, 0))
    expect(summary.topicOutcomes.length).toBeGreaterThan(0)
    expect(summary.topicOutcomes.every((outcome) => outcome.achieved)).toBe(true)
    expect(JSON.stringify(summary)).not.toContain(SEED)
  })

  it('registers phish-3 as current and keeps phish-2', () => {
    const registry = createProductionAttemptRegistry()
    const current = registry.getCurrent('phishing-post-mortem')
    expect(current.rulesetVersion).toBe('phish-3')
    expect(current.competitive).toBe(true)
    expect(registry.get('phishing-post-mortem', 'phish-2').current).toBe(false)
  })
})
