import { describe, expect, it } from 'vitest'
import { STATION_KINDS } from '../../../src/modules/games/botnet-tag/arena.js'
import {
  PUZZLES,
  checkPuzzle,
  generatePuzzle,
  looksMalicious,
  patchCovers,
  scorePassword,
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
    for (let seed = 1; seed <= 500; seed += 1) {
      const process = generatePuzzle('process', createRng(seed))
      const rows = process.public.processes
      expect(rows).toHaveLength(5)
      expect(rows.filter(looksMalicious)).toHaveLength(1)
      expect(looksMalicious(rows[process.answer])).toBe(true)
      expect(new Set(rows.map((row) => row.name)).size).toBe(5)

      const hash = generatePuzzle('hash', createRng(seed))
      const { published, candidates } = hash.public
      expect(candidates.filter((c) => c.hash === published)).toHaveLength(1)
      for (const c of candidates.filter((c) => c.hash !== published)) {
        const a = c.hash.replaceAll(' ', '')
        const b = published.replaceAll(' ', '')
        expect(a).toHaveLength(64)
        const diff = [...a].filter((ch, i) => ch !== b[i]).length
        expect(diff).toBeGreaterThanOrEqual(1)
        expect(diff).toBeLessThanOrEqual(3)
      }
      expect(new Set(candidates.map((c) => c.hash)).size).toBe(3)

      const spoof = generatePuzzle('spoof', createRng(seed))
      const { real } = spoof.meta
      const domains = spoof.public.senders.map((s) => s.split('@')[1])
      expect(domains.length).toBeGreaterThanOrEqual(3)
      domains.forEach((domain, i) => {
        const legit = domain === real || domain.endsWith(`.${real}`)
        const evilSuffix = domain.startsWith(`${real}.`)
        expect(legit && !evilSuffix).toBe(i !== spoof.answer)
      })
      expect(new Set(spoof.public.senders).size).toBe(spoof.public.senders.length)

      const account = generatePuzzle('account', createRng(seed))
      const scores = account.public.passwords.map(scorePassword)
      const best = scores[account.answer]
      expect(account.public.passwords[account.answer].length).toBeGreaterThanOrEqual(14)
      expect(Math.max(...scores.filter((_, i) => i !== account.answer))).toBeLessThanOrEqual(
        best - 15,
      )
    }
  })

  it('keeps patch pairs unambiguous', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const puzzle = generatePuzzle('patch', createRng(seed))
      const { entries } = puzzle.meta
      expect(entries.length).toBeGreaterThanOrEqual(4)
      expect(entries.length).toBeLessThanOrEqual(5)
      puzzle.public.services.forEach((service, i) => {
        const install = { name: service.name, version: service.version.split('.').map(Number) }
        const covering = entries.filter((entry) => patchCovers(entry, install))
        expect(covering.map((entry) => entry.id)).toEqual([puzzle.answer[i]])
      })
      expect(new Set(puzzle.answer).size).toBe(3)
    }
  })

  it('applies the role truth table to firewall rows', () => {
    const roles = new Set()
    const ports = new Set()
    for (let seed = 1; seed <= 500; seed += 1) {
      const puzzle = generatePuzzle('firewall', createRng(seed))
      const { role, vpn } = puzzle.meta
      roles.add(`${role}${vpn ? '+vpn' : ''}`)
      expect(puzzle.public.services.length).toBeGreaterThanOrEqual(4)
      expect(puzzle.public.services.length).toBeLessThanOrEqual(5)
      expect(puzzle.answer).toContain('allow')
      expect(puzzle.answer).toContain('block')
      puzzle.public.services.forEach(({ port }, i) => {
        ports.add(port)
        const web = role === 'web' && [443, 80].includes(port)
        const mail = role === 'mail' && [25, 587, 993].includes(port)
        const db = role === 'database' && [5432, 3306].includes(port)
        const ssh = vpn && port === 22
        expect(puzzle.answer[i]).toBe(web || mail || db || ssh ? 'allow' : 'block')
      })
    }
    expect(roles.size).toBe(6)
    expect(ports.size).toBeGreaterThanOrEqual(14)
  })

  describe('variety over 500 seeds', () => {
    const distinct = (kind) => {
      const seen = new Set()
      const metas = []
      for (let seed = 1; seed <= 500; seed += 1) {
        const puzzle = generatePuzzle(kind, createRng(seed))
        seen.add(JSON.stringify(puzzle.public))
        metas.push(puzzle.meta)
      }
      return { count: seen.size, metas }
    }

    for (const kind of STATION_KINDS) {
      it(`${kind} yields at least 300 distinct payloads`, () => {
        expect(distinct(kind).count).toBeGreaterThanOrEqual(300)
      })
    }

    it('process uses every os and technique', () => {
      const { metas } = distinct('process')
      expect(new Set(metas.map((m) => m.os))).toEqual(new Set(['windows', 'linux', 'macos']))
      expect(new Set(metas.map((m) => m.technique)).size).toBe(3)
    })

    it('spoof uses every lookalike technique', () => {
      const { metas } = distinct('spoof')
      const used = new Set(metas.map((m) => m.technique))
      for (const technique of ['homoglyph', 'rn', 'hyphen', 'tld', 'subdomain', 'extra'])
        expect(used.has(technique)).toBe(true)
    })

    it('hash shows grouped and plain blocks', () => {
      const { metas } = distinct('hash')
      expect(new Set(metas.map((m) => m.grouped))).toEqual(new Set([0, 4, 8]))
    })

    it('account uses every password family', () => {
      const { metas } = distinct('account')
      expect(new Set(metas.map((m) => m.strong))).toEqual(new Set(['passphrase', 'long-random']))
      expect(new Set(metas.flatMap((m) => m.weak))).toEqual(
        new Set(['word-year', 'leet-word', 'keyboard-walk', 'short-random']),
      )
    })
  })

  it('scores patterns below clean long passwords', () => {
    expect(scorePassword('Summer2024!')).toBeLessThan(scorePassword('ember-quartz-willow-tundra'))
    expect(scorePassword('qwerty123')).toBeLessThan(scorePassword('k7#Rw!9mQz2&Lp4x'))
    expect(scorePassword('p@ssw0rd')).toBeLessThan(scorePassword('Tq8!vZ3#nB'))
  })
})
