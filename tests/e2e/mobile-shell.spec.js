import { test, expect } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'
import { LEVELS } from '../../server/src/modules/games/clearance-tower/levels.js'

async function open(browser, baseURL, who, path, size) {
  const { context, page } = await signedInPage(browser, baseURL, who)
  // the game themes are not shipped yet; serve an existing track so the sound button is shown
  await page.route('**/audio/games/*-theme.mp3', (route) =>
    route.fulfill({ path: 'client/public/audio/hub-ambience.mp3', contentType: 'audio/mpeg' }),
  )
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  if (size) await page.setViewportSize(size)
  await page.goto(path)
  return { context, page }
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('phone shell', () => {
  test.skip(({ viewport }) => viewport.width > 575, 'phone widths only')

  test('the game controls sit in a bar above the game heading', async ({ browser, baseURL }) => {
    const room = await seedClass(`ms${Date.now().toString(36)}`)
    const { context, page } = await open(browser, baseURL, room.studentA, '/games/clearance-tower')
    try {
      await page.setViewportSize({ width: 360, height: 740 })
      const heading = page.getByTestId('interior-desk').getByRole('heading', { level: 1 }).first()
      await expect(heading).toBeVisible()
      const exit = await page.getByRole('button', { name: 'Exit game' }).boundingBox()
      const title = await heading.boundingBox()
      expect(overlaps(exit, title)).toBe(false)
      expect(exit.y + exit.height).toBeLessThanOrEqual(title.y)

      // every control in the bar is a full touch target and fits inside the viewport
      const bar = page.getByTestId('immersive-controls')
      const view = page.viewportSize()
      const boxes = []
      for (const control of await bar.getByRole('button').all()) {
        if (await control.isVisible()) boxes.push(await control.boundingBox())
      }
      await expect(page.getByTestId('interior-sound')).toBeVisible()
      // menu, sound and exit; game pages have no 3d | 2d switch since INT-04
      expect(boxes.length).toBeGreaterThanOrEqual(3)
      await expect(bar.getByRole('group', { name: 'View mode' })).toHaveCount(0)
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(view.width)
        expect(b.height).toBeGreaterThanOrEqual(44)
        expect(b.width).toBeGreaterThanOrEqual(44)
      }
      expect(new Set(boxes.map((b) => Math.round(b.y + b.height / 2))).size).toBe(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        view.width,
      )
    } finally {
      await context.close()
    }
  })

  test('wide landscape phones keep the bar above the game', async ({ browser, baseURL }) => {
    const room = await seedClass(`ml${Date.now().toString(36)}`)
    const { context, page } = await open(browser, baseURL, room.studentA, '/games/clearance-tower')
    try {
      await page.setViewportSize({ width: 932, height: 430 })
      const heading = page.getByTestId('interior-desk').getByRole('heading', { level: 1 }).first()
      await expect(heading).toBeVisible()
      const exit = await page.getByRole('button', { name: 'Exit game' }).boundingBox()
      const title = await heading.boundingBox()
      expect(exit.y + exit.height).toBeLessThanOrEqual(title.y)
      const bar = await page.getByTestId('immersive-controls').boundingBox()
      expect(bar.x).toBe(0)
      expect(bar.width).toBe(932)
    } finally {
      await context.close()
    }
  })

  test('the site menu covers the screen and the town behind it takes no taps', async ({
    browser,
    baseURL,
  }) => {
    const room = await seedClass(`mm${Date.now().toString(36)}`)
    const { context, page } = await open(browser, baseURL, room.studentA, '/')
    try {
      await expect(page.getByTestId('town-player')).toBeVisible()
      await page.getByTestId('menu-button').click()
      const menu = page.getByTestId('site-menu')
      await expect(menu).toBeVisible()
      // the drawer slides in, so wait for it to settle at the left edge
      await expect.poll(async () => (await menu.boundingBox()).x).toBe(0)
      const box = await menu.boundingBox()
      const view = page.viewportSize()
      expect(box.width).toBeGreaterThanOrEqual(view.width)
      expect(box.height).toBeGreaterThanOrEqual(view.height)
      const behind = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="town-player"]')
        const r = stage.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit?.closest('dialog') !== null
      })
      expect(behind).toBe(true)

      const toggle = page.getByTestId('menu-online-toggle')
      await expect(toggle).toBeVisible()
      expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44)
    } finally {
      await context.close()
    }
  })

  for (const size of [
    { width: 390, height: 844 },
    { width: 667, height: 375 },
  ]) {
    test(`2D town starts at 100% and zooms out to a fully visible town at ${size.width}x${size.height}`, async ({
      browser,
      baseURL,
    }) => {
      const room = await seedClass(`mt${size.width}${Date.now().toString(36)}`)
      const { context, page } = await open(browser, baseURL, room.studentA, '/', size)
      try {
        await expect(page.getByTestId('town-player')).toBeVisible()
        await expect(page.getByLabel('Map zoom level')).toHaveText('100%')
        await page.getByRole('region', { name: 'Interactive town map' }).focus()
        const zoomOut = page.getByRole('button', { name: 'Zoom out' })
        for (let i = 0; i < 8; i++) await page.keyboard.press('-')
        await expect(zoomOut).toBeDisabled()
        const labels = page.locator('.building-name')
        const total = await labels.count()
        expect(total).toBeGreaterThan(0)
        for (let i = 0; i < total; i++) {
          const box = await labels.nth(i).boundingBox()
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.y).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(size.width)
          expect(box.y + box.height).toBeLessThanOrEqual(size.height)
        }
      } finally {
        await context.close()
      }
    })
  }

  test('the 2D fallback notice has full-size tap targets', async ({ browser, baseURL }) => {
    const room = await seedClass(`mf${Date.now().toString(36)}`)
    const login = await signedInPage(browser, baseURL, room.studentA)
    const state = await login.context.storageState()
    await login.context.close()
    // a phone with no stored town mode, so the notice shows
    const context = await browser.newContext({
      storageState: state,
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    try {
      await page.goto('/')
      const notice = page.getByTestId('town-mode-notice')
      await expect(notice).toBeVisible()
      const targets = notice.getByRole('link').or(notice.getByRole('button'))
      expect(await targets.count()).toBeGreaterThanOrEqual(3)
      for (const target of await targets.all()) {
        expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44)
      }
    } finally {
      await context.close()
    }
  })

  test('the save chooser keeps a gap below How to play', async ({ browser, baseURL }) => {
    const room = await seedClass(`mc${Date.now().toString(36)}`)
    const { context, page } = await open(
      browser,
      baseURL,
      room.studentA,
      '/games/phishing-post-mortem',
      { width: 375, height: 667 },
    )
    try {
      const howTo = page.getByRole('button', { name: 'How to play' })
      const label = page.getByText('Save this run to', { exact: true })
      await expect(label).toBeVisible()
      const above = await howTo.boundingBox()
      const below = await label.boundingBox()
      expect(below.y - (above.y + above.height)).toBeGreaterThanOrEqual(8)
    } finally {
      await context.close()
    }
  })

  test('the Clearance matrix fits a phone with whole-word headers', async ({
    browser,
    baseURL,
  }) => {
    const room = await seedClass(`mt${Date.now().toString(36)}`)
    const { context, page } = await open(
      browser,
      baseURL,
      room.studentA,
      '/games/clearance-tower',
      {
        width: 375,
        height: 667,
      },
    )
    try {
      await page.getByLabel('Save this case to').selectOption('personal')
      await page.getByRole('button', { name: 'Open the case' }).click()
      await page.getByRole('button', { name: new RegExp(LEVELS[0].title) }).click()
      await page.getByRole('button', { name: 'Open the policy desk' }).click()
      const table = page.getByRole('table')
      await expect(table).toBeVisible()
      // a header word is wider than one letter, so it never stacks letter by letter
      const agent = await table.getByRole('columnheader', { name: 'Agent' }).boundingBox()
      expect(agent.width).toBeGreaterThan(agent.height)
      const noPageScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      )
      expect(noPageScroll).toBe(true)
      const fits = await table.evaluate(
        (node) => node.parentElement.scrollWidth <= node.parentElement.clientWidth,
      )
      expect(fits).toBe(true)
      for (const right of await table.getByRole('button').all()) {
        expect((await right.boundingBox()).height).toBeGreaterThanOrEqual(44)
      }
    } finally {
      await context.close()
    }
  })

  test('the CLI console starts below the bar with full-size target chips', async ({
    browser,
    baseURL,
  }) => {
    const room = await seedClass(`mk${Date.now().toString(36)}`)
    const { context, page } = await open(
      browser,
      baseURL,
      room.studentA,
      '/games/cli-cyber-defender',
      { width: 375, height: 667 },
    )
    try {
      await page.getByLabel('Save this run to').selectOption('personal')
      await page.getByRole('button', { name: 'Start the run' }).click()
      await page.getByRole('button', { name: 'Practice (no timer)' }).click()
      await expect(page.getByRole('textbox', { name: 'Command', exact: true })).toBeVisible()
      const bar = await page.getByTestId('immersive-controls').boundingBox()
      const title = page.getByRole('heading', { name: 'CLI Cyber Defender', level: 1 })
      // the game scrolls itself into place after the run starts
      await expect
        .poll(async () => (await title.boundingBox()).y)
        .toBeGreaterThanOrEqual(bar.y + bar.height)
      const chips = page.getByRole('button', { name: /^Use .+ as the target$/ })
      expect(await chips.count()).toBeGreaterThan(0)
      for (const chip of await chips.all()) {
        expect(Math.round((await chip.boundingBox()).height)).toBeGreaterThanOrEqual(44)
      }
    } finally {
      await context.close()
    }
  })

  test('LLM Social Engineering Simulator chat labels and codes are at least 12px', async ({
    browser,
    baseURL,
  }) => {
    const room = await seedClass(`mh${Date.now().toString(36)}`)
    const { context, page } = await open(
      browser,
      baseURL,
      room.studentA,
      '/games/social-engineering-simulator',
      { width: 375, height: 667 },
    )
    try {
      await page.getByLabel('Save this shift to').selectOption('personal')
      await page.getByRole('button', { name: 'Start the shift' }).click()
      await expect(page.getByTestId('soc-call-number')).toBeVisible()
      await page.getByLabel('Your reply').fill('Who is asking, and why do you need the code?')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(page.getByText('Scripted').first()).toBeVisible()
      const sizes = await page
        .locator('.soc-message-author, code')
        .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))
      expect(sizes.length).toBeGreaterThan(1)
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12)
    } finally {
      await context.close()
    }
  })
})
