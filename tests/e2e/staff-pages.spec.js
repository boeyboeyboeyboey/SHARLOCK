import { randomBytes } from 'node:crypto'
import { expect, test } from './fixtures/admin.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import { openAddStaff } from './fixtures/staff.js'
import { forceTown2d } from './fixtures/town.js'

test.skip(
  process.env.SHARLOCK_TEST_REPLICA_SET !== '1',
  'This journey needs transactions; run with --replica-set.',
)

// the mobile project already runs at 375 px; the desktop project is narrowed to the 1200 px this page must fit
async function setStaffViewport(page, testInfo) {
  if (!testInfo.project.use.isMobile) await page.setViewportSize({ width: 1200, height: 800 })
}

test.beforeEach(async ({ page }, testInfo) => {
  await forceTown2d(page)
  await setStaffViewport(page, testInfo)
})

async function instructorSession(browser, baseURL, testInfo, who) {
  const session = await signedInPage(browser, baseURL, who)
  await setStaffViewport(session.page, testInfo)
  return session
}

// a phone widens its layout viewport to fit overflow, so the window's inner width would hide the problem
async function expectNoPageOverflow(page) {
  const { width } = page.viewportSize()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
}

// visible, and not hidden behind the sticky navbar
async function expectOnScreen(page, locator) {
  await expect(locator).toBeInViewport()
  const box = await locator.boundingBox()
  const navbar = await page.locator('.portal-shell header, .portal-shell nav').first().boundingBox()
  expect(box.y).toBeGreaterThanOrEqual((navbar?.y ?? 0) + (navbar?.height ?? 0) - 1)
}

