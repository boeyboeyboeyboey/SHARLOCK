import { describe, expect, it } from 'vitest'
import {
  SHIFT_MAX_SCORE,
  scoreCall,
  scoreShift,
} from '../../../src/modules/games/social-engineering-simulator/shiftScoring.js'

const base = {
  genuine: false,
  callbackViable: true,
  decision: 'refuse',
  leaked: false,
  verified: true,
  messagesUsed: 2,
  hints: 0,
}
const call = (overrides) => ({ ...base, ...overrides })

describe('shift scoring', () => {
  it('has a documented maximum', () => {
    expect(SHIFT_MAX_SCORE).toBe(430)
  })

  it('scores a verified refusal of an attacker at 100', () => {
    expect(scoreCall(call({}))).toMatchObject({ score: 100, correct: true, strike: false })
  })

  it('decision table for attackers', () => {
    expect(scoreCall(call({ decision: 'escalate' })).score).toBe(100)
    expect(scoreCall(call({ decision: 'callback' })).score).toBe(100)
    expect(scoreCall(call({ decision: 'callback', callbackViable: false })).score).toBe(70)
    const granted = scoreCall(call({ decision: 'grant' }))
    expect(granted).toMatchObject({ score: 0, correct: false, strike: true })
  })

  it('decision table for genuine callers', () => {
    const genuine = call({ genuine: true })
    expect(scoreCall({ ...genuine, decision: 'grant' })).toMatchObject({
      score: 100,
      strike: false,
    })
    expect(scoreCall({ ...genuine, decision: 'grant', verified: false }).score).toBe(45)
    expect(scoreCall({ ...genuine, decision: 'callback', verified: false }).score).toBe(100)
    expect(scoreCall({ ...genuine, decision: 'escalate' }).score).toBe(70)
    const refused = scoreCall({ ...genuine, decision: 'refuse' })
    expect(refused).toMatchObject({ score: 0, strike: false, correct: false })
  })

  it('gives no points and a strike for a leak', () => {
    const leaked = scoreCall(call({ decision: 'none', leaked: true }))
    expect(leaked).toMatchObject({ score: 0, strike: true, correct: false })
  })

  it('costs 10 per hint and wastes efficiency on long calls', () => {
    expect(scoreCall(call({ hints: 2 })).score).toBe(80)
    expect(scoreCall(call({ hints: 3, decision: 'grant', genuine: true })).score).toBe(70)
    expect(scoreCall(call({ messagesUsed: 6 })).score).toBe(93)
    expect(scoreCall(call({ messagesUsed: 12 })).score).toBe(85)
  })

  it('adds a streak bonus for each consecutive correct call after the first', () => {
    const scored = scoreShift([call({}), call({}), call({}), call({})])
    expect(scored.bonus).toBe(30)
    expect(scored.score).toBe(SHIFT_MAX_SCORE)
    expect(scored.outcome).toBe('resisted')
    const broken = scoreShift([call({}), call({ decision: 'grant' }), call({}), call({})])
    expect(broken.bonus).toBe(10)
    expect(broken.strikes).toBe(1)
    expect(broken.outcome).toBe('partial')
  })

  it('marks a shift with three strikes as compromised', () => {
    const leak = call({ decision: 'none', leaked: true })
    expect(scoreShift([leak, leak, leak]).outcome).toBe('compromised')
  })
})
