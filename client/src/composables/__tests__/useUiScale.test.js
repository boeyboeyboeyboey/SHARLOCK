import { beforeEach, describe, expect, it } from 'vitest'
import { UI_SCALE_KEY, readUiSize, scaleFor, setUiSize, useUiScale } from '../useUiScale.js'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty('--ui-scale')
})

describe('useUiScale', () => {
  it('defaults to medium at 0.85 and applies the property', () => {
    const ui = useUiScale()
    expect(ui.size.value).toBe('medium')
    expect(ui.scale.value).toBe(0.85)
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.85')
  })

  it('maps each size to its scale', () => {
    expect([scaleFor('small'), scaleFor('medium'), scaleFor('large')]).toEqual([0.75, 0.85, 1])
    expect(scaleFor('bogus')).toBe(0.85)
  })

  it('persists a choice and updates the property', () => {
    const ui = useUiScale()
    ui.setSize('small')
    expect(localStorage.getItem(UI_SCALE_KEY)).toBe('small')
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.75')
    expect(readUiSize()).toBe('small')
  })

  it('ignores unknown sizes and unknown stored values', () => {
    setUiSize('huge')
    expect(localStorage.getItem(UI_SCALE_KEY)).toBeNull()
    localStorage.setItem(UI_SCALE_KEY, 'huge')
    expect(readUiSize()).toBe('medium')
  })
})
