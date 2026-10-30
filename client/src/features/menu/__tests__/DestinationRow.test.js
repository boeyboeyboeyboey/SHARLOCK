import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DestinationRow from '../DestinationRow.vue'
import { gameCatalog } from '../../../data/gameCatalog.js'

const game = gameCatalog[0]

describe('destination row', () => {
  it('shows the short name but is named by the full name', () => {
    const wrapper = mount(DestinationRow, { props: { game } })
    expect(wrapper.text()).toBe(game.shortName)
    expect(wrapper.attributes('aria-label')).toBe(game.name)
    expect(wrapper.attributes('aria-pressed')).toBeUndefined()
  })

  it('marks a selected row with aria-pressed and a visible check', () => {
    const on = mount(DestinationRow, { props: { game, pressed: true } })
    expect(on.attributes('aria-pressed')).toBe('true')
    expect(on.text()).toContain('✓')
    const off = mount(DestinationRow, { props: { game, pressed: false } })
    expect(off.attributes('aria-pressed')).toBe('false')
    expect(off.text()).not.toContain('✓')
  })

  it('adds a needs 3D badge to a plain row only', () => {
    const tag = { ...game, needs3d: true }
    const row = mount(DestinationRow, { props: { game: tag } })
    expect(row.text()).toContain('3D')
    expect(row.attributes('aria-label')).toBe(`${tag.name}, needs 3D`)
    const toggle = mount(DestinationRow, { props: { game: tag, pressed: false } })
    expect(toggle.text()).not.toContain('3D')
    expect(toggle.attributes('aria-label')).toBe(tag.name)
  })
})
