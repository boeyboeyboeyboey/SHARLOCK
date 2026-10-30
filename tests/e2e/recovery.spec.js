import { randomBytes } from 'node:crypto'
import { expect, test } from './fixtures/admin.js'
import { readVerificationCode } from './fixtures/mail.js'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const identityCheckLabel = "I confirmed this student's identity through an off-app school channel."
const unavailableMessage =
  'This reset link is no longer available. Ask a staff member to prepare a new one.'
const widths = [375, 576, 768, 992, 1200, 1440]

function isolatedContextOptions(testInfo) {
  return {
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  }
}

function safeLinkMetadata(value, expectedOrigin) {
  let url
  try {
    url = new URL(value)
  } catch {
    return {
      originMatches: false,
      path: 'invalid',
      hasQuery: true,
      fragmentKeys: [],
      tokenShapeMatches: false,
    }
  }
  const fragment = new URLSearchParams(url.hash.slice(1))
  const token = fragment.get('token') || ''
  return {
    originMatches: url.origin === expectedOrigin,
    path: url.pathname,
    hasQuery: Boolean(url.search),
    fragmentKeys: [...fragment.keys()],
    tokenShapeMatches: /^[A-Za-z0-9_-]{43}$/.test(token),
  }
}

function linkToken(value) {
  try {
    return new URLSearchParams(new URL(value).hash.slice(1)).get('token') || ''
  } catch {
    return ''
  }
}

function watchSafePageRequests(page, events) {
  page.on('request', (request) => {
    const requestUrl = new URL(request.url())
    if (!requestUrl.pathname.startsWith('/api/')) return
    const pageUrl = new URL(page.url())
    events.push({
      path: requestUrl.pathname,
      method: request.method(),
      requestHasQuery: Boolean(requestUrl.search),
      requestHasFragment: Boolean(requestUrl.hash),
      pagePath: pageUrl.pathname,
      pageHasQuery: Boolean(pageUrl.search),
      pageHasFragment: Boolean(pageUrl.hash),
    })
  })
}

async function navigateToSensitiveUrl(page, value) {
  await page.evaluate((url) => window.location.assign(url), value)
}

async function createStudentThroughRegistration(page, identity) {
  await page.goto('/register')
  await page.getByLabel('Email address').fill(identity.email)
  await page.getByLabel('Username').fill(identity.username)
  await page.getByLabel('Password', { exact: true }).fill(identity.password)
  await page.getByLabel('Confirm password').fill(identity.password)
  await page.locator('input[name="avatarId"][value="mint"]').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(await readVerificationCode(identity.email))
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page).toHaveURL(/\/join-class\?onboarding=1$/)
  await page.getByRole('button', { name: 'Skip and explore Sharlock' }).click()
  await expect(page).toHaveURL('/')
  await expectSignedInAs(page, identity.username)
}

