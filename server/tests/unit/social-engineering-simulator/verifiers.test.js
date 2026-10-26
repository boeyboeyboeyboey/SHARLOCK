import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../../src/modules/games/social-engineering-simulator/scenarios.js'
import {
  nudgeFor,
  publicVerifier,
  verifierFor,
} from '../../../src/modules/games/social-engineering-simulator/verifiers.js'
import {
  MAX_NUDGES,
  RULESET_VERSION,
  VERIFIER_CONCURRENCY,
  VERIFIER_TURN_BUDGET,
} from '../../../src/modules/games/social-engineering-simulator/policy.js'

const EXPECTED = {
  'it-helpdesk': ['Marcus Tan', 'IT Service Centre'],
  'panicked-coworker': ['Dana Wu', 'Marketing Lead'],
  'exec-assistant': ['Chris Ho', 'Executive Office front desk'],
  'vendor-support': ['Lee Ann Goh', 'Vendor Management'],
  'found-laptop': ['Sasha Ong', 'Facilities Front Desk'],
  'audit-gift-card': ['Noor Hassan', 'Security Awareness Lead'],
  'fraud-callback': ['Mei Lin Tan', 'Finance Operations'],
  'lobby-visitor': ['Dev Patel', 'Reception Supervisor'],
  'new-starter': ['Grace Lim', 'HR Onboarding'],
  'hr-survey': ['Isaac Lee', 'HR Operations'],
  'own-ticket': ['Ben Ortiz', 'IT Service Centre'],
  'scheduled-migration': ['Hana Kim', 'IT Service Centre'],
}

describe('verifier constants', () => {
  it('exposes the agreed values', () => {
    expect(VERIFIER_TURN_BUDGET).toBe(5)
    expect(MAX_NUDGES).toBe(3)
    expect(VERIFIER_CONCURRENCY).toBe(1)
    expect(RULESET_VERSION).toBe('2026-10-27')
  })
})

const KEY_FACTS = {
  'it-helpdesk': ['INC-20418', 'Priya Nair', 'self-service portal', 'Jordan Vale'],
  'panicked-coworker': ['Brightwell', 'Sam Rivera', 'Marketing Lead', 'IT service desk'],
  'exec-assistant': ['Dana Okafor', 'Morgan Lee', 'board call'],
  'vendor-support': ['NW-55012', 'Alex Chen', 'vendor portal', 'Northwind'],
  'found-laptop': ['Riley Park', 'front desk', 'No laptop'],
  'audit-gift-card': ['Casey Moore', 'gift card', 'announced company-wide'],
  'fraud-callback': ['Jamie Reyes', 'CF-77120', 'No fraud case'],
  'lobby-visitor': ['Pat Nguyen', 'No visitor', 'visitor system'],
  'new-starter': ['Taylor Brooks', 'Nobody is starting', 'HR onboarding'],
  'hr-survey': ['Robin Shaw', 'No benefits survey', 'HR never asks'],
  'own-ticket': ['INC-30417 exists', 'Avery Lim', 'on shift'],
  'scheduled-migration': ['change calendar', 'Quinn Adams', 'announced earlier this week'],
}

describe('verifier facts', () => {
  for (const [id, facts] of Object.entries(KEY_FACTS)) {
    it(`pins the key facts for ${id}`, () => {
      const { systemPrompt } = verifierFor(id)
      for (const fact of facts) expect(systemPrompt).toContain(fact)
    })
  }
})

describe('verifiers', () => {
  it('covers every scenario', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(SCENARIOS.map((s) => s.id).sort())
  })

  for (const scenario of SCENARIOS) {
    describe(scenario.id, () => {
      it('has the expected identity', () => {
        const [displayName, role] = EXPECTED[scenario.id]
        const verifier = verifierFor(scenario.id)
        expect(verifier.displayName).toBe(displayName)
        expect(verifier.role).toBe(role)
      })

      it('has a prompt with the rules and without the reset code', () => {
        const { systemPrompt } = verifierFor(scenario.id)
        const lower = systemPrompt.toLowerCase()
        expect(systemPrompt.length).toBeGreaterThan(0)
        expect(systemPrompt).not.toContain(scenario.code)
        expect(systemPrompt).not.toContain('SYNTH-RESET-')
        expect(lower).toContain('answer only what is asked')
        expect(lower).toContain('never invent')
        expect(lower).toContain('never reveal')
        expect(lower).toContain('do not suggest who else to contact')
        expect(lower).not.toContain('calm service desk')
      })

      it('puts identity and facts before the rules and keeps examples code-free', () => {
        const { systemPrompt } = verifierFor(scenario.id)
        expect(systemPrompt.indexOf('YOU ARE')).toBe(0)
        expect(systemPrompt.indexOf('YOU ARE')).toBeLessThan(systemPrompt.indexOf('RULES'))
        expect(systemPrompt).toContain('EXAMPLE')
        for (const other of SCENARIOS) expect(systemPrompt).not.toContain(other.code)
        expect(systemPrompt).not.toMatch(/SYNTH-RESET/i)
      })

      it('has a public view without the prompt', () => {
        const [displayName, role] = EXPECTED[scenario.id]
        const view = publicVerifier(scenario.id)
        expect(Object.keys(view).sort()).toEqual(['displayName', 'role', 'turnBudget'])
        expect(view).toEqual({ displayName, role, turnBudget: 5 })
      })

      it('has three distinct nudges and no fourth', () => {
        const nudges = [0, 1, 2].map((i) => nudgeFor(scenario.id, i))
        for (const nudge of nudges) {
          expect(typeof nudge).toBe('string')
          expect(nudge.length).toBeGreaterThan(0)
        }
        expect(new Set(nudges).size).toBe(3)
        expect(nudgeFor(scenario.id, 3)).toBeUndefined()
      })
    })
  }
})
