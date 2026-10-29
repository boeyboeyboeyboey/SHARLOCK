import { describe, expect, it } from 'vitest'
import { capyFurs, capyProps, groundMarkup, lifeMarkup, townCapys } from '../townArt.js'

const hex = /^#[0-9a-f]{6}$/i

describe('town capybara variants', () => {
  it('gives every capybara a distinct fur and prop combination', () => {
    const keys = townCapys.map(({ fur, props }) => `${fur}|${[...props].sort().join('+')}`)
    expect(new Set(keys).size).toBe(townCapys.length)
  })

  it('uses only known furs and props with valid palettes', () => {
    for (const { fur, props } of townCapys) {
      expect(capyFurs).toHaveProperty(fur)
      for (const p of props) expect(capyProps).toHaveProperty(p)
    }
    for (const [light, dark] of Object.values(capyFurs)) {
      expect(light).toMatch(hex)
      expect(dark).toMatch(hex)
    }
  })

  it('keeps sharlock-only items out of the townsfolk wardrobe', () => {
    const names = Object.keys(capyProps).join(' ').toLowerCase()
    expect(names).not.toMatch(/deerstalker|monocle|scarf/)
  })

  it('renders one capybara per variant and two gulls', () => {
    const html = lifeMarkup()
    expect(html.match(/class="town-capy"/g)).toHaveLength(townCapys.length)
    expect(html.match(/town-walker gull/g)).toHaveLength(2)
  })
})

describe('town ground', () => {
  it('draws nothing above the world top and keeps the crane 8px clear of it', () => {
    const rects = [...groundMarkup().matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }))
    expect(Math.min(...rects.map((r) => r.y))).toBeGreaterThanOrEqual(0)
    const crane = rects.filter((r) => r.x === 197)
    expect(crane.length).toBeGreaterThan(0)
    for (const r of crane) expect(r.y).toBeGreaterThanOrEqual(2)
  })
})
