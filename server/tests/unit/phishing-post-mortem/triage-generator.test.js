import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  GENERATOR_VERSION,
  generateRound,
  tierForRound,
} from '../../../src/modules/games/phishing-post-mortem/triage/generator/index.js'
import { SCENARIOS } from '../../../src/modules/games/phishing-post-mortem/triage/generator/templates.js'

const hexSeed = (index) => createHash('sha256').update(`seed-${index}`).digest('hex').slice(0, 32)
const SEEDS = Array.from({ length: 500 }, (_, index) => hexSeed(index))
const ROUNDS = Array.from({ length: 60 }, (_, index) => index)
const BANNED = [
  'microsoft',
  'google',
  'gmail',
  'outlook',
  'paypal',
  'apple',
  'amazon',
  'dropbox',
  'docusign',
  'office365',
]

function everyRound(visit) {
  for (const seed of SEEDS) {
    for (const roundIndex of ROUNDS) {
      visit(generateRound({ seed, roundIndex }), seed, roundIndex)
    }
  }
}

function hostsOf(email) {
  const hosts = [email.senderAddress.split('@')[1]]
  if (email.replyTo) hosts.push(email.replyTo.split('@')[1])
  for (const part of email.parts) {
    if (part.kind === 'link') hosts.push(new URL(part.destination).hostname)
    if (part.kind === 'qr') hosts.push(new URL(part.decodedDestination).hostname)
  }
  return hosts
}

