import { test, expect } from './fixtures/auth.js'

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

// int-03: game routes always show the pre-rendered still
const rooms = [
  ['cli-cyber-defender', /CLI Cyber Defender/i],
  ['phishing-post-mortem', /phishing/i],
  ['sql-injection-arcade', /sql/i],
  ['social-engineering-simulator', /LLM Social Engineering Simulator/i],
  ['clearance-tower', /clearance/i],
]
test.describe('game rooms', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('sharlock.musicMuted', '1')
    })
  })

  for (const [id, title] of rooms) {
    test(`${id} shows its still and never loads the live room`, async ({ page }) => {
      const babylon = []
      page.on('request', (req) => {
        if (/babylon/i.test(req.url())) babylon.push(req.url())
      })
      await page.goto(`/games/${id}`)
      await expect(
        page.getByTestId('interior-desk').getByRole('heading', { name: title }).first(),
      ).toBeVisible()
      await expect
        .poll(() =>
          page
            .getByTestId('interior-still')
            .evaluate((img) => img.complete && img.naturalWidth > 0)
            .catch(() => false),
        )
        .toBe(true)
      expect(babylon).toEqual([])
    })
  }

  test('no view switch on a game page while the still shows', async ({ page }) => {
    await page.goto('/games/cli-cyber-defender')
    await expect(page.getByTestId('interior-still')).toBeAttached()
    await expect(page.getByRole('group', { name: 'View mode' })).toHaveCount(0)
  })
})

test.describe('2d mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  })

  test('shows the still or its gradient instead of a canvas, and the game still loads', async ({
    page,
  }) => {
    await page.goto('/games/cli-cyber-defender')
    await expect(
      page.getByTestId('interior-desk').getByRole('heading', { name: /CLI Cyber Defender/i }),
    ).toBeVisible()
    await expect(page.getByTestId('interior-fallback')).toBeAttached()
    // the rendered still loads rather than falling back to the gradient alone
    await expect
      .poll(() =>
        page
          .getByTestId('interior-still')
          .evaluate((img) => img.complete && img.naturalWidth > 0)
          .catch(() => false),
      )
      .toBe(true)
  })
})

test.describe('short landscape windows', () => {
  test('the room shrinks to the control bar and the desk starts right under it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 })
    await page.goto('/games/sql-injection-arcade')
    const desk = page.getByTestId('interior-desk')
    const heading = desk.getByRole('heading').first()
    await expect(heading).toBeVisible()
    expect((await desk.boundingBox()).y).toBe(64)
    expect(await desk.evaluate((node) => getComputedStyle(node).paddingTop)).toBe('8px')
  })
})

test.describe('leaving a game through the menu', () => {
  test('the drawer fills the window whatever the page', async ({ page }) => {
    await page.goto('/games/cli-cyber-defender')
    await expect(
      page.getByTestId('interior-desk').getByRole('heading', { name: /CLI Cyber Defender/i }),
    ).toBeVisible()
    await page.getByTestId('menu-button').click()
    const menu = page.getByTestId('site-menu')
    await expect(menu).toBeVisible()
    await expect.poll(async () => (await menu.boundingBox())?.x).toBe(0)
    const box = await menu.boundingBox()
    expect(Math.round(box.height)).toBe(page.viewportSize().height)
  })
})
