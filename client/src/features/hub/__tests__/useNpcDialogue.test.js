import { describe, expect, it } from 'vitest'
import { useNpcDialogue } from '../useNpcDialogue.js'

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
