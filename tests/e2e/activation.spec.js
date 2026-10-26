import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/admin.js'

const unavailable = 'This activation link is unavailable'

// the administrator issues the link through the real admin api, as the admin workspace does
async function issueActivationLink(request, origin, suffix) {
  const csrf = await request.get(`${origin}/api/auth/csrf`, { headers: { Origin: origin } })
  const { csrfToken } = await csrf.json()
  const instructor = {
    email: `act-${suffix}@example.test`,
    username: `act-${suffix}`,
    avatarId: 'mint',
  }
  const created = await request.post(`${origin}/api/admin/instructors`, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: instructor,
  })
  expect(created.status()).toBe(201)
  const { activationUrl } = await created.json()
  return { instructor, activationUrl }
}

async function anonymousPage(browser, testInfo) {
  const { viewport, isMobile, hasTouch } = testInfo.project.use
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport,
    isMobile,
    hasTouch,
  })
  return { context, page: await context.newPage() }
}

test('an instructor activates with the issued link, then the link is spent', async ({
  browser,
  page,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL).origin
  const suffix = randomBytes(5).toString('hex')
  const password = `Instructor-${randomBytes(12).toString('hex')}Aa!`
  const { instructor, activationUrl } = await issueActivationLink(
    page.context().request,
    origin,
    suffix,
  )
  const { context, page: guest } = await anonymousPage(browser, testInfo)
  try {
    await guest.goto(activationUrl)
    await expect(guest.getByRole('heading', { name: 'Activate your account' })).toBeVisible()
    await expect(guest).toHaveURL(`${origin}/activate-account`)

    await guest.getByLabel('New password').fill(password)
    await guest.getByLabel('Confirm password').fill(password)
    await guest.getByRole('button', { name: 'Set password and activate account' }).click()
    await expect(
      guest.getByText('Your password is set. Sign in normally to continue.'),
    ).toBeVisible()

    await guest.getByRole('link', { name: 'Continue to sign in' }).click()
    await guest.getByLabel('Email or username').fill(instructor.email)
    await guest.getByLabel('Password', { exact: true }).fill(password)
    await guest.getByRole('button', { name: 'Sign in' }).click()
    await expect(guest).toHaveURL(`${origin}/`)
  } finally {
    await context.close()
  }

  // a fresh anonymous visitor replays the spent link
  const replay = await anonymousPage(browser, testInfo)
  try {
    await replay.page.goto(activationUrl)
    await replay.page.getByLabel('New password').fill(password)
    await replay.page.getByLabel('Confirm password').fill(password)
    await replay.page.getByRole('button', { name: 'Set password and activate account' }).click()
    await expect(replay.page.getByRole('heading', { name: unavailable })).toBeVisible()
  } finally {
    await replay.context.close()
  }
})

test('an unknown activation link shows the generic unavailable message', async ({
  browser,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL).origin
  const { context, page } = await anonymousPage(browser, testInfo)
  try {
    const bogus = randomBytes(32).toString('base64url')
    await page.goto(`${origin}/activate-account#token=${bogus}`)
    const password = `Unknown-${randomBytes(12).toString('hex')}Aa!`
    await page.getByLabel('New password').fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Set password and activate account' }).click()
    await expect(page.getByRole('heading', { name: unavailable })).toBeVisible()
    await expect(page.getByText('Your password is set.')).toHaveCount(0)

    await page.goto(`${origin}/activate-account`)
    await expect(page.getByRole('heading', { name: unavailable })).toBeVisible()
  } finally {
    await context.close()
  }
})
