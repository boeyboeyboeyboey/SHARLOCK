import { test, expect } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'

test('a student reaches the lobby, readies up and the countdown starts with bots filling', async ({
  browser,
  baseURL,
}) => {
  const suffix = `tg${Date.now().toString(36)}`
  const { studentA } = await seedClass(suffix)
  const { context, page } = await signedInPage(browser, baseURL, studentA)
  try {
    await page.goto('/games/botnet-tag')
    const lobby = page.getByTestId('tag-lobby')
    await expect(lobby).toBeVisible()
    await expect(lobby.getByTestId('tag-class')).toHaveText(`Tower Class ${suffix}`)
    await expect(lobby.getByTestId('tag-player')).toHaveCount(1)
    await expect(lobby.getByTestId('tag-player').first()).toContainText(studentA.username)
    await expect(page.getByTestId('tag-arena')).toBeAttached()

    await lobby.getByRole('button', { name: 'Ready', exact: true }).click()
    await expect(lobby.getByRole('button', { name: '✓ Ready' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(lobby.getByTestId('tag-player')).toHaveCount(3)
    await expect(lobby.getByText('Bot', { exact: true })).toHaveCount(2)
    await expect(page.getByTestId('tag-countdown')).toContainText(/\d/)

    // the round starts after the countdown and the 3d yard draws the players
    await expect(page.getByTestId('tag-timer')).toBeVisible({ timeout: 40000 })
    await expect
      .poll(() => page.evaluate(() => window.__tag?.debug.players().length ?? 0), {
        timeout: 20000,
      })
      .toBeGreaterThanOrEqual(3)
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__tag.debug.you())), { timeout: 20000 })
      .toBe(true)

    // one in three humans starts infected and cannot use stations: check that branch instead
    const mine = await page.evaluate(() => window.__tag.debug.players().find((p) => p.me))
    if (mine.infected) {
      await expect(page.getByTestId('tag-status')).toHaveText('Infected')
      await expect(page.getByTestId('tag-use')).toHaveCount(0)
      return
    }

    // walk to the nearest station with the normal movement rules, then use it
    await page.evaluate(() => {
      const spots = [
        [-18, -12],
        [0, -12],
        [18, -12],
        [-18, 12],
        [0, 12],
        [18, 12],
      ]
      const you = window.__tag.debug.you()
      const [x, z] = spots.sort(
        (a, b) => Math.hypot(a[0] - you.x, a[1] - you.z) - Math.hypot(b[0] - you.x, b[1] - you.z),
      )[0]
      window.__tag.debug.walkTo(x, z)
    })
    const use = page.getByTestId('tag-use')
    await expect(use).toBeVisible({ timeout: 20000 })
    await expect(use).toContainText('Use')
    await use.click()
    await expect(page.getByTestId('puzzle-panel')).toBeVisible()
  } finally {
    await context.close()
  }
})
