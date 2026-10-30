import { describe, expect, it } from 'vitest'
import { cueView, deriveCues, eventKey, freshEvents } from '../audio/soundCues.js'

const view = (over = {}) =>
  cueView({
    phase: 'playing',
    msLeft: 60000,
    immunityMs: 0,
    lockMs: 0,
    selfInfected: false,
    ...over,
  })

describe('deriveCues', () => {
  it('plays nothing without a previous view', () => {
    expect(deriveCues(null, view())).toEqual([])
  })

  it('sounds the horn when play begins', () => {
    expect(deriveCues(view({ phase: 'countdown' }), view())).toEqual(['horn'])
  })

  it('ticks in the last 10 seconds and faster in the last 3', () => {
    expect(deriveCues(view({ msLeft: 11000 }), view({ msLeft: 10000 }))).toEqual(['tick'])
    expect(deriveCues(view({ msLeft: 4000 }), view({ msLeft: 3000 }))).toEqual(['tickFast'])
    expect(deriveCues(view({ msLeft: 3000 }), view({ msLeft: 3000 }))).toEqual([])
    expect(deriveCues(view({ msLeft: 20000 }), view({ msLeft: 19000 }))).toEqual([])
    expect(deriveCues(view({ msLeft: 1000 }), view({ msLeft: 0 }))).toEqual([])
  })

  it('tells being tagged from tagging', () => {
    const tag = { type: 'tag', at: 1, from: 'a', to: 'me' }
    expect(deriveCues(view(), view(), [tag], 'me')).toEqual(['infected'])
    expect(deriveCues(view(), view(), [tag], 'a')).toEqual(['tagHit'])
    expect(deriveCues(view(), view(), [tag], 'c')).toEqual([])
  })

  it('confirms only my own patch and a new lockout', () => {
    const patch = { type: 'patch', at: 2, sid: 'me', stationId: 's1' }
    expect(deriveCues(view(), view(), [patch], 'me')).toEqual(['patchOk'])
    expect(deriveCues(view(), view(), [patch], 'x')).toEqual([])
    expect(deriveCues(view(), view({ lockMs: 4000 }))).toEqual(['patchFail'])
    expect(deriveCues(view({ lockMs: 4000 }), view({ lockMs: 3000 }))).toEqual([])
  })

  it('warns once as immunity is about to end', () => {
    expect(deriveCues(view({ immunityMs: 3200 }), view({ immunityMs: 2900 }))).toEqual([
      'immuneWarn',
    ])
    expect(deriveCues(view({ immunityMs: 2900 }), view({ immunityMs: 2600 }))).toEqual([])
    expect(deriveCues(view({ immunityMs: 500 }), view({ immunityMs: 0 }))).toEqual([])
  })

  it('plays win or lose from my side when results arrive', () => {
    const lobby = view({ phase: 'playing' })
    const clean = view({ phase: 'results', sideWon: 'survivors' })
    expect(deriveCues(lobby, clean)).toEqual(['win'])
    expect(deriveCues(lobby, view({ phase: 'results', sideWon: 'botnet' }))).toEqual(['lose'])
    expect(
      deriveCues(lobby, view({ phase: 'results', sideWon: 'botnet', selfInfected: true })),
    ).toEqual(['win'])
    expect(deriveCues(clean, clean)).toEqual([])
  })

  it('ignores event cues outside play', () => {
    const tag = { type: 'tag', at: 1, from: 'a', to: 'me' }
    expect(deriveCues(view(), view({ phase: 'results' }), [tag], 'me')).toEqual([])
  })
})

describe('freshEvents', () => {
  it('returns each event once', () => {
    const seen = new Set()
    const first = { type: 'tag', at: 1, from: 'a', to: 'b' }
    const second = { type: 'patch', at: 2, sid: 'a' }
    expect(freshEvents([first], seen)).toEqual([first])
    expect(freshEvents([first, second], seen)).toEqual([second])
    expect(eventKey(first)).not.toBe(eventKey(second))
  })
})
