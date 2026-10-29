import { describe, expect, it } from 'vitest'
import {
  GENERATOR_VERSION,
  generateCase,
} from '../../../src/modules/games/sql-injection-arcade/generator/index.js'
import { createRandom } from '../../../src/modules/games/sql-injection-arcade/generator/random.js'
import {
  KIND_TIER,
  TIMED_SLOT_CAP,
  caseNumber,
  isRepairSlot,
  maxTimedActions,
  maxTimedScore,
} from '../../../src/modules/games/sql-injection-arcade/policy.js'
import { SEED } from './helpers.js'

const seeds = Array.from({ length: 12 }, (_, i) => `${String(i).padStart(2, '0')}`.repeat(16))
const kindsOver = (seed, from, to) =>
  Array.from({ length: to - from }, (_, i) => from + i)
    .filter((index) => !isRepairSlot(index))
    .map((index) => generateCase({ seed, index }).private.kind)

describe('generator determinism and validation', () => {
  it('returns identical cases for the same seed and index, different ones otherwise', () => {
    expect(generateCase({ seed: SEED, index: 5 })).toEqual(generateCase({ seed: SEED, index: 5 }))
    expect(generateCase({ seed: SEED, index: 5 }).public.caseId).not.toBe(
      generateCase({ seed: seeds[1], index: 5 }).public.caseId,
    )
    expect(GENERATOR_VERSION).toMatch(/^sql-gen-/)
  })
  it('rejects a bad seed or index', () => {
    for (const input of [
      { seed: 'short', index: 0 },
      { seed: SEED, index: -1 },
      { seed: SEED, index: 1.5 },
      { seed: SEED, index: 5000 },
      {},
    ])
      expect(generateCase(input)).toBeNull()
    expect(generateCase()).toBeNull()
  })
  it('random stream is stable and bounded', () => {
    const a = createRandom(SEED, 1)
    const b = createRandom(SEED, 1)
    expect([a.next(), a.int(2, 4)]).toEqual([b.next(), b.int(2, 4)])
    for (let i = 0; i < 200; i += 1) expect(a.int(2, 4)).toBeGreaterThanOrEqual(2)
  })
})

describe('difficulty ramp and repair schedule', () => {
  it('puts a repair after every fourth case, aimed at the previous case', () => {
    for (const seed of seeds) {
      for (let index = 0; index < 15; index += 1) {
        const c = generateCase({ seed, index })
        expect(c.private.kind === 'repair').toBe(index % 5 === 4)
        if (c.private.kind === 'repair') {
          expect(c.public.forKind).toBe(generateCase({ seed, index: index - 1 }).private.kind)
          expect(c.public.options).toHaveLength(4)
          expect(c.public.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
        }
      }
    }
  })
  it('cases 1-3 are tier 1, then tier 1/2 mixes, then tier 2/3 mixes', () => {
    for (const seed of seeds) {
      expect(new Set(kindsOver(seed, 0, 3)).size).toBe(3)
      for (const kind of kindsOver(seed, 0, 3)) expect(KIND_TIER[kind]).toBe(1)
      for (const kind of kindsOver(seed, 3, 8)) expect(KIND_TIER[kind]).toBeLessThan(3)
      for (const kind of kindsOver(seed, 8, 40)) expect(KIND_TIER[kind]).toBeGreaterThan(1)
    }
    const late = seeds.flatMap((seed) => kindsOver(seed, 8, 40))
    expect(late).toContain('second-order')
    expect(late).toContain('blind')
    expect(late).toContain('union')
    expect(caseNumber(13)).toBe(11)
  })
})

describe('pools and answer model', () => {
  it('varies names, column counts, targets and hidden facts across seeds', () => {
    const unions = []
    const blinds = []
    const targets = new Set()
    for (const seed of seeds)
      for (let index = 0; index < 200; index += 1) {
        if (isRepairSlot(index)) continue
        const { private: p, public: pub } = generateCase({ seed, index })
        if (p.kind === 'union') unions.push(p.model)
        if (p.kind === 'blind') blinds.push({ ...p.model, answer: p.answer })
        if (p.kind === 'second-order') targets.add(p.model.rows[p.model.targetIndex].user)
        if (p.kind === 'login-comment') expect(p.model.targetIndex).toBeGreaterThan(0)
        expect(pub.query).toContain('‹')
      }
    expect(new Set(unions.map((m) => m.manifests.columns.length))).toEqual(new Set([2, 3, 4]))
    expect(new Set(unions.map((m) => m.target.table)).size).toBeGreaterThan(1)
    expect(new Set(unions.map((m) => m.manifests.table)).size).toBeGreaterThan(1)
    expect(new Set(blinds.map((m) => m.hiddenValue[0])).size).toBeGreaterThan(3)
    expect(new Set(blinds.map((m) => m.answer))).toEqual(new Set(['yes', 'no']))
    expect(targets.size).toBeGreaterThan(1)
    for (const m of unions) expect(m.decoy.table).not.toBe(m.target.table)
  })
  it('keeps every answer in private and out of the public case', () => {
    for (let index = 0; index < 15; index += 1) {
      const { public: pub, private: priv } = generateCase({ seed: SEED, index })
      const text = JSON.stringify(pub)
      expect(Object.keys(pub)).not.toContain('model')
      if (priv.kind === 'blind') {
        expect(text).not.toContain(priv.model.hiddenValue)
        expect(pub.knownCrate).toBe(priv.model.known)
      }
      if (priv.kind === 'union')
        for (const row of priv.model.target.rows) expect(text).not.toContain(row.passcode ?? '~')
      if (priv.kind === 'repair') {
        expect(text).not.toContain('correctId')
        expect(new Set(pub.options.map((option) => option.text)).size).toBe(4)
      }
    }
  })
  it('repair positions vary and exactly one option is the bind fix', () => {
    const positions = new Set()
    for (const seed of seeds) {
      const { private: p } = generateCase({ seed, index: 4 })
      positions.add(p.repair.correctId)
      expect(Object.keys(p.repair.why)).toHaveLength(4)
    }
    expect(positions.size).toBeGreaterThan(1)
  })
})

describe('run bounds', () => {
  it('keeps the timed action cap within the shared registry limit', () => {
    expect(TIMED_SLOT_CAP).toBeLessThanOrEqual(40)
    expect(maxTimedActions()).toBeLessThanOrEqual(255)
    expect(maxTimedScore()).toBeGreaterThan(0)
  })
})
