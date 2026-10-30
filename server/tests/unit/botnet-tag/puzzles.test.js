import { describe, expect, it } from 'vitest'
import { STATION_KINDS } from '../../../src/modules/games/botnet-tag/arena.js'
import {
  PUZZLES,
  checkPuzzle,
  generatePuzzle,
  submissionFor,
} from '../../../src/modules/games/botnet-tag/puzzles.js'
import { createRng } from '../../../src/modules/games/botnet-tag/rules.js'

const DENY_KEYS = ['answer', 'correct', 'solution', 'index', 'bad', 'expected', 'choices']

function keysDeep(value, out = []) {
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key)
      keysDeep(inner, out)
    }
  }
  return out
}

describe('patch-station puzzles', () => {
  it('covers every station kind', () => {
    expect(Object.keys(PUZZLES).sort()).toEqual([...STATION_KINDS].sort())
  })

  for (const kind of STATION_KINDS) {
    describe(kind, () => {
      it('generates, passes the right answer and fails wrong or malformed ones', () => {
        for (let seed = 1; seed <= 200; seed += 1) {
          const puzzle = generatePuzzle(kind, createRng(seed))
          expect(puzzle.kind).toBe(kind)
          expect(puzzle.timeLimitMs).toBeGreaterThanOrEqual(10000)
          expect(puzzle.timeLimitMs).toBeLessThanOrEqual(20000)
          expect(checkPuzzle(kind, puzzle.answer, submissionFor(kind, puzzle.answer))).toBe(true)
          for (const junk of [
            undefined,
            null,
            5,
            'x',
            [],
            {},
            { index: 99 },
            { index: '0' },
            { choices: 'a' },
            { choices: [] },
            { index: -1 },
          ]) {
            expect(checkPuzzle(kind, puzzle.answer, junk)).toBe(false)
          }
        }
      })

      it('rejects a wrong but well-formed submission', () => {
        const puzzle = generatePuzzle(kind, createRng(3))
        let wrong = { index: (puzzle.answer + 1) % 3 }
        if (Array.isArray(puzzle.answer)) {
          const swap =
            puzzle.answer[0] === 'allow'
              ? 'block'
              : puzzle.answer[0] === 'block'
                ? 'allow'
                : 'patch-x'
          const options = kind === 'patch' ? ['patch-a', 'patch-b', 'patch-c'] : ['allow', 'block']
          const other = options.find((option) => option !== puzzle.answer[0])
          wrong = { choices: [other, ...puzzle.answer.slice(1)] }
          expect(swap).toBeTypeOf('string')
        }
        expect(checkPuzzle(kind, puzzle.answer, wrong)).toBe(false)
      })

      it('keeps the answer out of the public payload', () => {
        for (let seed = 1; seed <= 200; seed += 1) {
          const puzzle = generatePuzzle(kind, createRng(seed))
          expect(keysDeep(puzzle.public).filter((key) => DENY_KEYS.includes(key))).toEqual([])
          const text = JSON.stringify(puzzle.public)
          if (Array.isArray(puzzle.answer))
            expect(text).not.toContain(JSON.stringify(puzzle.answer))
          expect(text).not.toContain('"bad"')
        }
      })

      it('is stable for a seed', () => {
        expect(generatePuzzle(kind, createRng(42))).toEqual(generatePuzzle(kind, createRng(42)))
      })
    })
  }

  it('never throws on unknown kinds or hostile input', () => {
    expect(generatePuzzle('nope', createRng(1))).toBeNull()
    expect(checkPuzzle('__proto__', 1, {})).toBe(false)
    expect(
      checkPuzzle('hash', 1, {
        get index() {
          throw new Error('x')
        },
      }),
    ).toBe(false)
  })

  it('builds content that teaches the concept', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const process = generatePuzzle('process', createRng(seed))
      const bad = process.public.processes[process.answer]
      expect(bad.cpu).toBeGreaterThanOrEqual(85)
      const hash = generatePuzzle('hash', createRng(seed))
      const { published, candidates } = hash.public
      expect(candidates.filter((c) => c.hash === published)).toHaveLength(1)
      for (const c of candidates.filter((c) => c.hash !== published)) {
        const diff = [...c.hash].filter((ch, i) => ch !== published[i]).length
        expect(diff).toBeGreaterThanOrEqual(1)
        expect(diff).toBeLessThanOrEqual(2)
      }
      const spoof = generatePuzzle('spoof', createRng(seed))
      const domains = spoof.public.senders.map((s) => s.split('@')[1])
      const real = domains.filter((_, i) => i !== spoof.answer)
      expect(real[0]).toBe(real[1])
      expect(domains[spoof.answer]).not.toBe(real[0])
      const account = generatePuzzle('account', createRng(seed))
      expect(account.public.passwords[account.answer].length).toBeGreaterThanOrEqual(14)
    }
  })
})
