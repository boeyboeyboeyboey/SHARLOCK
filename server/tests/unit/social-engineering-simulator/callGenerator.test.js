import { describe, expect, it } from 'vitest'
import {
  CALLS_PER_SHIFT,
  PRETEXT_IDS,
  TACTICS,
  createRng,
  generateCall,
  planShift,
  publicCallView,
  runDeskTool,
} from '../../../src/modules/games/social-engineering-simulator/callGenerator.js'

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 13)

describe('call generator', () => {
  it('is deterministic for a seed and index', () => {
    expect(generateCall({ seed: 42, index: 2 })).toEqual(generateCall({ seed: 42, index: 2 }))
    expect(generateCall({ seed: 42 })).not.toEqual(generateCall({ seed: 43 }))
  })

  it('varies pretexts, tactics, callers and codes over 500 seeds', () => {
    const calls = SEEDS.map((seed) => generateCall({ seed }))
    expect(new Set(calls.map((call) => call.pretext.id)).size).toBe(PRETEXT_IDS.length)
    expect(new Set(calls.map((call) => call.tactic)).size).toBe(TACTICS.length)
    expect(new Set(calls.map((call) => call.caller.name)).size).toBeGreaterThan(100)
    expect(new Set(calls.map((call) => call.secret.code)).size).toBe(calls.length)
    expect(calls.every((call) => /^SYNTH-[A-Z]+-\d{4}-\d{4}$/.test(call.secret.code))).toBe(true)
    const share = calls.filter((call) => call.genuine).length / calls.length
    expect(share).toBeGreaterThan(0.33)
    expect(share).toBeLessThan(0.47)
  })

  it('makes every fact of a genuine caller check out', () => {
    for (const seed of SEEDS) {
      const call = generateCall({ seed, index: seed % 4, genuine: true })
      const { directory, ticket, callback } = call.facts
      expect(call.contradictions).toEqual([])
      expect(directory.found).toBe(true)
      expect(directory.name).toBe(call.caller.name)
      expect(directory.company ?? directory.department).toBe(call.caller.department)
      expect(directory.status).not.toMatch(/leave/)
      expect(ticket).toMatchObject({ found: true, requester: call.caller.name, status: 'open' })
      expect(ticket.ref).toBe(call.claimed.ticketRef)
      if (call.callbackViable) {
        expect(callback.matches).toBe(true)
        expect(callback.outcome).toBe('confirms')
      }
    }
  })

  it('gives every attacker a contradiction that the matching tool exposes', () => {
    for (const seed of SEEDS) {
      const index = seed % 4
      const call = generateCall({ seed, index, genuine: false })
      expect(call.contradictions.length).toBeGreaterThanOrEqual(1)
      expect(call.contradictions.length).toBeLessThanOrEqual(2)
      for (const { tool } of call.contradictions) {
        const result = runDeskTool(call, tool)
        if (tool === 'callback') expect(result.outcome).toBe('denies')
        if (tool === 'directory') {
          const clean = !result.found
          const moved = result.found && result.entry.department !== call.caller.department
          const away = result.found && /leave/.test(result.entry.status)
          expect(clean || moved || away).toBe(true)
        }
        if (tool === 'ticket') {
          const bad =
            !result.found ||
            result.entry.requester !== call.caller.name ||
            result.entry.status === 'closed'
          expect(bad).toBe(true)
        }
      }
    }
  })

  it('ramps: early attackers carry two obvious tells, the last carries one subtle tell', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const first = generateCall({ seed, index: 0, genuine: false })
      const last = generateCall({ seed, index: 3, genuine: false })
      expect(first.contradictions.every((item) => item.severity === 'obvious')).toBe(true)
      expect(last.contradictions).toHaveLength(1)
      expect(last.contradictions[0].severity).toBe('subtle')
    }
  })

  it('only offers a call back that can contradict when a number is on file', () => {
    const calls = SEEDS.map((seed) => generateCall({ seed, genuine: false }))
    for (const call of calls.filter((item) => !item.callbackViable)) {
      expect(call.contradictions.some((item) => item.tool === 'callback')).toBe(false)
      expect(runDeskTool(call, 'callback')).toMatchObject({ viable: false })
    }
    expect(calls.some((call) => !call.callbackViable)).toBe(true)
  })

  it('plans a shift with a mix of genuine and attacker calls', () => {
    let genuine = 0
    for (const seed of SEEDS) {
      const plan = planShift(createRng(seed))
      expect(plan).toHaveLength(CALLS_PER_SHIFT)
      expect(new Set(plan).size).toBe(2)
      genuine += plan.filter(Boolean).length
    }
    const share = genuine / (SEEDS.length * CALLS_PER_SHIFT)
    expect(share).toBeGreaterThan(0.3)
    expect(share).toBeLessThan(0.55)
  })

  it('never reveals legitimacy or facts in the public view', () => {
    const view = JSON.stringify(publicCallView(generateCall({ seed: 9, genuine: false })))
    expect(view).not.toMatch(/genuine|contradiction|facts|callback|directory/)
  })
})
