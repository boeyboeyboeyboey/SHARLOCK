import { describe, expect, it } from 'vitest'
import { generateRound } from '../../../src/modules/games/phishing-post-mortem/triage/generator/index.js'
import { SCENARIOS } from '../../../src/modules/games/phishing-post-mortem/triage/generator/templates.js'
import {
  HINT_TYPES,
  hintLines,
  hintTypeFor,
} from '../../../src/modules/games/phishing-post-mortem/triage/hints.js'
import { createTriageRuleset } from '../../../src/modules/games/phishing-post-mortem/triage/ruleset.js'
import { parseAction } from '../../../src/modules/games/phishing-post-mortem/triage/policy.js'

const SEED = '0123456789abcdef0123456789abcdef'
const NOW = new Date('2026-11-01T10:00:00Z')
const ruleset = createTriageRuleset({ randomSeed: () => SEED })

function start(kind) {
  const context = kind === 'cohort' ? { kind, cohortId: 'c1' } : { kind: 'personal' }
  const created = ruleset.createState({ now: NOW, context })
  return {
    state: created.state,
    meta: { now: NOW, deadlineAt: created.deadlineAt, mode: created.mode, status: 'active' },
  }
}

function hint(state, meta, roundId) {
  const payload = ruleset.validateAction('triage-hint', { roundId })
  return ruleset.applyAction(state, { type: 'triage-hint', payload }, meta)
}

const roundId = (state) => generateRound({ seed: state.seed, roundIndex: 0 }).email.roundId

describe('hint text', () => {
  it('exists for every trick type at both tiers', () => {
    for (const type of HINT_TYPES) {
      expect(hintLines(type, 1)).toHaveLength(1)
      expect(hintLines(type, 2)).toHaveLength(2)
    }
    const used = new Set(SCENARIOS.flatMap((scenario) => scenario.phishTypes))
    for (const type of used) expect(HINT_TYPES).toContain(type)
  })

  it('every genuine email gets a hint type that has something to inspect', () => {
    let genuine = 0
    for (let roundIndex = 0; roundIndex < 400; roundIndex += 1) {
      const round = generateRound({ seed: SEED, roundIndex })
      const type = hintTypeFor(round, SEED, roundIndex)
      expect(HINT_TYPES).toContain(type)
      if (round.answer.verdict === 'phish') expect(type).toBe(round.answer.type)
      else {
        genuine += 1
        const kinds = round.email.parts.map((part) => part.kind)
        if (type === 'qr') expect(kinds).toContain('qr')
        if (type === 'attachment') expect(kinds).toContain('attachment')
        if (type === 'linkMismatch') expect(kinds).toContain('link')
        if (type === 'replyTo') expect(kinds).toContain('replyTo')
      }
    }
    expect(genuine).toBeGreaterThan(100)
  })

  it('never states a verdict', () => {
    for (const type of HINT_TYPES)
      for (const line of hintLines(type, 2)) expect(line).not.toMatch(/phish|genuine|safe|legit/i)
  })
})

describe('hint action', () => {
  it('moves from tier 1 to tier 2 and then refuses', () => {
    const { state, meta } = start('personal')
    const id = roundId(state)
    const one = hint(state, meta, id)
    expect(one.hint).toEqual({ roundId: id, tier: 1 })
    const two = hint(one, meta, id)
    expect(two.hint.tier).toBe(2)
    expect(() => hint(two, meta, id)).toThrow(/no more hints/)
  })

  it('records the tier on the round and resets for the next email', () => {
    const { state, meta } = start('personal')
    const id = roundId(state)
    const hinted = hint(state, meta, id)
    const played = ruleset.applyAction(
      hinted,
      { type: 'triage-call', payload: { roundId: id, call: 'trust' } },
      meta,
    )
    expect(played.rounds[0].hintTier).toBe(1)
    expect(played.hint).toBeNull()
  })

  it('is refused in a timed run and for a stale round', () => {
    const timed = start('cohort')
    expect(() => hint(timed.state, timed.meta, roundId(timed.state))).toThrow(/practice/)
    const practice = start('personal')
    expect(() => hint(practice.state, practice.meta, 'zzzzzz')).toThrow(/no longer/)
  })

  it('rejects extra fields and bad ids', () => {
    expect(() => parseAction('triage-hint', { roundId: 'abcdef', tier: 2 })).toThrow()
    expect(() => parseAction('triage-hint', { roundId: '!!' })).toThrow()
  })
})
