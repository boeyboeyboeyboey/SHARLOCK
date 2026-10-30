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
  } finally {
    await context.close()
  }
})
