import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('loads Vue and checks Express/MongoDB through the Vite proxy', async ({ page }) => {
  await page.goto('/about')
  await expect(
    page.getByRole('heading', { name: 'Meet your curious companion.', exact: true }),
  ).toBeVisible()
  const health = await page.evaluate(async () => {
    const response = await fetch('/api/health')
    return { status: response.status, body: await response.json() }
  })
  expect(health).toEqual({ status: 200, body: { status: 'ok', database: 'connected' } })
  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(fitsViewport).toBe(true)
})

test('recovers from a failed API request using retry', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.abort())
  await page.goto('/about')
  const overlay = page.getByRole('dialog')
  const retry = overlay.getByRole('button', { name: 'Try again', exact: true })
  await expect(overlay.getByRole('alert')).toBeVisible()
  await page.unroute('**/api/auth/me')
  await retry.click()
  await expect(retry).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Meet your curious companion.', exact: true }),
  ).toBeVisible()
})
