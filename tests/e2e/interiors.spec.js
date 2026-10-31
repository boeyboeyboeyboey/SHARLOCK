import { test, expect } from './fixtures/auth.js'

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

// INT-03: game routes always show the pre-rendered still, even with the 3d town preferred
const rooms = [
  ['cli-cyber-defender', /CLI Cyber Defender/i],
  ['phishing-post-mortem', /phishing/i],
  ['sql-injection-arcade', /sql/i],
  ['social-engineering-simulator', /help desk/i],
  ['clearance-tower', /clearance/i],
]
test.describe('3d preferred', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sharlock.hubForce3d', '1')
      localStorage.setItem('sharlock.townMode', '3d')
      localStorage.setItem('sharlock.hubWatchManual', '1')
      localStorage.setItem('sharlock.loreIntroSeen', '1')
      localStorage.setItem('sharlock.controlsHintSeen', '3')
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
      await expect(page.getByTestId('interior')).toHaveAttribute('data-stage', 'still')
      await expect(page.getByTestId('interior-canvas')).toHaveCount(0)
      await expect
        .poll(() =>
          page
            .getByTestId('interior-still')
            .evaluate((img) => img.complete && img.naturalWidth > 0)
            .catch(() => false),
        )
        .toBe(true)
      expect(await page.evaluate(() => window.__interior ?? null)).toBeNull()
      expect(babylon).toEqual([])
    })
  }

  test('the 3d | 2d switch stays on the still', async ({ page }) => {
    await page.goto('/games/cli-cyber-defender')
    await expect(page.getByTestId('interior')).toHaveAttribute('data-stage', 'still')
    await page.getByRole('button', { name: '2D still' }).click()
    await expect(page.getByTestId('interior')).toHaveAttribute('data-stage', 'still')
    await page.getByRole('button', { name: '3D room' }).click()
    await expect(page.getByTestId('interior')).toHaveAttribute('data-stage', 'still')
    await expect(page.getByTestId('interior-canvas')).toHaveCount(0)
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
    await expect(page.getByTestId('interior-canvas')).toHaveCount(0)
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
    await expect(page.getByTestId('interior')).toHaveAttribute('data-stage', 'still')
  })
})
