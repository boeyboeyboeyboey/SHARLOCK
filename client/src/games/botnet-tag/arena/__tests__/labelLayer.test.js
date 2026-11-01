import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLabelLayer } from '../labelLayer.js'

const item = (extra = {}) => ({
  key: 'p1',
  text: 'ada',
  x: 10,
  y: 20,
  scale: 1,
  kind: 'player',
  ...extra,
})

let container
let layer
beforeEach(() => {
  container = document.createElement('div')
  layer = createLabelLayer(container)
})
afterEach(() => layer.dispose())

const labels = () => [...container.querySelectorAll('[data-testid="tag-labels"] > div')]

describe('label layer', () => {
  it('creates, renames and removes labels by key', () => {
    layer.update([item(), item({ key: 'p2', text: 'noor' })])
    expect(layer.count()).toBe(2)
    expect(labels().map((node) => node.textContent)).toEqual(['ada', 'noor'])
    layer.update([item({ text: 'ada lovelace' })])
    expect(layer.count()).toBe(1)
    expect(labels().map((node) => node.textContent)).toEqual(['ada lovelace'])
  })

  it('adds a bot chip, and an infection mark only while infected', () => {
    layer.update([item({ isBot: true, infected: true })])
    expect(labels()[0].textContent).toContain('bot')
    expect(labels()[0].querySelector('svg')).not.toBeNull()
    layer.update([item({ isBot: true, infected: false })])
    expect(labels()[0].querySelector('svg')).toBeNull()
  })

  it('writes the screen position to the element', () => {
    layer.update([item({ x: 10.4, y: 20.6, scale: 0.5 })])
    expect(labels()[0].style.transform).toContain('translate(10px, 21px)')
    expect(labels()[0].style.transform).toContain('scale(0.50)')
  })

  it('takes its layer out of the page on dispose', () => {
    layer.update([item()])
    layer.dispose()
    expect(container.children).toHaveLength(0)
    expect(layer.count()).toBe(0)
  })
})
