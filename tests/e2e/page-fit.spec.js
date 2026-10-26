import { test, expect } from './fixtures/auth.js'

// fitted pages must not scroll at a laptop-height window; long pages (About, Instructor, Admin, Progress) are not listed
test.use({ viewport: { width: 1280, height: 720 } })
test.skip(({ isMobile }) => isMobile, 'the fit target is desktop width')
// one worker logs in once; parallel workers hit the login rate limit in the shared auth fixture
test.describe.configure({ mode: 'serial' })

const SIGNED_IN = [
  ['Town map', '/'],
  ['News dialog over the town', '/games/threat-briefing'],
  ['Detective profile', '/profile'],
  ['Your classes', '/classes'],
  ['SQL Injection Arcade briefing', '/games/sql-injection-arcade'],
  ['Regex preview', '/games/regex-defender'],
  ['CLI Cyber Defender briefing', '/games/cli-cyber-defender'],
  ['Phishing Post-Mortem briefing', '/games/phishing-post-mortem'],
  ['Social Engineering briefing', '/games/social-engineering-simulator'],
]

const SIGNED_OUT = [
  ['Sign in', '/login'],
  ['Create account', '/register'],
]

async function expectFits(page) {
  await page.waitForLoadState('networkidle')
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

  for (const [name, route] of SIGNED_OUT) {
    test(`fits the window: ${name}`, async ({ page }) => {
      await page.goto(route)
      await expectFits(page)
    })
  }
})

test('the sidebar does not scroll on the profile and classes pages', async ({ page }) => {
  for (const route of ['/profile', '/classes']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => {
      const menu = document.querySelector('#portal-menu')
      return menu.scrollHeight - menu.clientHeight
    })
    expect(overflow, `sidebar overflow on ${route}`).toBeLessThanOrEqual(0)
  }
})
