import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// read from disk because vitest does not return css source for ?raw imports
const readCss = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
const phishCss = readCss('../phishing-post-mortem/phish.css')
const socCss = readCss('../social-engineering-simulator/sim.css')
const clearanceCss = readCss('../clearance-tower/clearance.css')

// reads the --game-* declarations from the first rule block of a game's root class
function readTokens(css, rootClass) {
  const start = css.indexOf(`${rootClass} {`)
  expect(start, `${rootClass} block not found`).toBeGreaterThanOrEqual(0)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/(--game-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  )
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const GAMES = [
  {
    name: 'phishing',
    css: phishCss,
    rootClass: '.phish-game',
    extra: [['ink', 'bad-soft']],
    ui: [],
  },
  {
    name: 'social engineering',
    css: socCss,
    rootClass: '.soc-game',
    extra: [['warn', 'warn-soft']],
    ui: [
      ['edge', 'surface'],
      ['edge', 'bg'],
    ],
  },
  {
    name: 'clearance tower',
    css: clearanceCss,
    rootClass: '.clearance-game',
    extra: [['warn', 'warn-soft']],
    ui: [
      ['edge', 'surface'],
      ['edge', 'bg'],
    ],
  },
]

describe.each(GAMES)('$name palette', ({ css, rootClass, extra, ui }) => {
  const tokens = readTokens(css, rootClass)
  const color = (name) => (name.startsWith('#') ? name : tokens[`--game-${name}`])

  it('keeps no blue or purple accent', () => {
    expect(css).not.toMatch(/#1b64d1|#e8f0fd|#4338ca|#eceafe/i)
  })

  it('text pairings meet 4.5:1', () => {
    const pairs = [
      ['ink', 'bg'],
      ['ink', 'surface'],
      ['muted', 'bg'],
      ['muted', 'surface'],
      ['muted', 'accent-soft'],
      ['accent', 'surface'],
      ['accent', 'bg'],
      ['accent', 'accent-soft'],
      ['#ffffff', 'accent'],
      ['bar-ink', 'bar'],
      ['good', 'good-soft'],
      ['bad', 'bad-soft'],
      ...extra,
    ]
    for (const [foreground, background] of pairs) {
      const ratio = contrast(color(foreground), color(background))
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('focus ring meets 3:1', () => {
    for (const background of ['surface', 'bg']) {
      const ratio = contrast(color('accent'), color(background))
      expect(ratio, `accent against ${background}`).toBeGreaterThanOrEqual(3)
    }
    for (const [foreground, background] of ui) {
      const ratio = contrast(color(foreground), color(background))
      expect(ratio, `${foreground} against ${background}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('social engineering pixel theme', () => {
  const tokens = readTokens(socCss, '.soc-game')

  it('uses the hub body font for text and the pixel font for headings', () => {
    expect(tokens['--game-font']).toMatch(/var\(--font-body\)/)
    expect(tokens['--game-heading-font']).toMatch(/var\(--font-pixel\)/)
  })

  it('shows scores and counters in a plain numeral font, because the pixel 5 reads as an S', () => {
    expect(tokens['--game-number-font']).toBeDefined()
    for (const selector of [
      '.soc-debrief-head h2',
      '.soc-breakdown-points',
      '.soc-convo-turns',
      '.soc-composer-count',
    ]) {
      const block = socCss.slice(socCss.indexOf(`${selector} {`)).split('}')[0]
      expect(block, selector).toContain('font-family: var(--game-number-font)')
    }
  })

  it('has square corners, except the round unread badge on the conversation tabs', () => {
    const withoutBadge = socCss.replace(/\.soc-tab-badge\s*\{[^}]*\}/, '')
    expect(withoutBadge).not.toMatch(/border-radius:\s*[1-9]/)
    const badge = socCss.match(/\.soc-tab-badge\s*\{[^}]*\}/)?.[0] ?? ''
    expect(badge).toContain('border-radius: 50%')
    expect(badge).toContain('background: var(--game-bad)')
  })
})
