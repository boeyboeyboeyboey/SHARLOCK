import { test, expect } from './fixtures/auth.js'
import { forceTown2d } from './fixtures/town.js'

// fitted pages must not scroll at a laptop-height window; long pages (About, Instructor, Admin, Progress) are not listed
test.use({ viewport: { width: 1280, height: 720 } })
test.skip(({ isMobile }) => isMobile, 'the fit target is desktop width')
test.beforeEach(({ page }) => forceTown2d(page))

const SIGNED_IN = [
  ['Town map', '/'],
  ['News dialog over the town', '/games/threat-briefing'],
  ['Detective profile', '/profile'],
  ['Your classes', '/classes'],
  ['SQL Injection Arcade briefing', '/games/sql-injection-arcade'],
  ['Clearance Tower briefing', '/games/clearance-tower'],
  ['CLI Cyber Defender briefing', '/games/cli-cyber-defender'],
  ['Phishing Post-Mortem briefing', '/games/phishing-post-mortem'],
  ['Social Engineering briefing', '/games/social-engineering-simulator'],
]

async function expectFits(page) {
  await expect(page.getByRole('heading').or(page.getByTestId('town-player')).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const size = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(size.scrollHeight, 'page height').toBeLessThanOrEqual(size.innerHeight + 1)
  expect(size.scrollWidth, 'page width').toBeLessThanOrEqual(size.innerWidth)
}

for (const [name, route] of SIGNED_IN) {
  test(`fits the window: ${name}`, async ({ page }) => {
    await page.goto(route)
    await expectFits(page)
  })
}

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  // these forms grow with an error banner, so they scroll with the page instead of clipping a card
  test('sign-in shows its button without scrolling and no inner scroller', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeInViewport({ ratio: 1 })
    const card = page.locator('.auth-card')
    expect(await card.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible')
    const width = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    expect(width, 'page width').toBe(true)
  })

  test('create account keeps the whole form in one page scroll', async ({ page }) => {
    await page.goto('/register')
    const card = page.locator('.auth-card')
    await expect(card).toBeVisible()
    expect(await card.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible')
    const width = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    expect(width, 'page width').toBe(true)
    const submit = page.getByRole('button', { name: 'Create account' })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport({ ratio: 1 })
  })
})

test('the profile and classes overlays stay inside the window', async ({ page }) => {
  for (const route of ['/profile', '/classes']) {
    await page.goto(route)
    await expect(page.getByTestId('menu-overlay')).toBeVisible()
    const box = await page.getByTestId('menu-overlay').evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return {
        fitsHeight: rect.top >= 0 && rect.bottom <= innerHeight,
        fitsWidth: rect.left >= 0 && rect.right <= innerWidth,
        pageScroll: document.documentElement.scrollWidth - innerWidth,
      }
    })
    expect(box.fitsHeight, `overlay height on ${route}`).toBe(true)
    expect(box.fitsWidth, `overlay width on ${route}`).toBe(true)
    expect(box.pageScroll, `page overflow on ${route}`).toBeLessThanOrEqual(0)
  }
})
