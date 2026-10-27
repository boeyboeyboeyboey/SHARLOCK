import { test, expect } from '@playwright/test'
import { readVerificationCode } from './fixtures/mail.js'

const PASSWORD = 'Correct-Horse-🔒-2026'

test.skip(
  !process.env.SHARLOCK_TEST_REPLICA_SET,
  'The account journey includes transactional onboarding; run with --replica-set.',
)

// bootstrap marks the drawer as a dialog before its slide-in ends, so wait for the settled show state
async function signOutFromDetectiveDesk(page) {
  const detectiveDesk = page.getByRole('dialog', { name: 'Your detective desk' })
  await expect(detectiveDesk).toBeVisible()
  await expect(detectiveDesk).toHaveClass(/(^|\s)show(\s|$)/)
  await expect(detectiveDesk).not.toHaveClass(/(^|\s)showing(\s|$)/)
  await detectiveDesk.getByRole('button', { name: 'Sign out' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('registers, restores, signs out, signs in, and stops a protected action after expiry', async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}`
  const email = `auth-${suffix}@example.test`
  const username = `Case_${suffix}`
  let registrationPosts = 0
  let registrationKeys = null
  let protectedRunPosts = 0

  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/auth/register')) {
      registrationPosts += 1
      registrationKeys = Object.keys(request.postDataJSON() || {}).sort()
    }
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/api/games/cli-cyber-defender/runs')
    ) {
      protectedRunPosts += 1
    }
  })

  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/games/threat-briefing')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()
  await page.goto('/games/phishing-post-mortem')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()

  await page.goto('/profile')
  await expect(
    page.getByRole('heading', { name: 'A curious mind looks good on you.' }),
  ).toBeVisible()
  const signedOutProfile = page.getByRole('region', { name: 'Sign in' })
  await expect(signedOutProfile.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.goto('/progress')
  const signedOutProgress = page.getByRole('region', { name: 'Sign in' })
  await expect(signedOutProgress.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/register')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill('Different-Horse-🔒-2026')
  await page.locator('input[name="avatarId"][value="detective"]').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Passwords must match.')).toBeVisible()
  expect(registrationPosts).toBe(0)

  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // the account only signs in once the emailed code is confirmed
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const confirm = page.getByRole('button', { name: 'Confirm code' })
  await expect(confirm).toBeDisabled()
  const code = await readVerificationCode(email)
  const wrongCode = code === '000000' ? '000001' : '000000'
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(wrongCode)
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('alert')).toContainText('That code is not right')
  await expect(page.getByLabel('Digit 1 of 6')).toHaveValue('')
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(code)
  await confirm.click()
  await expect(page).toHaveURL('/join-class?onboarding=1')
  await page.getByRole('button', { name: 'Skip and explore Sharlock' }).click()
  await expect(page).toHaveURL('/')
  const townPlayer = page.locator('.town-player')
  await expect(townPlayer.getByText(username, { exact: true })).toBeVisible()
  await expect(townPlayer.getByRole('img', { name: 'Detective' })).toBeVisible()
  expect(registrationPosts).toBe(1)
  expect(registrationKeys).toEqual(['avatarId', 'email', 'password', 'username'])

  await page.reload()
  const restoredTownPlayer = page.locator('.town-player')
  await expect(restoredTownPlayer.getByText(username, { exact: true })).toBeVisible()
  await expect(restoredTownPlayer.getByRole('img', { name: 'Detective' })).toBeVisible()

  await page.goto('/games/threat-briefing')
  await expect(page.getByRole('dialog', { name: 'The Sharlock Times' })).toBeVisible()
  await page.goto('/games/phishing-post-mortem')
  await expect(
    page.getByRole('heading', { name: 'The Phishing Post-Mortem', exact: true }),
  ).toBeVisible()
  const phishGuide = page.getByRole('dialog', { name: 'How to play: The Phishing Post-Mortem' })
  await expect(phishGuide).toBeVisible()
  await phishGuide.getByRole('button', { name: 'Start playing' }).click()
  await expect(phishGuide).toBeHidden()

  // /profile hides the account box in the mobile menu, so sign out from a page that shows it
  await page.goto('/progress')
  const header = page.getByRole('banner')
  const desktopSignOut = header.getByRole('button', { name: 'Sign out' })
  // the header fills in once the session is restored; wait for either route before choosing one
  await expect
    .poll(
      async () =>
        (await desktopSignOut.isVisible()) ||
        (await page.getByRole('button', { name: 'Open navigation and profile' }).isVisible()),
    )
    .toBe(true)
  if (await desktopSignOut.isVisible()) {
    await desktopSignOut.click()
  } else {
    await page.getByRole('button', { name: 'Open navigation and profile' }).click()
    await signOutFromDetectiveDesk(page)
  }
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()

  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/games/cli-cyber-defender')
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/login')
  await page.getByLabel('Email or username').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Wrong-Horse-🔒-2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Email, username or password is incorrect.')
  await expect(page.getByLabel('Email or username')).toHaveValue(email)

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('.town-player').getByText(username, { exact: true })).toBeVisible()

  await page.goto('/games/cli-cyber-defender')
  await expect(page.getByRole('heading', { name: 'CLI Cyber Defender', exact: true })).toBeVisible()
  // a fresh account sees the guide on its first visit
  const guide = page.getByRole('dialog', { name: 'How to play: CLI Cyber Defender' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Start playing' }).click()
  await expect(guide).toBeHidden()
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' },
      }),
    }),
  )
  await page.getByRole('button', { name: 'Start the run' }).click()
  await page.getByRole('button', { name: /Practice \(no timer\)/ }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()
  expect(protectedRunPosts).toBe(0)
})

test('signing out with a lapsed session cookie still lands on the sign-in page', async ({
  page,
  context,
}, testInfo) => {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}x`
  const email = `auth-${suffix}@example.test`

  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.goto('/register')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Username').fill(`Case_${suffix}`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.locator('input[name="avatarId"][value="mint"]').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(await readVerificationCode(email))
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page).toHaveURL('/join-class?onboarding=1')
  await page.getByRole('button', { name: 'Skip and explore Sharlock' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/progress')
  await context.clearCookies({ name: 'sharlock.sid' })

  const desktopSignOut = page.getByRole('banner').getByRole('button', { name: 'Sign out' })
  await expect
    .poll(
      async () =>
        (await desktopSignOut.isVisible()) ||
        (await page.getByRole('button', { name: 'Open navigation and profile' }).isVisible()),
    )
    .toBe(true)
  if (await desktopSignOut.isVisible()) {
    await desktopSignOut.click()
  } else {
    await page.getByRole('button', { name: 'Open navigation and profile' }).click()
    await signOutFromDetectiveDesk(page)
  }
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()
  await expect(page.getByText('Your security check expired')).toHaveCount(0)
})

test('signs in with a mixed-case username instead of the email', async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}u`
  const email = `auth-${suffix}@example.test`
  const username = `Case_${suffix}`

  await page.goto('/register')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.locator('input[name="avatarId"][value="mint"]').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(await readVerificationCode(email))
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page).toHaveURL('/join-class?onboarding=1')
  await page.getByRole('button', { name: 'Skip and explore Sharlock' }).click()
  await expect(page).toHaveURL('/')

  const freshContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  })
  try {
    const loginPage = await freshContext.newPage()
    await loginPage.goto('/login')
    await loginPage.getByLabel('Email or username').fill(username.toUpperCase())
    await loginPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await loginPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(loginPage).toHaveURL('/')
    await expect(
      loginPage.locator('.town-player').getByText(username, { exact: true }),
    ).toBeVisible()
  } finally {
    await freshContext.close()
  }
})