// the property checks walk 500 seeds x 60 rounds, which takes several seconds per test
describe('triage generator', { timeout: 30000 }, () => {
  it('exposes a version and a fixed tier ramp', () => {
    expect(GENERATOR_VERSION).toBe('triage-2')
    expect([0, 3].map(tierForRound)).toEqual([1, 1])
    expect([4, 8].map(tierForRound)).toEqual([2, 2])
    expect([9, 40].map(tierForRound)).toEqual([3, 3])
  })

  it('is deterministic per seed and round and differs between rounds', () => {
    expect(generateRound({ seed: SEEDS[0], roundIndex: 7 })).toEqual(
      generateRound({ seed: SEEDS[0], roundIndex: 7 }),
    )
    expect(generateRound({ seed: SEEDS[0], roundIndex: 7 })).not.toEqual(
      generateRound({ seed: SEEDS[0], roundIndex: 8 }),
    )
    expect(generateRound({ seed: SEEDS[0], roundIndex: 7 })).not.toEqual(
      generateRound({ seed: SEEDS[1], roundIndex: 7 }),
    )
  })

  it('stamps the tier from the round index', () => {
    everyRound((round, seed, roundIndex) => {
      if (SEEDS.indexOf(seed) % 50 === 0) expect(round.email.tier).toBe(tierForRound(roundIndex))
    })
  })

  it('keeps about 60 percent of emails legitimate at every tier', () => {
    const counts = { 1: [0, 0], 2: [0, 0], 3: [0, 0] }
    everyRound((round) => {
      counts[round.email.tier][1] += 1
      if (round.answer.verdict === 'legit') counts[round.email.tier][0] += 1
    })
    for (const [legit, total] of Object.values(counts)) {
      expect(legit / total).toBeGreaterThan(0.55)
      expect(legit / total).toBeLessThan(0.65)
    }
  })

  it('lets every scenario produce both verdicts and reach every phish type', () => {
    const verdicts = new Map(SCENARIOS.map((scenario) => [scenario.id, new Set()]))
    const pairs = new Set()
    everyRound(({ answer }) => {
      verdicts.get(answer.scenario).add(answer.verdict)
      pairs.add(`${answer.scenario}/${answer.type}`)
    })
    for (const scenario of SCENARIOS) {
      expect([...verdicts.get(scenario.id)].sort()).toEqual(['legit', 'phish'])
      for (const type of scenario.phishTypes) expect(pairs.has(`${scenario.id}/${type}`)).toBe(true)
    }
    expect(new Set(SCENARIOS.flatMap((scenario) => scenario.phishTypes)).size).toBe(7)
  })

  it('does not let a subject line or sender name separate legit from phish', () => {
    const tally = (map, key, verdict) => {
      if (!map.has(key)) map.set(key, { legit: 0, phish: 0 })
      map.get(key)[verdict] += 1
    }
    const subjects = new Map()
    const names = new Map()
    everyRound(({ email, answer }) => {
      tally(subjects, email.subject, answer.verdict)
      tally(names, email.senderName, answer.verdict)
    })
    for (const map of [subjects, names]) {
      for (const [key, count] of map) {
        if (count.legit + count.phish < 20) continue
        expect(count.legit, key).toBeGreaterThan(0)
        expect(count.phish, key).toBeGreaterThan(0)
      }
    }
  })

  it('gives phish tells and legit none, all pointing at real parts', () => {
    const types = new Set()
    everyRound(({ email, answer }) => {
      const ids = email.parts.map((part) => part.id)
      expect(new Set(ids).size).toBe(ids.length)
      types.add(answer.type)
      if (answer.verdict === 'phish') {
        expect(answer.type).not.toBe('legit')
        expect(SCENARIOS.map((scenario) => scenario.id)).toContain(answer.scenario)
        expect(answer.tellPartIds.length).toBeGreaterThan(0)
      } else {
        expect(answer.type).toBe('legit')
        expect(answer.tellPartIds).toEqual([])
      }
      for (const id of answer.tellPartIds) expect(ids).toContain(id)
      expect(answer.explanation.length).toBeGreaterThan(20)
    })
    expect([...types].sort()).toEqual(
      ['attachment', 'bec', 'legit', 'linkMismatch', 'lookalike', 'qr', 'replyTo', 'spoof'].sort(),
    )
  })

  it('always has a sender and a request plus one to three body parts', () => {
    everyRound(({ email }) => {
      const count = (kind) => email.parts.filter((part) => part.kind === kind).length
      expect(count('sender')).toBe(1)
      expect(count('request')).toBe(1)
      expect(count('body')).toBeGreaterThanOrEqual(1)
      expect(count('body')).toBeLessThanOrEqual(3)
    })
  })

  it('uses only synthetic hosts, safe destinations and no real brands', () => {
    everyRound(({ email }) => {
      for (const host of hostsOf(email)) expect(host.endsWith('.example')).toBe(true)
      for (const part of email.parts) {
        if (part.kind === 'link') {
          expect(part.destination).toMatch(/^https:\/\/[a-z0-9.-]+\.example(\/|$)/)
        }
        if (part.kind === 'qr') {
          expect(part.decodedDestination).toMatch(/^https:\/\/[a-z0-9.-]+\.example(\/|$)/)
        }
      }
      const text = JSON.stringify(email).toLowerCase()
      for (const word of BANNED) expect(text).not.toContain(word)
      expect(text).not.toContain('javascript:')
      expect(text).not.toContain('data:')
    })
  })

  it('keeps answers and the seed out of the public email', () => {
    everyRound(({ email }, seed, roundIndex) => {
      if (roundIndex % 10 !== 0) return
      const json = JSON.stringify(email)
      for (let start = 0; start + 8 <= seed.length; start += 1) {
        expect(json).not.toContain(seed.slice(start, start + 8))
      }
      for (const key of ['answer', 'verdict', 'tellPartIds', 'explanation', 'seed']) {
        expect(json).not.toContain(`"${key}"`)
      }
    })
  })

  it('keeps every host of a legitimate email on the sender domain', () => {
    everyRound(({ email, answer }) => {
      if (answer.verdict !== 'legit') return
      const domain = email.senderAddress.split('@')[1]
      for (const host of hostsOf(email)) {
        expect(host === domain || host.endsWith(`.${domain}`)).toBe(true)
      }
    })
  })

  it('keeps the safe-route sentence out of every phish and the neutral line in both verdicts', () => {
    const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]))
    const neutral = new Map(SCENARIOS.map((scenario) => [scenario.id, new Set()]))
    const withRoute = new Set()
    everyRound(({ email, answer }) => {
      const request = email.parts.find((part) => part.kind === 'request').text
      const has = request.includes(byId.get(answer.scenario).safeRoute)
      expect(has).toBe(answer.safeRoute)
      if (answer.verdict === 'phish') expect(has).toBe(false)
      if (has) withRoute.add(answer.scenario)
      else neutral.get(answer.scenario).add(answer.verdict)
    })
    expect(withRoute.size).toBe(SCENARIOS.length)
    for (const verdicts of neutral.values())
      expect([...verdicts].sort()).toEqual(['legit', 'phish'])
  })

  it('gives each round of a seed a distinct round id', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const ids = ROUNDS.map((roundIndex) => generateRound({ seed, roundIndex }).email.roundId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('does not let part kinds alone separate legit from phish', () => {
    const seen = { legit: new Set(), phish: new Set() }
    everyRound(({ email, answer }) => {
      for (const part of email.parts) seen[answer.verdict].add(part.kind)
    })
    for (const kind of ['link', 'attachment', 'qr', 'replyTo']) {
      expect(seen.legit.has(kind)).toBe(true)
      expect(seen.phish.has(kind)).toBe(true)
    }
  })

  it('varies content across a long run', () => {
    const subjects = new Set()
    for (const roundIndex of ROUNDS) {
      subjects.add(generateRound({ seed: SEEDS[2], roundIndex }).email.subject)
    }
    expect(subjects.size).toBeGreaterThan(15)
  })

  it('returns null for invalid input', () => {
    for (const bad of [
      undefined,
      {},
      { seed: 12345, roundIndex: 0 },
      { seed: 'abc', roundIndex: 0 },
      { seed: SEEDS[0].toUpperCase(), roundIndex: 0 },
      { seed: `${SEEDS[0]}0`, roundIndex: 0 },
      { seed: SEEDS[0], roundIndex: -1 },
      { seed: SEEDS[0], roundIndex: 0.5 },
      { seed: SEEDS[0], roundIndex: 'x' },
      { seed: SEEDS[0] },
    ]) {
      expect(generateRound(bad)).toBeNull()
    }
  })
})
