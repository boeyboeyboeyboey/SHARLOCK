import { test, expect } from './fixtures/auth.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import {
  failSteps,
  finishRun,
  generateCase,
  junkAction,
  openRun,
  playCase,
  playStep,
  solutionFor,
  waitForCase,
} from './fixtures/sql.js'

// classic scrollbars take layout space, as on windows and linux desktops
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const firstInput = (page) => page.locator('.sql-case-form input').first()

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('plays a practice run with a wrong try, a hint, replay and a saved review', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const exceptions = []
  page.on('pageerror', (error) => exceptions.push(error.message))
  // the town and its overlays have no navbar, so read the header on a regular page
  await page.goto('/join-class')
  const sharedHeaderColor = await page
    .locator('.portal-header')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const seed = await openRun(page)
  const savedUrl = page.url()
  const first = generateCase({ seed, index: 0 })
  await waitForCase(page, first)
  await expect(page.getByTestId('sql-hud-case')).toHaveText('Case 1 of 12')
  await expect(page.getByText('Tries left 3 of 3')).toBeVisible()
  await expect(page.getByTestId('sql-hud-clock')).toHaveCount(0)

  // a wrong try keeps the case open and moves focus to the announced result
  await playStep(page, first, junkAction(first))
  await expect(page.getByTestId('sql-result')).toContainText('Server response')
  await expect(page.getByTestId('sql-result')).toBeFocused()
  await expect(page.getByText('Tries left 2 of 3')).toBeVisible()

  // a hint marks the case assisted and drops the first-try bonus
  await page.getByRole('button', { name: 'Show a hint' }).click()
  await expect(page.getByText('Assisted', { exact: true })).toBeVisible()
  await expect(page.getByText('Hint:')).toBeVisible()
  for (const step of solutionFor(first)) await playStep(page, first, step)
  await expect(page.getByTestId('sql-result')).toContainText('Solved: +10 points')
  await page.getByRole('button', { name: 'Next case' }).click()
  await expect(firstInput(page)).toBeFocused()

  for (let index = 1; index < 15; index += 1) {
    const c = generateCase({ seed, index })
    await playCase(page, c, solutionFor(c))
    if (index < 14) await page.getByRole('button', { name: 'Next case' }).click()
  }
  await finishRun(page)
  await expect(page.getByRole('table', { name: 'Run review' }).locator('tbody tr')).toHaveCount(15)
  await expect(page.getByRole('cell', { name: 'Yes', exact: true })).toHaveCount(1)
  await page.reload()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Play again' }).click()
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  expect(page.url()).not.toBe(savedUrl)
  await expect(page.getByTestId('sql-hud-case')).toHaveText('Case 1 of 12')

  await page
    .getByRole('link', { name: /Back to town/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/$/)
  expect(await page.locator('.sql-game').count()).toBe(0)
  await page.goto('/join-class')
  expect(
    await page
      .locator('.portal-header')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(sharedHeaderColor)
  expect(exceptions).toEqual([])
})

test('resumes the open case after a reload', async ({ page }) => {
  const seed = await openRun(page)
  const first = generateCase({ seed, index: 0 })
  await playStep(page, first, junkAction(first))
  await expect(page.getByText('Tries left 2 of 3')).toBeVisible()
  await page.reload()
  await waitForCase(page, first)
  await expect(page.getByText('Tries left 2 of 3')).toBeVisible()
  await expect(page.getByTestId('sql-result')).toContainText('Server response')
})

test('a class run is timed, spends lives on failed cases and saves', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const seeded = await seedClass(Math.random().toString(16).slice(2, 10))
  const session = await signedInPage(browser, baseURL, seeded.studentA)
  const { page } = session
  try {
    const seed = await openRun(page, seeded.classId)
    await expect(page.getByTestId('sql-hud-case')).toHaveText('Case 1')
    await expect(page.getByText('Lives 3 of 3')).toBeVisible()
    await expect(page.getByTestId('sql-hud-clock')).toHaveText(/^[0-3]:\d\d$/)
    await expect(page.getByRole('button', { name: 'Show a hint' })).toHaveCount(0)
    const first = generateCase({ seed, index: 0 })
    await playCase(page, first, solutionFor(first))
    await expect(page.getByTestId('sql-result')).toContainText('Solved: +20 points')
    await page.getByRole('button', { name: 'Next case' }).click()
    const second = generateCase({ seed, index: 1 })
    await playCase(page, second, failSteps(second))
    await expect(page.getByTestId('sql-result')).toContainText('Not solved')
    await expect(page.getByText('Lives 2 of 3')).toBeVisible()
    await page.getByRole('button', { name: 'Next case' }).click()
    for (const index of [2, 3]) {
      const c = generateCase({ seed, index })
      await playCase(page, c, failSteps(c))
      if (index === 2) await page.getByRole('button', { name: 'Next case' }).click()
    }
    await finishRun(page)
    await expect(page.getByText('The run ended when your lives ran out.')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Run review' }).locator('tbody tr')).toHaveCount(4)
  } finally {
    await session.context.close()
  }
})

test('reflows with keyboard access at required widths and fits the laptop viewport', async ({
  page,
}, testInfo) => {
  const seed = await openRun(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const first = generateCase({ seed, index: 0 })
  const submit = page.getByRole('button', { name: 'Run the query', exact: true })
  for (const width of [375, 576, 767, 768, 992, 1200, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 })
    if (width < 768) await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeVisible()
    await expect(submit).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width >= 768) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true,
      )
      await expect(firstInput(page)).toBeInViewport({ ratio: 1 })
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
  // type the solution and submit with Enter, never touching the mouse
  const [step] = solutionFor(first)
  await firstInput(page).focus()
  for (const [position, value] of step.payload.inputs.entries()) {
    if (position > 0) await page.keyboard.press('Tab')
    await page.keyboard.type(value)
  }
  await Promise.all([
    page.waitForResponse((response) => /\/actions$/.test(response.url())),
    page.keyboard.press('Enter'),
  ])
  await expect(page.getByTestId('sql-result')).toContainText('Solved')
  await expect(page.getByRole('button', { name: 'Next case' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test.describe('with a classic vertical scrollbar', () => {
  test('keeps the frame and back link inside the visible width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only')
    await openRun(page)
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

test('recovers lost action and completion responses without spending another try or changing the result', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const seed = await openRun(page)
  const first = generateCase({ seed, index: 0 })
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
  const inputs = page.locator('.sql-case-form input')
  const step = junkAction(first)
  for (const [position, value] of step.payload.inputs.entries())
    await inputs.nth(position).fill(value)
  await page.getByRole('button', { name: 'Run the query', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry same request' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByText('Tries left 2 of 3')).toBeVisible()
  expect(actionIds[0]).toBe(actionIds[1])

  await page.unroute('**/api/attempts/*/actions')
  for (const step of solutionFor(first)) await playStep(page, first, step)
  await page.getByRole('button', { name: 'Next case' }).click()
  for (let index = 1; index < 15; index += 1) {
    const c = generateCase({ seed, index })
    await playCase(page, c, solutionFor(c))
    if (index < 14) await page.getByRole('button', { name: 'Next case' }).click()
  }
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
  await page.getByRole('button', { name: 'Finish and save result' }).click()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
  expect(completionIds[0]).toBe(completionIds[1])
})
