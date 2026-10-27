import { test, expect } from './fixtures/auth.js'

// classic scrollbars take layout space, as on windows and linux desktops
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('solves, repairs, persists across reload and replays the customs case', async ({
  page,
}, testInfo) => {
  const exceptions = []
  page.on('pageerror', (error) => exceptions.push(error.message))
  await page.goto('/games/sql-injection-arcade')
  const sharedHeaderColor = await page
    .locator('.portal-header')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  await page.screenshot({ path: testInfo.outputPath('sql-briefing.png'), fullPage: true })
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  const savedUrl = page.url()
  await page.screenshot({ path: testInfo.outputPath('sql-play.png'), fullPage: true })
  await page.getByLabel('Fictional username', { exact: true }).fill("' OR 1=2 --")
  await page.getByRole('button', { name: 'Test payload', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'literal equality is false' }),
  ).toBeVisible()
  await page.getByLabel('Fictional username', { exact: true }).fill("' OR 1=1 --")
  await page.getByRole('button', { name: 'Test payload', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Query inspector' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Seal the breach' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sql-repair.png'), fullPage: true })
  await page.getByRole('radio', { name: 'Bind input as parameters in a prepared query' }).check()
  await page.getByRole('button', { name: 'Confirm repair' }).click()
  await expect(page.getByText('100 / 100', { exact: true })).toBeVisible()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sql-result.png'), fullPage: true })
  await page.reload()
  await expect(page.getByText('100 / 100', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play again' }).click()
  await page.getByRole('button', { name: 'Open the case' }).click()
  expect(page.url()).not.toBe(savedUrl)
  for (let count = 0; count < 5; count++) {
    await page.getByLabel('Fictional username', { exact: true }).fill('guest')
    await page.getByRole('button', { name: 'Test payload', exact: true }).click()
    await expect(page.getByText(`${count + 1} / 5 tests`, { exact: false })).toBeVisible()
  }
  await page.getByRole('radio', { name: 'Remove spaces from the input' }).check()
  await page.getByRole('button', { name: 'Confirm repair' }).click()
  await expect(page.getByText('0 / 100', { exact: true })).toBeVisible()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to town', exact: true }).last().click()
  await expect(page).toHaveURL(/\/$/)
  expect(await page.locator('.sql-game').count()).toBe(0)
  await page.goto('/about')
  expect(
    await page
      .locator('.portal-header')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(sharedHeaderColor)
  expect(exceptions).toEqual([])
})

test('reflows with keyboard access at required widths and fits the laptop viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/games/sql-injection-arcade')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Open the case' }).click()
  for (const width of [375, 576, 767, 768, 992, 1200, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 })
    if (width < 768)
      await page.getByRole('button', { name: 'Test payload', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: 'Test payload', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Test payload', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width >= 768)
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true,
      )
    if (width >= 768) {
      await expect(page.getByLabel('Fictional username', { exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByLabel('Fictional password', { exact: true })).toBeInViewport({
        ratio: 1,
      })
    }
    const inspector = await page.getByTestId('sql-inspector-row').boundingBox()
    const tests = await page.getByTestId('sql-test-row').boundingBox()
    const gameFrame = await page.locator('.sql-game').boundingBox()
    const workspace = await page.locator('.portal-workspace').boundingBox()
    expect(Math.abs(gameFrame.x - workspace.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(gameFrame.width - workspace.width)).toBeLessThanOrEqual(1)
    expect(inspector.y + inspector.height).toBeLessThanOrEqual(tests.y)
    expect(Math.abs(inspector.x - tests.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(inspector.width - tests.width)).toBeLessThanOrEqual(1)
    if (width === 1280)
      await page.screenshot({ path: testInfo.outputPath('sql-laptop.png'), fullPage: true })
  }
  await page.getByLabel('Fictional username', { exact: true }).focus()
  await page.keyboard.type("' OR 1=1 --")
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Seal the breach' })).toBeVisible()
})

test.describe('with a classic vertical scrollbar', () => {
  test('keeps the frame and back link inside the visible width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only')
    await page.goto('/games/sql-injection-arcade')
    await page.getByRole('button', { name: 'Open the case' }).click()
    await page.addStyleTag({ content: 'html{overflow-y:scroll}' })
    for (const width of [992, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const edges = await page.evaluate(() => ({
        scrollbar: innerWidth - document.documentElement.clientWidth,
        visible: document.documentElement.clientWidth,
        game: document.querySelector('.sql-game').getBoundingClientRect().right,
      }))
      expect(edges.scrollbar).toBeGreaterThan(0)
      const back = await page
        .getByRole('link', { name: /Back to town/ })
        .first()
        .boundingBox()
      expect(edges.game).toBeLessThanOrEqual(edges.visible)
      expect(back.x + back.width).toBeLessThanOrEqual(edges.visible)
    }
  })
})

test('enters through the existing town destination and legacy alias', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Jump to').selectOption('sql-injection-arcade')
  const card = page.getByRole('region', { name: 'SQL Injection Arcade', exact: true })
  await card.getByRole('link', { name: 'Enter activity' }).click()
  await expect(page.getByRole('button', { name: 'Open the case' })).toBeVisible()
  await page.goto('/games/mini-ctf')
  await expect(page).toHaveURL('/games/sql-injection-arcade')
  await expect(
    page.getByRole('heading', { name: 'SQL Injection Arcade', exact: true }),
  ).toBeVisible()
})

test('recovers lost action and completion responses without spending another test or changing the result', async ({
  page,
}, testInfo) => {
  await page.goto('/games/sql-injection-arcade')
  await page.getByRole('button', { name: 'Open the case' }).click()
  let loseAction = true
  const actionIds = []
  await page.route('**/api/attempts/*/actions', async (route) => {
    actionIds.push(route.request().postDataJSON().actionId)
    if (loseAction) {
      loseAction = false
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByLabel('Fictional username', { exact: true }).fill("' OR 1=1 --")
  await page.getByRole('button', { name: 'Test payload', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry same request' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sql-retry.png'), fullPage: true })
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByRole('group', { name: 'Seal the breach' })).toBeVisible()
  expect(actionIds[0]).toBe(actionIds[1])
  let loseCompletion = true
  const completionIds = []
  await page.route('**/api/attempts/*/complete', async (route) => {
    completionIds.push(route.request().postDataJSON().actionId)
    if (loseCompletion) {
      loseCompletion = false
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('radio', { name: 'Bind input as parameters in a prepared query' }).check()
  await page.getByRole('button', { name: 'Confirm repair' }).click()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByText('100 / 100', { exact: true })).toBeVisible()
  expect(completionIds[0]).toBe(completionIds[1])
})
