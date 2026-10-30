import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { seedClass, signedInPage } from './fixtures/class.js'

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

// the e2e server has no model keys, so the whole shift is scripted and nothing is stubbed
async function playShift(page) {
  const decisions = page.getByRole('region', { name: 'Decision' })
  for (let call = 1; call <= 4; call += 1) {
    await expect(page.getByTestId('soc-call-number')).toHaveText(`Call ${call}/4`)
    if (call === 1) {
      await page.getByLabel('Your reply').fill('Who is asking, and why do you need the code?')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(page.getByText('Scripted').first()).toBeVisible()
    }
    await page.getByRole('button', { name: /Directory/ }).click()
    await expect(page.getByRole('list').getByText(/Directory/)).toBeVisible()
    await decisions.getByRole('button', { name: /Call back/ }).click()
    await expect(page.getByRole('heading', { name: 'Tells' })).toBeVisible()
    await page.getByRole('button', { name: call < 4 ? 'Next call' : 'Result' }).click()
  }
}

test('a personal student plays a full scripted shift', async ({ page }) => {
  await page.goto('/games/social-engineering-simulator')
  await page.getByLabel('Save this shift to').selectOption('personal')
  await page.getByRole('button', { name: 'Start the shift' }).click()
  await playShift(page)
  await expect(page.getByRole('heading', { name: /^\d+ \/ 430$/ })).toBeVisible()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
})

test('a class student saves a shift and appears on the class leaderboard', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.goto('/games/social-engineering-simulator')
    await page.getByLabel('Save this shift to').selectOption(seeded.classId)
    await page.getByRole('button', { name: 'Start the shift' }).click()
    await playShift(page)
    await expect(page.getByRole('heading', { name: /^\d+ \/ 430$/ })).toBeVisible()
    await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()

    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { level: 2, name: /Social Engineering/ })).toBeVisible()
    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
  } finally {
    await context.close()
  }
})
