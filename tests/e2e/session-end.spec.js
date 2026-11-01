import { randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { createAuthService } from '../../server/src/modules/auth/service.js'
import { parseRegistrationInput } from '../../server/src/modules/auth/policy.js'
import { userModel } from '../../server/src/models/User.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../server/src/modules/profile/how-to-play.js'
import { readVerificationCode } from './fixtures/mail.js'
import { signInContext } from './fixtures/sign-in.js'
import { forceTown2d, newTown2dContext } from './fixtures/town.js'

const PASSWORD = 'Correct-Horse-🔒-2026'

async function createStudent() {
  const testUri = process.env.TEST_MONGODB_URI
  assertSafeTestDatabaseUri(testUri)
  const database = await connectDatabase(testUri)
  const suffix = randomBytes(6).toString('hex')
  const identity = {
    email: `e2e-session-${suffix}@example.test`,
    username: `session-${suffix}`,
    password: `${randomBytes(24).toString('base64url')}A!`,
  }
  try {
    await createAuthService(database).register(
      parseRegistrationInput({ ...identity, avatarId: 'mint' }),
    )
    await userModel(database).updateOne(
      { emailNormalized: identity.email },
      { $set: { howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS] } },
    )
  } finally {
    await database.close()
  }
  return identity
}

test.describe('a tab whose session was replaced by a newer sign-in', () => {
  async function replacedTab(browser, baseURL) {
    const identity = await createStudent()
    const context = await newTown2dContext(browser)
    await signInContext(context, baseURL, identity)
    const page = await context.newPage()
    const elsewhere = await browser.newContext()
    return { page, identity, context, elsewhere }
  }

  const replace = ({ elsewhere, identity }, baseURL) => signInContext(elsewhere, baseURL, identity)

  test('is told why when an action on the page fails', async ({ browser, baseURL }) => {
    const tab = await replacedTab(browser, baseURL)
    try {
      await tab.page.goto('/classes')
      await tab.page.getByLabel('Class invitation code').fill('ABCD-EFGH-JKLM-NPQR')
      await replace(tab, baseURL)
      await tab.page.getByRole('button', { name: 'Join class' }).click()

      await expect(tab.page).toHaveURL(/\/login\?reason=elsewhere$/)
      await expect(
        tab.page
          .getByRole('status')
          .filter({ hasText: 'signed in somewhere else' })
          .filter({ hasText: 'instructor or school administrator' }),
      ).toBeVisible()
    } finally {
      await tab.context.close()
      await tab.elsewhere.close()
    }
  })

  test('is told why when the person comes back to it', async ({ browser, baseURL }) => {
    const tab = await replacedTab(browser, baseURL)
    try {
      await tab.page.goto('/')
      await expect(tab.page.getByTestId('menu-button')).toBeVisible()
      await replace(tab, baseURL)
      await tab.page.evaluate(() => window.dispatchEvent(new Event('focus')))

      await expect(tab.page).toHaveURL(/\/login\?reason=elsewhere$/)
      await expect(
        tab.page.getByRole('status').filter({ hasText: 'signed in somewhere else' }),
      ).toBeVisible()
    } finally {
      await tab.context.close()
      await tab.elsewhere.close()
    }
  })

  test('keeps the profile open and shows the reason', async ({ browser, baseURL }) => {
    const tab = await replacedTab(browser, baseURL)
    try {
      await tab.page.goto('/profile')
      await expect(tab.page.getByRole('button', { name: 'Edit profile' })).toBeVisible()
      await replace(tab, baseURL)
      await tab.page.evaluate(() => window.dispatchEvent(new Event('focus')))

      await expect(
        tab.page.getByRole('heading', { name: 'Sign in to see your profile.' }),
      ).toBeVisible()
      await expect(tab.page.getByText('signed in somewhere else')).toBeVisible()
      await expect(tab.page).toHaveURL(/\/profile$/)
    } finally {
      await tab.context.close()
      await tab.elsewhere.close()
    }
  })

  test('can sign straight back in, which ends the other session', async ({ browser, baseURL }) => {
    const tab = await replacedTab(browser, baseURL)
    try {
      await tab.page.goto('/')
      await expect(tab.page.getByTestId('menu-button')).toBeVisible()
      await replace(tab, baseURL)
      await tab.page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(tab.page).toHaveURL(/\/login\?reason=elsewhere$/)

      await tab.page.getByLabel('Email or username').fill(tab.identity.email)
      await tab.page.getByLabel('Password', { exact: true }).fill(tab.identity.password)
      await tab.page.getByRole('button', { name: 'Sign in' }).click()
      await expect(tab.page).not.toHaveURL(/\/login/)

      const other = await tab.elsewhere.request.get(`${baseURL}/api/auth/session`)
      expect(await other.json()).toEqual({ user: null, sessionEnded: 'replaced' })
    } finally {
      await tab.context.close()
      await tab.elsewhere.close()
    }
  })
})

