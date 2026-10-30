import { describe, expect, it } from 'vitest'
import {
  CALLS_PER_SHIFT,
  createRng,
  generateCall,
} from '../../../src/modules/games/social-engineering-simulator/callGenerator.js'
import {
  callerPrompt,
  colleaguePrompt,
} from '../../../src/modules/games/social-engineering-simulator/callPrompts.js'
import {
  classifyIntent,
  colleagueLine,
  debriefFor,
  fill,
  hintsFor,
  nudgeLine,
  openingLine,
  replyFor,
} from '../../../src/modules/games/social-engineering-simulator/scriptedLines.js'

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 5)
const INTENTS = ['proof', 'callback', 'ticket', 'pushback', 'generic']

describe('scripted lines', () => {
  it('fills every template for every seeded call without undefined', () => {
    for (const seed of SEEDS) {
      const call = generateCall({ seed, index: seed % CALLS_PER_SHIFT })
      const lines = [
        openingLine(call, createRng(seed).next),
        ...INTENTS.flatMap((intent) => [replyFor(call, intent, 0), replyFor(call, intent, 2)]),
        ...[0, 1, 2, 3].map((count) => nudgeLine(call, count)),
        ...hintsFor(call),
        ...['who is this', 'ticket?', 'phone', 'anything'].map((q) => colleagueLine(call, q)),
        ...debriefFor(call).tells.map((tell) => tell.text),
        debriefFor(call).headline,
        callerPrompt(call),
        colleaguePrompt(call),
      ]
      for (const line of lines) {
        expect(typeof line).toBe('string')
        expect(line).not.toMatch(/undefined|null|\{|\}|NaN/)
      }
    }
  })

  it('throws on a missing template value instead of printing undefined', () => {
    expect(() => fill('hello {nobody}', {})).toThrow(/missing/)
  })

  it('classifies free text into intents', () => {
    expect(classifyIntent('I will call you back')).toBe('callback')
    expect(classifyIntent('what is the ticket number?')).toBe('ticket')
    expect(classifyIntent('can you prove who you are')).toBe('proof')
    expect(classifyIntent('no, I cannot do that')).toBe('pushback')
    expect(classifyIntent('hmm')).toBe('generic')
  })

  it('has cooperative genuine callers and deflecting attackers', () => {
    const genuine = generateCall({ seed: 3, genuine: true })
    const attacker = generateCall({ seed: 3, genuine: false })
    expect(replyFor(genuine, 'callback')).toMatch(/ring me back/)
    expect(replyFor(attacker, 'callback')).toMatch(/will not work/)
  })

  it('gives hints from the seed and a tells debrief that names every contradiction', () => {
    const attacker = generateCall({ seed: 11, index: 0, genuine: false })
    expect(hintsFor(attacker)).toHaveLength(3)
    const debrief = debriefFor(attacker, { scriptedReplies: 1 })
    expect(debrief.genuine).toBe(false)
    expect(debrief.tells).toHaveLength(1 + attacker.contradictions.length)
    expect(debrief.scriptedNote).toMatch(/scripted/)
    expect(debriefFor(attacker).scriptedNote).toBeNull()
  })

  it('never puts the secret code in a model prompt', () => {
    for (const seed of SEEDS) {
      const call = generateCall({ seed })
      const digits = call.secret.code.split('-').slice(-2)
      for (const prompt of [callerPrompt(call), colleaguePrompt(call)]) {
        expect(prompt).not.toContain(call.secret.code)
        for (const group of digits) expect(prompt).not.toContain(group)
      }
    }
  })

  it('gives the model colleague the same facts as the desk tools', () => {
    const call = generateCall({ seed: 21, index: 0, genuine: false })
    const prompt = colleaguePrompt(call)
    expect(prompt).toContain(call.claimed.ticketRef)
  })
})
