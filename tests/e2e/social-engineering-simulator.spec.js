import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { seedClass, signedInPage } from './fixtures/class.js'

const API = '**/api/games/social-engineering-simulator'

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

// the e2e server has no language model, so chat replies are canned; start, nudge and complete
// reach the real server
async function stubChatReplies(page) {
  await page.route(`${API}/message`, (route) =>
    route.fulfill({
      json: {
        reply: 'I understand. Can you at least confirm your employee ID?',
        turnsUsed: 1,
        turnBudget: 8,
        leaked: false,
        ended: false,
      },
    }),
  )
  await page.route(`${API}/verifier-message`, (route) =>
    route.fulfill({
      json: {
        reply: 'No, I did not page anyone.',
        verifierTurnsUsed: 1,
        verifierTurnBudget: 5,
        leaked: false,
        ended: false,
      },
    }),
  )
}

test('personal start shows the briefing (chat replies stubbed)', async ({ page }) => {
  await stubChatReplies(page)
  await page.goto('/games/social-engineering-simulator')
  await page.getByLabel('Save this call to').selectOption('personal')
  await page.getByRole('button', { name: 'Start the call' }).click()
  await expect(page.getByRole('button', { name: 'Begin the conversation' })).toBeVisible()
})

test('a class student saves a refusal and appears on the class leaderboard (chat replies stubbed)', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await stubChatReplies(page)
    await page.goto('/games/social-engineering-simulator')
    await page.getByLabel('Save this call to').selectOption(seeded.classId)
    await page.getByRole('button', { name: 'Start the call' }).click()
    await page.getByRole('button', { name: 'Begin the conversation' }).click()

    await page.getByLabel('Your reply').fill('Who is asking, and why do you need the code?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Can you at least confirm your employee ID?')).toBeVisible()

    await page.getByRole('button', { name: /Refuse and end/ }).click()
    await expect(page.getByRole('heading', { name: /^\d+ \/ 100$/ })).toBeVisible()
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
