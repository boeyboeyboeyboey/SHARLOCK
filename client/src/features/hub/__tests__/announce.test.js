import { describe, expect, it } from 'vitest'
import { announceChange } from '../announce.js'

const names = { a: 'Alpha', b: 'Beta' }
const nameOf = (id) => names[id]
const at = (selected, nearDoor = null, mode = 'explore') => ({ selected, nearDoor, mode })

describe('announceChange', () => {
  it('announces a new pick', () => {
    expect(announceChange(at(null), at('a'), nameOf)).toBe('Alpha selected')
    expect(announceChange(at('a'), at('b'), nameOf)).toBe('Beta selected')
  })

  it('announces arrival once the player reaches the picked door', () => {
    expect(announceChange(at('a'), at('a', 'a'), nameOf)).toBe(
      'Arrived at Alpha. Press Enter to go in',
    )
    expect(announceChange(at(null), at('a', 'a'), nameOf)).toBe(
      'Arrived at Alpha. Press Enter to go in',
    )
  })

  it('stays quiet when nothing relevant changed', () => {
    expect(announceChange(at('a', 'a'), at('a', 'a'), nameOf)).toBe('')
    expect(announceChange(at(null), at(null, 'b'), nameOf)).toBe('')
    expect(announceChange(at('a'), at('a', 'b'), nameOf)).toBe('')
    expect(announceChange(at('a', 'a'), at('a', null), nameOf)).toBe('')
  })

  it('announces entering and a cleared pick', () => {
    expect(announceChange(at('a', 'a'), at('a', 'a', 'entering'), nameOf)).toBe('Entering Alpha')
    expect(announceChange(at('a', 'a', 'entering'), at('a', 'a', 'panel'), nameOf)).toBe('')
    expect(announceChange(at('a', 'a'), at(null), nameOf)).toBe('Selection cleared')
  })

  it('does not announce a clear while leaving or returning', () => {
    expect(announceChange(at('a', 'a', 'returning'), at(null, null, 'explore'), nameOf)).toBe('')
  })
})
