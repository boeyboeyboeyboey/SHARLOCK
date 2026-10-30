import { test, expect } from './fixtures/auth.js'

// no hub override here: headless chromium renders in software, so the device checks must pick the 2D map
test.setTimeout(240000)
const slow = { timeout: 120000 }
const shots =
  '/private/tmp/claude-501/-Users-boey-Documents-SMU-2-1-wad2-group-proj-IS216-GROUP7-SHARLOCK/096f058d-3b1d-428a-b555-066dffafadfc/scratchpad'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sharlock.hubWatchManual', '1'))
  await page.addInitScript(() => localStorage.setItem('sharlock.loreIntroSeen', '1'))
  await page.addInitScript(() => localStorage.setItem('sharlock.controlsHintSeen', '3'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  await page.route('**/api/news**', (route) => route.abort())
})

// waits for rendered frames, so a "nothing happens" check covers real scene updates and not wall-clock time
const frames = (page, count = 30) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      }),
    count,
  )
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key)

test('picks the 2D town automatically and remembers a dismissed notice', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByTestId('town-mode-notice')
  await expect(page.getByRole('region', { name: 'Interactive town map' })).toBeVisible()
  await expect(notice).toContainText('may not run 3D smoothly')
  await expect(notice.getByRole('link', { name: 'Why?' })).toHaveAttribute(
    'href',
    '/about#graphics',
  )
  expect(await stored(page, 'sharlock.townMode')).toBeNull()
  await page.screenshot({ path: `${shots}/hub02-notice.png` })

  await page.getByTestId('town-mode-notice-close').click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Interactive town map' })).toBeVisible()
  await expect(notice).toHaveCount(0)
  expect(await stored(page, 'sharlock.autoNoticeDismissed')).toBe('software-renderer')
})

test('asks before trying 3D and persists a confirmed choice', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByTestId('town-mode-toggle')
  const warning = page.getByTestId('hub-3d-warning')
  await expect(toggle).toHaveText('3D')

  await toggle.click()
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('This device may struggle to run the 3D town')
  await expect(page.getByTestId('hub-3d-cancel')).toBeFocused()
  await page.screenshot({ path: `${shots}/hub02-warning.png` })
  await page.keyboard.press('Escape')
  await expect(warning).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Interactive town map' })).toBeVisible()
  expect(await stored(page, 'sharlock.townMode')).toBeNull()

  await toggle.click()
  await page.getByTestId('hub-3d-cancel').click()
  await expect(warning).toHaveCount(0)
  expect(await stored(page, 'sharlock.townMode')).toBeNull()

  await toggle.click()
  await page.getByTestId('hub-3d-confirm').click()
  await page.waitForFunction(() => window.__hub?.state.ready === true, null, slow)
  expect(await stored(page, 'sharlock.townMode')).toBe('3d')
  await page.reload()
  await page.waitForFunction(() => window.__hub?.state.ready === true, null, slow)
  await expect(page.getByTestId('hub-3d-warning')).toHaveCount(0)
})

test('explains the modes on the About page', async ({ page }) => {
  await page.goto('/about#graphics')
  await expect(
    page.locator('#graphics').getByRole('heading', { name: '3D and 2D modes' }),
  ).toBeVisible()
})

// the runtime watch: 3D starts through the dev override, then simulated frame rates drive it
test.describe('runtime performance watch', () => {
  const ready = (page, tier) =>
    page.waitForFunction(
      (name) => window.__hub?.state.ready === true && window.__hub.state.tier === name,
      tier,
      slow,
    )
  const simulate = (page, fps) => page.evaluate((n) => window.__hub.debug.simulateFps(n), fps)

  test.beforeEach(async ({ page, isMobile }) => {
    // a touch phone starts on the compact tier, so the step-down chain is checked on desktop
    test.skip(isMobile, 'desktop tier chain')
    await page.addInitScript(() => localStorage.setItem('sharlock.hubForce3d', '1'))
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('steps down to 2D, remembers it and asks before trying 3D again', async ({ page }) => {
    await page.goto('/')
    await ready(page, 'desktop')
    await simulate(page, 15)
    await ready(page, 'compact')
    expect(JSON.parse(await stored(page, 'sharlock.hubPerf'))).toMatchObject({
      tier: 'compact',
      struggled: true,
    })
    await simulate(page, 15)
    await ready(page, 'low')
    await simulate(page, 10)
    await expect(page.getByRole('region', { name: 'Interactive town map' })).toBeVisible()
    await expect(page.getByTestId('town-mode-notice')).toContainText('3D ran too slowly here')
    expect(await stored(page, 'sharlock.townMode')).toBeNull()
    expect(JSON.parse(await stored(page, 'sharlock.hubPerf'))).toMatchObject({
      tier: 'low',
      twoD: true,
    })

    await page.reload()
    await expect(page.getByRole('region', { name: 'Interactive town map' })).toBeVisible()
    await expect(page.getByTestId('town-mode-notice')).toBeVisible()
    await page.getByTestId('town-mode-toggle').click()
    await expect(page.getByTestId('hub-3d-warning')).toBeVisible()
  })

  test('a remembered tier is the starting tier on Auto', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('sharlock.hubPerf'))
        localStorage.setItem(
          'sharlock.hubPerf',
          JSON.stringify({ tier: 'compact', struggled: true }),
        )
    })
    await page.goto('/')
    await ready(page, 'compact')
  })

  test('an explicit 3D choice stays on low and never switches to 2D', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '3d'))
    await page.goto('/')
    await ready(page, 'desktop')
    await simulate(page, 5)
    await ready(page, 'compact')
    await simulate(page, 5)
    await ready(page, 'low')
    await simulate(page, 5)
    await frames(page)
    await expect(page.locator('canvas.hub-canvas')).toHaveCount(1)
    expect(await page.evaluate(() => window.__hub.state.tier)).toBe('low')
    expect(JSON.parse(await stored(page, 'sharlock.hubPerf')).twoD).toBeUndefined()
  })

  test('a manual setting turns the watch off and Auto clears the memory', async ({ page }) => {
    await page.goto('/')
    await ready(page, 'desktop')
    await page.getByTestId('menu-button').click()
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByTestId('hub-graphics').selectOption('low')
    await ready(page, 'low')
    await simulate(page, 1)
    await frames(page)
    await expect(page.locator('canvas.hub-canvas')).toHaveCount(1)
    expect(await stored(page, 'sharlock.hubPerf')).toBeNull()

    await page.evaluate(() =>
      localStorage.setItem('sharlock.hubPerf', '{"tier":"low","struggled":true}'),
    )
    await page.getByTestId('hub-graphics').selectOption('auto')
    await page.waitForFunction(
      () => window.__hub?.state.ready === true && window.__hub.state.tier !== 'low',
      null,
      slow,
    )
    expect(await stored(page, 'sharlock.hubPerf')).toBeNull()
  })
})