async function adminPost(page, baseURL, path, body, method = 'post') {
  const origin = new URL(baseURL).origin
  const request = page.context().request
  const csrf = await request.get(`${origin}/api/auth/csrf`, { headers: { Origin: origin } })
  const response = await request[method](`${origin}/api${path}`, {
    headers: { Origin: origin, 'X-CSRF-Token': (await csrf.json()).csrfToken },
    data: body,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}

test('class results stay readable as whole words', async ({ browser, baseURL }, testInfo) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await instructorSession(browser, baseURL, testInfo, seeded.instructor)
  try {
    await page.goto(`/instructor?class=${seeded.classId}&view=results`)
    const table = page.getByRole('table', { name: 'Best score per activity for each student' })
    const student = table.getByRole('button', { name: seeded.studentA.username })
    await expect(student).toBeVisible()

    const studentBox = await student.boundingBox()
    expect(studentBox.height).toBeLessThan(90)
    expect(studentBox.width).toBeGreaterThan(60)
    const widths = await table
      .locator('thead th')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(85)
    await expectNoPageOverflow(page)

    // nine or more columns fit at 1200 px; on a phone only the table scrolls sideways
    const scroller = page.locator('.class-results__scroll')
    const overflow = await scroller.evaluate((element) => element.scrollWidth - element.clientWidth)
    if (!testInfo.project.use.isMobile) expect(overflow).toBeLessThanOrEqual(0)
    await page.locator('.class-results__scroll').scrollIntoViewIfNeeded()
    await testInfo.attach('results-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  } finally {
    await context.close()
  }
})

test('roster actions confirm first, keep the new code and stay in view', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(60_000)
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await instructorSession(browser, baseURL, testInfo, seeded.instructor)
  const { username: removedName } = seeded.studentA
  try {
    await page.goto(`/instructor?class=${seeded.classId}`)
    await page.getByRole('button', { name: 'Generate code' }).click()
    const code = page.getByLabel('New class invitation code')
    await expect(code).toBeVisible()
    const shownCode = await code.textContent()
    await expect(page.getByText('The previous code has been revoked.')).toHaveCount(0)

    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByText(removedName, { exact: true })).toBeVisible()
    await expect(code).toHaveText(shownCode)

    const removeButton = page.getByRole('button', { name: `Remove ${removedName}` })
    await removeButton.click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(removeButton).toBeFocused()
    await expect(page.getByText(removedName, { exact: true })).toBeVisible()

    await removeButton.scrollIntoViewIfNeeded()
    await removeButton.click()
    await page.getByRole('button', { name: 'Yes, remove' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'Class access removed.' })
    await expectOnScreen(page, notice)
    await expect(page.getByText(removedName, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Class access' })).toBeFocused()
    await expect(code).toHaveText(shownCode)
    await expectNoPageOverflow(page)

    // a tab that fails to load shows no rows rather than the previous tab's students
    await page.route(/\/memberships\?status=removed/, (route) => route.abort())
    await page.getByRole('button', { name: 'Removed', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByText(seeded.studentB.username, { exact: true })).toHaveCount(0)
    await page.unroute(/\/memberships\?status=removed/)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(`${seeded.studentA.email} · removed`)).toBeVisible()

    await page.getByRole('button', { name: 'Close and clear code' }).click()
    await expect(code).toHaveCount(0)
    await page.getByRole('button', { name: 'Replace code' }).click()
    await expect(page.getByText('Students using the old code will be refused.')).toBeVisible()
    await page.getByRole('button', { name: 'Keep this code' }).click()
    await expect(page.getByRole('button', { name: 'Yes, replace it' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('the accounts list fits the screen and asks before disabling', async ({
  page,
  studentIdentity,
}, testInfo) => {
  await page.goto('/admin?tab=accounts')
  const panel = page.locator('section[aria-labelledby="account-controls-title"]')
  await panel.getByLabel('Find by username or email').fill(studentIdentity.email)
  await panel.getByRole('button', { name: 'Apply filters' }).click()
  const row = panel.getByRole('row').filter({ hasText: studentIdentity.username })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(studentIdentity.email)
  await expect(row).toContainText('Student')
  await expect(row).toContainText('Active')

  const disable = row.getByRole('button', { name: 'Disable account' })
  const remove = row.getByRole('button', { name: `Delete account ${studentIdentity.username}` })
  const viewport = page.viewportSize()
  for (const control of [disable, remove]) {
    const box = await control.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  }
  await expectNoPageOverflow(page)
  await testInfo.attach('accounts', { body: await page.screenshot(), contentType: 'image/png' })

  await disable.click()
  await expect(row.getByText(`Disable ${studentIdentity.username}?`)).toBeVisible()
  await row.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(disable).toBeFocused()
  await expect(row).toContainText('Active')
})

test('admin forms are themed, stack on narrow screens and report what they saved', async ({
  page,
  baseURL,
}, testInfo) => {
  const suffix = randomBytes(5).toString('hex')
  const name = `Layout School ${suffix}`
  await adminPost(page, baseURL, '/admin/institutions', { name, slug: `layout-${suffix}` })
  await page.goto('/admin')

  const edit = page.getByRole('button', { name: `Edit ${name}`, exact: true })
  await edit.click()
  const nameField = page.getByLabel('Institution name').nth(1)
  expect((await nameField.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(edit).toBeFocused()

  if (!testInfo.project.use.isMobile) {
    await page.setViewportSize({ width: 640, height: 800 })
    const columns = await page
      .locator('.admin-workspace__two-column')
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(1)
    await setStaffViewport(page, testInfo)
  }

  await page
    .getByRole('combobox', { name: 'Institution', exact: true })
    .selectOption({ label: name })
  await page.getByLabel('Class name').fill(`Layout Class ${suffix}`)
  await page.getByLabel('Term', { exact: true }).fill('T1')
  await page.getByRole('button', { name: 'Create class' }).click()
  await expectOnScreen(page, page.getByRole('status').filter({ hasText: 'Class created.' }))
})

test('a pending instructor can be reissued or cancelled from the Instructors tab', async ({
  page,
}) => {
  const suffix = randomBytes(5).toString('hex')
  const username = `e2e-pi-${suffix}`
  await page.goto('/admin?tab=instructors')
  await expect(page.getByRole('heading', { name: 'Provision an instructor' })).toBeHidden()
  await openAddStaff(page)

  await page.locator('label[for="admin-administrator-avatar-blue"]').click()
  await expect(page.locator('#admin-administrator-avatar-blue')).toBeChecked()
  await expect(page.locator('#admin-instructor-avatar-blue')).not.toBeChecked()
  await expect(page.getByText('Choose your capybara')).toHaveCount(0)

  await page.getByLabel('Instructor email').fill(`e2e-pi-${suffix}@example.test`)
  const usernameField = page.getByLabel('Instructor username')
  await usernameField.fill('Mr Smith')
  const submit = page.getByRole('button', { name: 'Create instructor and activation link' })
  await submit.click()
  expect(await usernameField.evaluate((element) => element.validity.patternMismatch)).toBe(true)
  await usernameField.fill(username)
  await submit.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`Link for ${username}`)
  await page.keyboard.press('Escape')
  await expect(dialog).toContainText('Close without copying?')
  await dialog.getByRole('button', { name: 'Yes, close' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(submit).toBeFocused()

  const row = page.locator('.admin-workspace__instructor-row').filter({ hasText: username })
  await expect(row).toContainText('Pending activation')

  // opening the tab rereads the list, with no manual refresh
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click()
  const accounts = page.locator('section[aria-labelledby="account-controls-title"]')
  await expect(accounts.getByText(username, { exact: true })).toBeVisible()
  await expect(accounts.getByRole('row').filter({ hasText: username })).toContainText(
    'Pending activation',
  )

  await page.getByRole('tab', { name: 'Instructors', exact: true }).click()
  await row.getByRole('button', { name: `Cancel ${username}` }).click()
  await row.getByRole('button', { name: 'Yes, cancel them' }).click()
  await expect(row).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Pending instructor cancelled.' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Audit log', exact: true }).click()
  await expect(
    page.locator('.admin-workspace__audit-list').getByText('Pending instructor cancelled').first(),
  ).toBeVisible()
})

test('a student is not trapped by a refused code or a deactivated class', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page: student } = await instructorSession(
    browser,
    baseURL,
    testInfo,
    seeded.studentA,
  )
  try {
    // an active member has finished onboarding, however they arrived
    await student.goto('/join-class')
    await expect(student.getByTestId('already-in-class')).toBeVisible()
    const enrollment = await context.request.get(`${new URL(baseURL).origin}/api/me/enrollment`, {
      headers: { Origin: new URL(baseURL).origin },
    })
    expect((await enrollment.json()).onboardingCompleted).toBe(true)

    await adminPost(
      page,
      baseURL,
      `/admin/cohorts/${seeded.classId}`,
      {
        status: 'inactive',
        expectedRevision: 0,
      },
      'patch',
    )

    await student.goto('/join-class')
    const heading = student.getByRole('heading', { name: 'Join a class' })
    await expect(heading).toBeFocused()
    expect(await heading.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none')
    await expect(student.getByTestId('already-in-class')).toHaveCount(0)

    await student.getByLabel('Class invitation code').fill('ABCD-EFGH-JKLM-NPQR')
    await student.getByRole('button', { name: 'Join class' }).click()
    await expect(student.getByRole('alert')).toContainText("isn't valid or has expired")

    // a refused invitation link brings the form back rather than repeating the same button
    await student.goto('about:blank')
    await student.goto('/join-class#code=ABCD-EFGH-JKLM-NPQR')
    await student.getByRole('button', { name: 'Send class request' }).click()
    await expect(student.getByRole('alert')).toContainText("isn't valid or has expired")
    await expect(student.getByRole('button', { name: 'Join class' })).toBeVisible()
    await expect(student.getByRole('button', { name: 'Send class request' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