// the town has no profile tile; the site menu header names the signed-in user
async function expectSignedInAs(page, username) {
  await page.getByTestId('menu-button').click()
  await expect(page.getByTestId('site-menu').getByText(username, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('site-menu')).toBeHidden()
}

async function signInWithUi(page, identity) {
  await page.goto('/login')
  await page.getByLabel('Email or username').fill(identity.email)
  await page.getByLabel('Password', { exact: true }).fill(identity.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

async function selectAdminStudent(page, identity) {
  await page.getByLabel('Student email').fill(identity.email)
  await page.getByRole('button', { name: 'Find student' }).click()
  await page.getByRole('button', { name: 'Select student' }).click()
  await page.getByLabel(identityCheckLabel).check()
}

async function issueAdminLink(page, identity, expectedOrigin) {
  await selectAdminStudent(page, identity)
  await page.getByRole('button', { name: 'Prepare password reset link' }).click()
  const dialog = page.getByRole('dialog', { name: 'Deliver this reset link privately' })
  await expect(dialog).toBeVisible()
  const resetUrl = await dialog.locator('#recovery-link-value').inputValue()
  const metadata = safeLinkMetadata(resetUrl, expectedOrigin)
  expect(metadata).toEqual({
    originMatches: true,
    path: '/reset-password',
    hasQuery: false,
    fragmentKeys: ['token'],
    tokenShapeMatches: true,
  })
  return { resetUrl, metadata }
}

async function assertNoHorizontalOverflow(page, width, height, orientation) {
  await page.setViewportSize({ width, height })
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(
    Math.max(dimensions.document, dimensions.body) <= dimensions.viewport,
    `${orientation} viewport ${width}x${height} should not scroll horizontally`,
  ).toBe(true)
}

test('admin recovery revokes sessions and requires normal sign-in', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(90000)
  const baseURL = testInfo.project.use.baseURL
  expect(typeof baseURL).toBe('string')
  const origin = new URL(baseURL).origin
  const suffix = randomBytes(8).toString('hex')
  const student = {
    email: `recovery-${suffix}@example.test`,
    username: `recovery_${suffix}`,
    password: `Original-Recovery-${suffix}-Aa!`,
  }
  const newPassword = 'Recovery-New-Password-2026!'
  let oldSessionContext
  let gateContext
  let queryContext
  let replacedContext
  let reuseContext
  let loginContext

  try {
    oldSessionContext = await browser.newContext(isolatedContextOptions(testInfo))
    const registrationPage = await oldSessionContext.newPage()
    await createStudentThroughRegistration(registrationPage, student)

    gateContext = await browser.newContext(isolatedContextOptions(testInfo))
    const gatePage = await gateContext.newPage()
    await signInWithUi(gatePage, student)

    await page.goto('/admin?tab=accounts')
    await expect(page.getByRole('heading', { name: 'Student password recovery' })).toBeVisible()
    const firstLink = await issueAdminLink(page, student, origin)
    const prepareButton = page.getByRole('button', { name: 'Prepare password reset link' })
    const firstDialog = page.getByRole('dialog', { name: 'Deliver this reset link privately' })
    await expect
      .poll(() => firstDialog.evaluate((dialog) => dialog.contains(document.activeElement)))
      .toBe(true)
    for (const width of widths) {
      await assertNoHorizontalOverflow(page, width, 900, 'landscape')
    }
    await assertNoHorizontalOverflow(page, 812, 375, 'landscape')
    await page.setViewportSize(testInfo.project.use.viewport)
    await page.keyboard.press('Escape')
    await expect(firstDialog).toHaveCount(0)
    await expect(page.locator('#recovery-link-value')).toHaveCount(0)
    await expect(prepareButton).toBeFocused()

    const secondLink = await issueAdminLink(page, student, origin)
    await page.goto('/join-class')
    await expect(page.locator('main h1, h1').first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('#recovery-link-value')).toHaveCount(0)
    await assertNoHorizontalOverflow(page, 1440, 900, 'landscape')
    const pageBoundary = await page.evaluate(() => ({
      recoveryControls: document.querySelectorAll(
        '.recovery-page, .recovery-dialog, .recovery-reset-form, #reset-password',
      ).length,
      hasHorizontalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
        window.innerWidth,
    }))
    expect(pageBoundary).toEqual({ recoveryControls: 0, hasHorizontalOverflow: false })

    queryContext = await browser.newContext(isolatedContextOptions(testInfo))
    const queryPage = await queryContext.newPage()
    await queryPage.goto('/about')
    const queryEvents = []
    watchSafePageRequests(queryPage, queryEvents)
    const queryUrl = new URL('/reset-password', origin)
    queryUrl.searchParams.set('token', linkToken(secondLink.resetUrl))
    await navigateToSensitiveUrl(queryPage, queryUrl.href)
    await expect(queryPage.getByRole('alert')).toBeVisible()
    await expect(queryPage.locator('#reset-password')).toHaveCount(0)
    const queryLocation = await queryPage.evaluate(() => ({
      path: window.location.pathname,
      hasQuery: Boolean(window.location.search),
      hasFragment: Boolean(window.location.hash),
    }))
    expect(queryLocation).toEqual({
      path: '/reset-password',
      hasQuery: false,
      hasFragment: false,
    })
    expect(queryEvents.some((event) => event.path === '/api/auth/reset-password')).toBe(false)
    expect(
      queryEvents.every(
        (event) =>
          !event.pageHasQuery &&
          !event.pageHasFragment &&
          !event.requestHasQuery &&
          !event.requestHasFragment,
      ),
    ).toBe(true)

    replacedContext = await browser.newContext(isolatedContextOptions(testInfo))
    const replacedPage = await replacedContext.newPage()
    const replacedEvents = []
    const replacedResponses = []
    watchSafePageRequests(replacedPage, replacedEvents)
    replacedPage.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/auth/reset-password') {
        replacedResponses.push(response.status())
      }
    })
    await replacedPage.goto('/about')
    await navigateToSensitiveUrl(replacedPage, firstLink.resetUrl)
    await expect(replacedPage.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await replacedPage.locator('#reset-password').fill(newPassword)
    await replacedPage.locator('#reset-password-confirmation').fill(newPassword)
    await replacedPage.getByRole('button', { name: 'Set password' }).click()
    await expect(replacedPage.locator('#reset-password-error')).toHaveText(unavailableMessage)
    expect(replacedResponses).toEqual([400])
    expect(
      replacedEvents.every(
        (event) =>
          !event.pageHasQuery &&
          !event.pageHasFragment &&
          !event.requestHasQuery &&
          !event.requestHasFragment,
      ),
    ).toBe(true)

    const gateEvents = []
    const gateResponses = []
    watchSafePageRequests(gatePage, gateEvents)
    gatePage.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/auth/reset-password') {
        gateResponses.push(response.status())
      }
    })
    await gatePage.goto('/about')
    await expect(gatePage.locator('main h1, h1').first()).toBeVisible()
    gateEvents.length = 0
    const token = linkToken(secondLink.resetUrl)
    await navigateToSensitiveUrl(gatePage, secondLink.resetUrl)
    await expect(gatePage.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    const gateLocation = await gatePage.evaluate(() => ({
      path: window.location.pathname,
      hasQuery: Boolean(window.location.search),
      hasFragment: Boolean(window.location.hash),
    }))
    expect(gateLocation).toEqual({ path: '/reset-password', hasQuery: false, hasFragment: false })
    await expect(
      gatePage.getByRole('button', { name: 'Sign out before resetting password' }),
    ).toBeVisible()
    await expect(gatePage.locator('#reset-password')).toHaveCount(0)
    await expect(
      gatePage.getByRole('button', { name: 'Sign out before resetting password' }),
    ).toBeEnabled()
    const persistedToken = await gatePage.evaluate(
      (candidate) =>
        [window.localStorage, window.sessionStorage].some((storage) =>
          Array.from({ length: storage.length }, (_, index) => storage.key(index)).some((key) =>
            key ? storage.getItem(key)?.includes(candidate) : false,
          ),
        ),
      token,
    )
    expect(persistedToken).toBe(false)
    expect(gateEvents.length).toBeGreaterThan(0)
    expect(
      gateEvents.every(
        (event) =>
          !event.pageHasQuery &&
          !event.pageHasFragment &&
          !event.requestHasQuery &&
          !event.requestHasFragment,
      ),
    ).toBe(true)

    await gatePage.getByRole('button', { name: 'Sign out before resetting password' }).click()
    await expect(gatePage.locator('#reset-password')).toBeVisible()
    await gatePage.locator('#reset-password').fill(newPassword)
    await gatePage.locator('#reset-password-confirmation').fill(newPassword)
    await gatePage.getByRole('button', { name: 'Set password' }).click()
    await expect(gatePage).toHaveURL(/\/login\?passwordReset=1$/)
    await expect(
      gatePage.getByText('Your password was updated. Sign in with your new password.'),
    ).toBeVisible()
    await expect(gatePage.getByLabel('Email or username')).toBeVisible()
    expect(gateResponses).toEqual([204])
    const redemptionRequests = gateEvents.filter(
      (event) => event.path === '/api/auth/reset-password',
    )
    expect(redemptionRequests).toHaveLength(1)
    expect(
      redemptionRequests.every(
        (event) =>
          !event.pageHasQuery &&
          !event.pageHasFragment &&
          !event.requestHasQuery &&
          !event.requestHasFragment,
      ),
    ).toBe(true)

    reuseContext = await browser.newContext(isolatedContextOptions(testInfo))
    const reusePage = await reuseContext.newPage()
    const reuseEvents = []
    const reuseResponses = []
    watchSafePageRequests(reusePage, reuseEvents)
    reusePage.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/auth/reset-password') {
        reuseResponses.push(response.status())
      }
    })
    await reusePage.goto('/about')
    await navigateToSensitiveUrl(reusePage, secondLink.resetUrl)
    await expect(reusePage.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await reusePage.locator('#reset-password').fill(newPassword)
    await reusePage.locator('#reset-password-confirmation').fill(newPassword)
    await reusePage.getByRole('button', { name: 'Set password' }).click()
    await expect(reusePage.locator('#reset-password-error')).toHaveText(unavailableMessage)
    expect(reuseResponses).toEqual([400])
    expect(
      reuseEvents.every(
        (event) =>
          !event.pageHasQuery &&
          !event.pageHasFragment &&
          !event.requestHasQuery &&
          !event.requestHasFragment,
      ),
    ).toBe(true)

    const originHeader = { Origin: origin }
    const staleSessionResponse = await oldSessionContext.request.get(`${baseURL}/api/auth/me`, {
      headers: originHeader,
    })
    expect(staleSessionResponse.status()).toBe(401)

    loginContext = await browser.newContext(isolatedContextOptions(testInfo))
    const loginPage = await loginContext.newPage()
    await loginPage.goto('/login')
    await loginPage.getByLabel('Email or username').fill(student.email)
    await loginPage.getByLabel('Password', { exact: true }).fill(student.password)
    await loginPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(loginPage.getByRole('alert')).toContainText(
      'Email, username or password is incorrect.',
    )
    await loginPage.getByLabel('Password', { exact: true }).fill(newPassword)
    await loginPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(loginPage).toHaveURL('/')
    await expectSignedInAs(loginPage, student.username)
    await loginPage.goto('/about')
    await expect(loginPage.locator('main h1, h1').first()).toBeVisible()
    const finalBoundary = await loginPage.evaluate(() => ({
      recoveryControls: document.querySelectorAll(
        '.recovery-page, .recovery-dialog, .recovery-reset-form, #reset-password',
      ).length,
      hasHorizontalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
        window.innerWidth,
    }))
    expect(finalBoundary).toEqual({ recoveryControls: 0, hasHorizontalOverflow: false })
  } finally {
    await loginContext?.close()
    await reuseContext?.close()
    await replacedContext?.close()
    await queryContext?.close()
    await gateContext?.close()
    await oldSessionContext?.close()
  }
})

