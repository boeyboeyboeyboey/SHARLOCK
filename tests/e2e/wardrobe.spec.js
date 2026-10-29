import { test, expect } from './fixtures/auth.js'
import { playSqlRun } from './fixtures/sql.js'

test.setTimeout(300_000)
const slow = { timeout: 120_000 }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.townMode', '2d')
    localStorage.setItem('sharlock.loreIntroSeen', '1')
  })
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('earn a scarf, equip it, keep it after reload and see it on Sharlock', async ({ page }) => {
  await page.goto('/profile')
  const wardrobe = page.getByTestId('wardrobe')
  await expect(wardrobe.getByRole('heading', { name: 'Wardrobe' })).toBeVisible()
  await expect(wardrobe.getByRole('radio', { name: /Red scarf/ })).toBeChecked()
  await expect(wardrobe.getByRole('radio', { name: /Deerstalker/ })).toBeChecked()

  // a locked item cannot be selected and says how to earn it
  const navy = wardrobe.getByRole('radio', { name: /Navy scarf/ })
  await expect(navy).toBeDisabled()
  await expect(wardrobe.getByText('Locked: earn Customs cleared')).toBeVisible()
  await expect(navy).not.toBeChecked()

  await playSqlRun(page, 'personal')

  await page.goto('/profile')
  await expect(navy).toBeEnabled()
  await navy.check()
  await expect(wardrobe.getByRole('status').filter({ hasText: 'equipped' })).toBeVisible()

  await page.reload()
  await expect(
    page.getByTestId('wardrobe').getByRole('radio', { name: /Navy scarf/ }),
  ).toBeChecked()

  // the hub reads the saved choice through the signed-in user
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.townMode', '3d')
    localStorage.setItem('sharlock.hubForce3d', '1')
    localStorage.setItem('sharlock.hubWatchManual', '1')
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__hub?.state.ready === true, null, slow)
  const look = await page.evaluate(() => window.__hub.debug.sharlockLook())
  expect(look.scarfColor).toEqual([0.14, 0.2, 0.44])
  expect(look.hat).toBe('deerstalker')
})
