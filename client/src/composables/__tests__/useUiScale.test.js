import { beforeEach, describe, expect, it } from 'vitest'
import { UI_SCALE_KEY, readUiSize, scaleFor, setUiSize, useUiScale } from '../useUiScale.js'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty('--ui-scale')
})

describe('useUiScale', () => {
  it('defaults to medium at full size and applies the property', () => {
    const ui = useUiScale()
    expect(ui.size.value).toBe('medium')
    expect(ui.scale.value).toBe(1)
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1')
  })

  it('maps each size to its scale', () => {
    expect([scaleFor('small'), scaleFor('medium'), scaleFor('large')]).toEqual([0.85, 1, 1.15])
    expect(scaleFor('bogus')).toBe(1)
  })

  it('persists a choice and updates the property', () => {
    const ui = useUiScale()
    ui.setSize('small')
    expect(localStorage.getItem(UI_SCALE_KEY)).toBe('small')
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.85')
    expect(readUiSize()).toBe('small')
  })

  it('ignores unknown sizes and unknown stored values', () => {
    setUiSize('huge')
    expect(localStorage.getItem(UI_SCALE_KEY)).toBeNull()
    localStorage.setItem(UI_SCALE_KEY, 'huge')
    expect(readUiSize()).toBe('medium')
  })
})