test('instructors issue links; admin-only roles have no roster recovery control', async ({
  browser,
  page,
  studentIdentity,
}, testInfo) => {
  test.setTimeout(120000)
  const baseURL = testInfo.project.use.baseURL
  expect(typeof baseURL).toBe('string')
  const origin = new URL(baseURL).origin
  const suffix = randomBytes(6).toString('hex')
  const institutionName = `Recovery Academy ${suffix}`
  const institutionSlug = `recovery-${suffix}`
  const cohortName = `Recovery Class ${suffix}`
  const instructor = {
    email: `recovery-instructor-${suffix}@example.test`,
    username: `recovery-i-${suffix}`,
  }
  const instructorPassword = `Instructor-${randomBytes(12).toString('hex')}Aa!`
  const isolated = isolatedContextOptions(testInfo)
  let instructorContext
  let studentContext

  try {
    await page.goto('/admin')
    await page.getByLabel('Institution name').fill(institutionName)
    await page.getByLabel('Institution slug').fill(institutionSlug)
    await page.getByRole('button', { name: 'Create institution' }).click()
    await expect(page.getByRole('list').getByText(institutionName, { exact: true })).toBeVisible()
    await page.getByLabel('Class name').fill(cohortName)
    await page.getByLabel('Term', { exact: true }).fill('Synthetic Recovery Term')
    await page.getByRole('button', { name: 'Create class' }).click()
    await expect(page.getByRole('list').getByText(cohortName, { exact: true })).toBeVisible()
    const cohortResponse = await page
      .context()
      .request.get(`${origin}/api/admin/cohorts?limit=50`, { headers: { Origin: origin } })
    expect(cohortResponse.ok()).toBe(true)
    const cohort = (await cohortResponse.json()).cohorts.find((item) => item.name === cohortName)
    expect(cohort?.id).toMatch(/^[a-f\d]{24}$/i)

    await page.getByRole('tab', { name: 'Instructors', exact: true }).click()
    await page.getByLabel('Instructor email').fill(instructor.email)
    await page.getByLabel('Instructor username').fill(instructor.username)
    await page.getByRole('button', { name: 'Create instructor and activation link' }).click()
    const activationUrl = await page.getByLabel('Activation link', { exact: true }).inputValue()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByLabel('Activation link', { exact: true })).toHaveCount(0)

    instructorContext = await browser.newContext(isolated)
    const instructorPage = await instructorContext.newPage()
    await instructorPage.goto(activationUrl)
    await expect(
      instructorPage.getByRole('heading', { name: 'Activate your account' }),
    ).toBeVisible()
    await instructorPage.getByLabel('New password', { exact: true }).fill(instructorPassword)
    await instructorPage.getByLabel('Confirm password', { exact: true }).fill(instructorPassword)
    await instructorPage.getByRole('button', { name: 'Set password and activate account' }).click()
    await expect(
      instructorPage.getByText('Your password is set. Sign in normally to continue.'),
    ).toBeVisible()
    await instructorPage.getByRole('link', { name: 'Continue to sign in' }).click()
    await instructorPage.getByLabel('Email or username').fill(instructor.email)
    await instructorPage.getByLabel('Password', { exact: true }).fill(instructorPassword)
    await instructorPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(instructorPage).toHaveURL('/')

    await page.getByRole('button', { name: 'Refresh instructors' }).click()
    const instructorEditor = page.getByRole('article', { name: instructor.username, exact: true })
    await instructorEditor
      .getByRole('checkbox', { name: `${cohortName}, ${institutionName}, Synthetic Recovery Term` })
      .check()
    await instructorEditor.getByRole('button', { name: 'Save assignments' }).click()
    await expect
      .poll(async () => {
        const response = await instructorContext.request.get(
          `${origin}/api/me/teaching-assignments?limit=50`,
          { headers: { Origin: origin } },
        )
        if (!response.ok()) return []
        const result = await response.json()
        return result.assignments.map(({ cohortId }) => cohortId)
      })
      .toContain(cohort.id)

    await instructorPage.goto('/instructor')
    await expect(instructorPage.getByRole('heading', { name: 'Manage your classes' })).toBeVisible()
    await instructorPage.getByLabel('Class', { exact: true }).selectOption(cohort.id)
    await instructorPage.getByRole('button', { name: 'Generate code' }).click()
    const invitationUrl = await instructorPage.getByLabel('Invitation link').inputValue()
    await instructorPage.getByRole('button', { name: 'Close and clear code' }).click()
    await expect(instructorPage.getByLabel('Invitation link')).toHaveCount(0)

    studentContext = await browser.newContext(isolated)
    const studentPage = await studentContext.newPage()
    await studentPage.goto(invitationUrl)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(studentPage).toHaveURL(/\/login/)
    await studentPage.getByLabel('Email or username').fill(studentIdentity.email)
    await studentPage.getByLabel('Password', { exact: true }).fill(studentIdentity.password)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(studentPage).toHaveURL(/\?classRequest=pending$/)
    await expect(studentPage.getByText(/Class request pending staff approval/)).toBeVisible()

    await instructorPage.reload()
    const pendingRow = instructorPage
      .locator('.cohort-member-list li')
      .filter({ hasText: studentIdentity.username })
    await expect(pendingRow).toBeVisible()
    await expect(
      pendingRow.getByRole('button', { name: /Prepare password reset link/ }),
    ).toHaveCount(0)
    await pendingRow.getByRole('button', { name: 'Approve' }).click()
    await expect(
      instructorPage.getByRole('status').filter({ hasText: 'Class access approved.' }),
    ).toBeVisible()
    await instructorPage.getByRole('button', { name: 'Active', exact: true }).click()
    const activeRow = instructorPage
      .locator('.cohort-member-list li')
      .filter({ hasText: studentIdentity.username })
    const instructorRecoveryButton = activeRow.getByRole('button', {
      name: `Prepare password reset link for ${studentIdentity.username}`,
      exact: true,
    })
    await expect(instructorRecoveryButton).toBeVisible()
    await instructorRecoveryButton.click()
    await instructorPage.getByLabel(identityCheckLabel).check()
    const instructorIssueButton = instructorPage.getByRole('button', {
      name: 'Prepare password reset link',
      exact: true,
    })
    await instructorIssueButton.click()
    const dialog = instructorPage.getByRole('dialog', {
      name: 'Deliver this reset link privately',
    })
    await expect(dialog).toBeVisible()
    const resetLink = await dialog.locator('#recovery-link-value').inputValue()
    expect(safeLinkMetadata(resetLink, origin)).toEqual({
      originMatches: true,
      path: '/reset-password',
      hasQuery: false,
      fragmentKeys: ['token'],
      tokenShapeMatches: true,
    })
    await expect
      .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true)
    await instructorPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(instructorPage.locator('#recovery-link-value')).toHaveCount(0)
    await expect(instructorIssueButton).toBeFocused()

    const adminOnlyPage = page
    await adminOnlyPage.goto('/instructor')
    await expect(adminOnlyPage.getByRole('heading', { name: 'Manage your classes' })).toBeVisible()
    await expect(
      adminOnlyPage.getByRole('button', { name: /Prepare password reset link/ }),
    ).toHaveCount(0)
  } finally {
    await studentContext?.close()
    await instructorContext?.close()
  }
})
