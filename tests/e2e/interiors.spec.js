import { test, expect } from './fixtures/auth.js'

// the software renderer builds scenes slowly
test.setTimeout(240000)
const slow = { timeout: 120000 }

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test.describe('3d interior', () => {
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

  test('the CLI game opens inside its Telegraph Office room and the room is disposed on leave', async ({
    page,
  }) => {
    await page.goto('/games/cli-cyber-defender')
    await expect(page.getByTestId('interior-canvas')).toBeVisible(slow)
    await page.waitForFunction(() => window.__interior?.state.ready === true, null, slow)
    await expect(
      page.getByTestId('interior-desk').getByRole('heading', { name: /CLI Cyber Defender/i }),
    ).toBeVisible()
    // only one engine: the hub is not mounted behind a game
    expect(await page.evaluate(() => window.__hub?.state?.ready ?? false)).toBe(false)
    const draws = await page.evaluate(() => window.__interior.state.activeMeshes)
    expect(draws).toBeGreaterThan(0)
    expect(draws).toBeLessThanOrEqual(150)

    await page.getByRole('link', { name: /back to town/i }).click()
    await page.waitForFunction(() => window.__interior?.disposals >= 1, null, slow)
  })
})

const rooms = [
  ['phishing-post-mortem', /phishing/i],
  ['sql-injection-arcade', /sql/i],
  ['social-engineering-simulator', /social/i],
  ['clearance-tower', /clearance/i],
]
test.describe('3d interiors for the other four games', () => {
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
    test(`${id} mounts its own room within the draw budget`, async ({ page }) => {
      await page.goto(`/games/${id}`)
      await expect(page.getByTestId('interior-canvas')).toBeVisible(slow)
      await page.waitForFunction(
        (room) => window.__interior?.state.ready === true && window.__interior.state.room === room,
        id,
        slow,
      )
      await expect(
        page.getByTestId('interior-desk').getByRole('heading', { name: title }).first(),
      ).toBeVisible()
      const meshes = await page.evaluate(() => window.__interior.state.activeMeshes)
      expect(meshes).toBeGreaterThan(5)
      expect(meshes).toBeLessThanOrEqual(150)
    })
  }
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