test('a signed-out visit logs no 401 on public pages and does not loop', async ({ page }) => {
  const unauthorized = []
  page.on('response', (response) => {
    if (response.status() === 401) unauthorized.push(new URL(response.url()).pathname)
  })
  await forceTown2d(page)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?reason=required$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()
  await expect(page.getByText('game-based way to learn cybersecurity')).toBeVisible()
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create a student account' })).toBeVisible()
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'Meet your curious companion.' })).toBeVisible()
  expect(unauthorized).toEqual([])
})

test('a refresh during sign-up returns to the code screen, and cancelling sticks', async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}r`
  const email = `session-${suffix}@example.test`
  await page.goto('/register')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Username').fill(`Case_${suffix}`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await readVerificationCode(email)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByRole('heading', { name: 'Create a student account' })).toBeVisible()
  await expect
    .poll(async () => (await page.request.get('/api/auth/session')).json())
    .toEqual({ user: null })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Create a student account' })).toBeVisible()
})

test('re-registering a live sign-up names the way out', async ({ browser }, testInfo) => {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}d`
  const email = `session-${suffix}@example.test`
  const fill = async (page, username) => {
    await page.goto('/register')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
  }
  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    const firstPage = await first.newPage()
    await fill(firstPage, `Case_${suffix}`)
    await expect(firstPage.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    const secondPage = await second.newPage()
    await fill(secondPage, `Other_${suffix}`)
    await expect(secondPage.getByRole('alert')).toContainText('sign in to continue')
  } finally {
    await first.close()
    await second.close()
  }
})

test('a mistyped class code gets one clear message and an invalid field', async ({
  browser,
  baseURL,
}) => {
  test.skip(process.env.SHARLOCK_TEST_REPLICA_SET !== '1', 'Joining a class is transactional.')
  const identity = await createStudent()
  const context = await newTown2dContext(browser)
  await signInContext(context, baseURL, identity)
  try {
    const page = await context.newPage()
    await page.goto('/classes')
    const field = page.getByLabel('Class invitation code')
    await field.fill('ZZZZ-ZZZZ-ZZZZ-ZZZZ')
    await page.getByRole('button', { name: 'Join class' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'class code' })
    await expect(alert).toHaveCount(1)
    await expect(alert).toHaveText(
      "That class code isn't valid or has expired. Check it with your instructor.",
    )
    await expect(field).toHaveAttribute('aria-invalid', 'true')
  } finally {
    await context.close()
  }
})

test.describe('sign-up and sign-in cards at laptop sizes', () => {
  for (const viewport of [
    { width: 992, height: 768 },
    { width: 1200, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`the page scrolls to the submit button at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/register')
      const card = page.locator('.auth-card')
      await expect(card).toBeVisible()
      expect(await card.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible')
      expect(await card.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      )

      const submit = page.getByRole('button', { name: 'Create account' })
      await submit.click()
      await expect(page.getByRole('alert')).toBeVisible()
      await submit.scrollIntoViewIfNeeded()
      await expect(submit).toBeInViewport()
    })
  }
})
