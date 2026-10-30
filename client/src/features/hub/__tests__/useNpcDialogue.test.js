import { describe, expect, it } from 'vitest'
import { advanceTalk, useNpcDialogue } from '../useNpcDialogue.js'

const npc = { id: 'a', name: 'A', lines: ['one', 'two', 'three'] }

describe('npc dialogue state', () => {
  it('starts closed and opens on the first line', () => {
    const d = useNpcDialogue()
    expect(d.open.value).toBe(false)
    expect(d.begin(npc)).toBe(true)
    expect(d.open.value).toBe(true)
    expect(d.line.value).toBe('one')
    expect(d.isLast.value).toBe(false)
  })

  it('advances to the last line and stops there', () => {
    const d = useNpcDialogue()
    d.begin(npc)
    d.next()
    d.next()
    expect(d.line.value).toBe('three')
    expect(d.isLast.value).toBe(true)
    d.next()
    expect(d.line.value).toBe('three')
  })

  it('closes and restarts from the first line', () => {
    const d = useNpcDialogue()
    d.begin(npc)
    d.next()
    d.close()
    expect(d.open.value).toBe(false)
    d.begin(npc)
    expect(d.line.value).toBe('one')
  })

  it('ignores an npc with no lines', () => {
    const d = useNpcDialogue()
    expect(d.begin({ id: 'x', lines: [] })).toBe(false)
    expect(d.open.value).toBe(false)
  })
})

describe('advanceTalk', () => {
  it('steps to the next line, then closes on the last', () => {
    const d = useNpcDialogue()
    let closed = 0
    d.begin(npc)
    expect(advanceTalk(d, () => (closed += 1))).toBe(true)
    expect(d.line.value).toBe('two')
    advanceTalk(d, () => (closed += 1))
    expect(d.line.value).toBe('three')
    expect(closed).toBe(0)
    advanceTalk(d, () => { closed += 1; d.close() })
    expect(closed).toBe(1)
    expect(d.open.value).toBe(false)
  })

  it('does nothing without an open talk', () => {
    const d = useNpcDialogue()
    expect(advanceTalk(d, () => { throw new Error('closed') })).toBe(false)
  })
})
