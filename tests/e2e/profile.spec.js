import { randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { createAuthService } from '../../server/src/modules/auth/service.js'
import { parseRegistrationInput } from '../../server/src/modules/auth/policy.js'

// each test gets its own student so edits never leak between tests
async function createStudent(label) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Profile E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const suffix = randomBytes(4).toString('hex')
  const identity = {
    email: `profile-${label}-${suffix}@example.test`,
    username: `prof-${label}-${suffix}`,
    password: `${randomBytes(24).toString('base64url')}A!`,
  }
  const database = await connectDatabase(testUri)
  try {
    await createAuthService(database).register(
      parseRegistrationInput({ ...identity, avatarId: 'mint' }),
    )
  } finally {
    await database.close()
  }
  return identity
}

async function signedInPage(browser, baseURL, identity) {
  const origin = new URL(baseURL).origin
  const context = await browser.newContext()
  const csrf = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  const { csrfToken } = await csrf.json()
  const login = await context.request.post(new URL('/api/auth/login', baseURL).href, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { email: identity.email, password: identity.password },
  })
  if (!login.ok()) throw new Error('Could not authenticate the profile E2E session.')
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  return { context, page }
}

test('a student changes username and avatar and the change persists', async ({
  browser,
  baseURL,
}, testInfo) => {
  const student = await createStudent('save')
  const newName = `${student.username}-new`
  const { context, page } = await signedInPage(browser, baseURL, student)
  try {
    await page.goto('/profile')
    const overview = page.getByRole('region', { name: 'Your profile' })
    await expect(overview.getByRole('heading', { name: student.username })).toBeVisible()
    await expect(overview.getByRole('img', { name: 'Mint Scarf' })).toBeVisible()

    await page.getByRole('button', { name: 'Edit profile' }).click()
    const form = page.getByRole('form', { name: 'Edit profile' })
    await form.getByLabel('Username').fill(newName)
    await form.getByLabel('Blue Cap').check()
    await form.getByRole('button', { name: 'Save changes' }).click()

    await expect(overview.getByRole('heading', { name: newName })).toBeVisible()
    await expect(overview.getByRole('img', { name: 'Blue Cap' })).toBeVisible()
    await expect(form).toHaveCount(0)

    await page.reload()
    await expect(overview.getByRole('heading', { name: newName })).toBeVisible()
    await expect(overview.getByRole('img', { name: 'Blue Cap' })).toBeVisible()

    // the compact mobile shell hides the account link by design
    if (!testInfo.project.use.isMobile) {
      const accountLink = page.getByRole('link', { name: `Your profile: ${newName}` })
      await expect(accountLink).toBeVisible()
      await expect(accountLink.getByRole('img', { name: 'Blue Cap' })).toBeVisible()
    }
  } finally {
    await context.close()
  }
})

test('a taken username shows an error and saves nothing', async ({ browser, baseURL }) => {
  const other = await createStudent('other')
  const student = await createStudent('taken')
  const { context, page } = await signedInPage(browser, baseURL, student)
  try {
    await page.goto('/profile')
    const overview = page.getByRole('region', { name: 'Your profile' })
    await page.getByRole('button', { name: 'Edit profile' }).click()
    const form = page.getByRole('form', { name: 'Edit profile' })
    await form.getByLabel('Username').fill(other.username)
    await form.getByLabel('Blue Cap').check()
    await form.getByRole('button', { name: 'Save changes' }).click()

    await expect(
      form.getByText('That username is already in use. Choose another one.'),
    ).toBeVisible()
    await expect(overview.getByRole('heading', { name: student.username })).toBeVisible()

    await page.reload()
    await expect(overview.getByRole('heading', { name: student.username })).toBeVisible()
    await expect(overview.getByRole('img', { name: 'Mint Scarf' })).toBeVisible()
  } finally {
    await context.close()
  }
})
