import { randomBytes } from 'node:crypto'
import { expect, test } from './fixtures/admin.js'

async function signIn(context, origin, identity) {
  const csrfResponse = await context.request.get(`${origin}/api/auth/csrf`, {
    headers: { Origin: origin },
  })
  expect(csrfResponse.ok()).toBe(true)
  const { csrfToken } = await csrfResponse.json()
  const response = await context.request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { email: identity.email, password: identity.password },
  })
  expect(response.ok()).toBe(true)
}

// waits for the status change and the panel's own list reload, which would abort a filter request sent meanwhile
async function changeAccountStatus(page, row, buttonName) {
  const panel = page.locator('section[aria-labelledby="account-controls-title"]')
  const patched = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /^\/api\/admin\/users\/[^/]+$/.test(new URL(response.url()).pathname),
  )
  const reloaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/admin/users',
  )
  if (buttonName === 'Disable account') page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: buttonName }).click()
  expect((await patched).ok()).toBe(true)
  expect((await reloaded).ok()).toBe(true)
  await expect(panel.getByRole('button', { name: 'Apply filters' })).toBeEnabled()
}

async function findAccountRow(page, role, status, username) {
  const panel = page.locator('section[aria-labelledby="account-controls-title"]')
  await panel.getByLabel('Role').selectOption(role)
  await panel.getByLabel('Status').selectOption(status)
  let pageNumber = 1
  const waitForAccountResponse = () =>
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/admin/users' &&
        url.searchParams.get('role') === role &&
        url.searchParams.get('accountStatus') === status &&
        url.searchParams.get('page') === String(pageNumber)
      )
    })
  const waitForLoadedState = async () => {
    await expect
      .poll(async () => {
        const applyFilters = panel.getByRole('button', { name: 'Apply filters' })
        if (!(await applyFilters.isEnabled())) return false
        if (await panel.getByText('Loading accounts…', { exact: true }).count()) return false
        const table = panel.locator('.admin-workspace__account-table')
        if (await table.count()) return (await table.getAttribute('aria-busy')) === 'false'
        return true
      })
      .toBe(true)
  }

  const responsePromise = waitForAccountResponse()
  await panel.getByRole('button', { name: 'Apply filters' }).click()
  expect((await responsePromise).ok()).toBe(true)
  await waitForLoadedState()

  while (true) {
    const usernameCell = panel.getByText(username, { exact: true })
    if (await usernameCell.count()) return usernameCell.locator('xpath=ancestor::tr')

    const next = panel.getByRole('button', { name: 'Next accounts' })
    if (!(await next.count()) || !(await next.isEnabled())) break
    pageNumber += 1
    const nextResponse = waitForAccountResponse()
    await next.click()
    expect((await nextResponse).ok()).toBe(true)
    await waitForLoadedState()
    await expect(panel.getByText(new RegExp(`^Page ${pageNumber} of `))).toBeVisible()
  }
  throw new Error(`The account list did not contain ${username}.`)
}

function institutionRow(page, name) {
  return page
    .getByRole('button', { name: `Edit ${name}`, exact: true })
    .locator('xpath=ancestor::li')
}

function cohortRow(page, name) {
  return page
    .getByRole('button', { name: `Edit ${name}`, exact: true })
    .locator('xpath=ancestor::li')
}

test('admin manages institutions, assignments, audit history, and account access', async ({
  browser,
  page,
  studentIdentity,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  expect(typeof baseURL).toBe('string')
  const origin = new URL(baseURL).origin
  const suffix = randomBytes(6).toString('hex')
  const institutionName = `E2E Academy ${suffix}`
  const institutionSlug = `e2e-${suffix}`
  const cohortName = `E2E Class ${suffix}`
  const term = 'Synthetic Term 1'
  const instructor = {
    email: `e2e-instructor-${suffix}@example.test`,
    username: `e2e-i-${suffix}`,
  }
  const instructorPassword = `Instructor-${randomBytes(12).toString('hex')}Aa!`
  const isolatedContext = {
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  }
  let activationContext
  let studentContext
  let freshStudentContext

  try {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible()

    await page.getByLabel('Institution name').fill(institutionName)
    await page.getByLabel('Institution slug').fill(institutionSlug)
    await page.getByRole('button', { name: 'Create institution' }).click()
    await expect(page.getByRole('list').getByText(institutionName, { exact: true })).toBeVisible()

    await page.getByLabel('Class name').fill(cohortName)
    await page.getByLabel('Term', { exact: true }).fill(term)
    await page.getByRole('button', { name: 'Create class' }).click()
    await expect(page.getByRole('list').getByText(cohortName, { exact: true })).toBeVisible()
    const cohortListResponse = await page
      .context()
      .request.get(`${origin}/api/admin/cohorts?limit=50`, { headers: { Origin: origin } })
    expect(cohortListResponse.ok()).toBe(true)
    const createdCohort = (await cohortListResponse.json()).cohorts.find(
      (cohort) => cohort.name === cohortName,
    )
    expect(createdCohort?.id).toMatch(/^[a-f\d]{24}$/i)

    await page.getByLabel('Instructor email').fill(instructor.email)
    await page.getByLabel('Instructor username').fill(instructor.username)
    await page.getByRole('button', { name: 'Create instructor and activation link' }).click()

    const linkField = page.getByLabel('Activation link', { exact: true })
    await expect(linkField).toBeVisible()
    await expect
      .poll(async () => {
        const value = await linkField.inputValue()
        return /^https?:\/\/[^/]+\/activate-account#token=[A-Za-z\d_-]{43}$/.test(value)
      })
      .toBe(true)
    const activationUrl = await linkField.inputValue()
    const activation = new URL(activationUrl)
    expect(activation.origin).toBe(origin)
    expect(activation.pathname).toBe('/activate-account')
    expect(activation.search).toBe('')
    expect(activation.hash).toMatch(/^#token=[A-Za-z\d_-]{43}$/)

    await page.getByRole('button', { name: 'Close and clear link' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(activationUrl, { exact: true })).toHaveCount(0)

    activationContext = await browser.newContext(isolatedContext)
    const activationPage = await activationContext.newPage()
    await activationPage.goto(activationUrl)
    await expect(
      activationPage.getByRole('heading', { name: 'Activate your account' }),
    ).toBeVisible()
    await expect(activationPage).toHaveURL(`${origin}/activate-account`)
    await activationPage.getByLabel('New password').fill(instructorPassword)
    await activationPage.getByLabel('Confirm password').fill(instructorPassword)
    await activationPage.getByRole('button', { name: 'Set password and activate account' }).click()
    await expect(
      activationPage.getByText('Your password is set. Sign in normally to continue.'),
    ).toBeVisible()
    await expect(activationPage.getByLabel('Email address')).toHaveCount(0)
    await activationPage.getByRole('link', { name: 'Continue to sign in' }).click()

    await activationPage.getByLabel('Email or username').fill(instructor.email)
    await activationPage.getByLabel('Password', { exact: true }).fill(instructorPassword)
    await activationPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(activationPage).toHaveURL(`${origin}/`)

    const beforeAssignments = await activationContext.request.get(
      `${origin}/api/me/teaching-assignments?limit=50`,
      { headers: { Origin: origin } },
    )
    expect(beforeAssignments.ok()).toBe(true)
    expect((await beforeAssignments.json()).assignments).toEqual([])

    await page.getByRole('button', { name: 'Refresh instructors' }).click()

    const instructorEditor = page.getByRole('article', { name: instructor.username, exact: true })
    const cohortCheckbox = instructorEditor.getByRole('checkbox', {
      name: `${cohortName}, ${institutionName}, ${term}`,
    })
    await expect(cohortCheckbox).toBeVisible()
    await cohortCheckbox.check()
    await instructorEditor.getByRole('button', { name: 'Save assignments' }).click()

    await expect
      .poll(async () => {
        const response = await activationContext.request.get(
          `${origin}/api/me/teaching-assignments?limit=50`,
          { headers: { Origin: origin } },
        )
        if (!response.ok()) return []
        const result = await response.json()
        return result.assignments.map(({ cohortId }) => cohortId)
      })
      .toContain(createdCohort.id)

    const institutionList = await page
      .context()
      .request.get(`${origin}/api/admin/institutions?limit=50`, { headers: { Origin: origin } })
    expect(institutionList.ok()).toBe(true)
    const createdInstitution = (await institutionList.json()).institutions.find(
      (candidate) => candidate.slug === institutionSlug,
    )
    expect(createdInstitution?.id).toMatch(/^[a-f\d]{24}$/i)

    const renamedInstitution = `${institutionName} Renamed`
    await page.getByRole('button', { name: `Edit ${institutionName}`, exact: true }).click()
    await page
      .locator(`#admin-institution-edit-name-${createdInstitution.id}`)
      .fill(renamedInstitution)
    await page.getByRole('button', { name: 'Save institution' }).click()
    await expect(
      institutionRow(page, renamedInstitution).getByText(renamedInstitution, { exact: true }),
    ).toBeVisible()

    const renamedCohort = `${cohortName} Renamed`
    const renamedTerm = `${term} Updated`
    await page.getByRole('button', { name: `Edit ${cohortName}`, exact: true }).click()
    await page.locator(`#admin-cohort-edit-name-${createdCohort.id}`).fill(renamedCohort)
    await page.locator(`#admin-cohort-edit-term-${createdCohort.id}`).fill(renamedTerm)
    await page.locator(`#admin-cohort-edit-status-${createdCohort.id}`).selectOption('inactive')
    await page.getByRole('button', { name: 'Save class' }).click()
    await expect(
      cohortRow(page, renamedCohort).getByText(renamedCohort, { exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Refresh instructors' }).click()
    const retainedInstructor = page.getByRole('article', {
      name: instructor.username,
      exact: true,
    })
    await expect(retainedInstructor.getByText('Inactive; retained assignment')).toBeVisible()
    await retainedInstructor.getByRole('button', { name: 'Save assignments' }).click()
    await expect
      .poll(async () => {
        const response = await activationContext.request.get(
          `${origin}/api/me/teaching-assignments?limit=50`,
          { headers: { Origin: origin } },
        )
        if (!response.ok()) return []
        const result = await response.json()
        return result.assignments.map(({ cohortId }) => cohortId)
      })
      .toContain(createdCohort.id)

    await page.getByRole('button', { name: `Edit ${renamedInstitution}`, exact: true }).click()
    await page
      .locator(`#admin-institution-edit-status-${createdInstitution.id}`)
      .selectOption('inactive')
    await page.getByRole('button', { name: 'Save institution' }).click()
    await expect(
      institutionRow(page, renamedInstitution).getByText(`${institutionSlug} · Inactive`, {
        exact: true,
      }),
    ).toBeVisible()

    await page.getByRole('button', { name: `Edit ${renamedInstitution}`, exact: true }).click()
    await page
      .locator(`#admin-institution-edit-status-${createdInstitution.id}`)
      .selectOption('active')
    await page.getByRole('button', { name: 'Save institution' }).click()
    await expect(
      cohortRow(page, renamedCohort).getByText(
        `${renamedInstitution} · ${renamedTerm} · Inactive`,
        { exact: true },
      ),
    ).toBeVisible()

    await page.getByRole('button', { name: `Edit ${renamedCohort}`, exact: true }).click()
    await page.locator(`#admin-cohort-edit-status-${createdCohort.id}`).selectOption('active')
    await page.getByRole('button', { name: 'Save class' }).click()

    await page.getByRole('button', { name: 'Refresh instructors' }).click()
    const updatedInstructor = page.getByRole('article', {
      name: instructor.username,
      exact: true,
    })
    await expect(
      updatedInstructor.getByRole('checkbox', {
        name: `${renamedCohort}, ${renamedInstitution}, ${renamedTerm}`,
      }),
    ).toBeChecked()
    await expect(updatedInstructor.getByText('Inactive; retained assignment')).toHaveCount(0)

    const auditPanel = page.locator('section[aria-labelledby="audit-events-title"]')
    await auditPanel.getByLabel('Event type').selectOption('admin.cohort.update')
    await auditPanel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(
      auditPanel
        .locator('.admin-workspace__audit-list')
        .getByText('Class updated', { exact: true })
        .first(),
    ).toBeVisible()
    await auditPanel.getByLabel('Event type').selectOption('admin.institution.update')
    await auditPanel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(
      auditPanel
        .locator('.admin-workspace__audit-list')
        .getByText('Institution updated', { exact: true })
        .first(),
    ).toBeVisible()

    studentContext = await browser.newContext(isolatedContext)
    await signIn(studentContext, origin, studentIdentity)
    const oldStudentSession = await studentContext.request.get(`${origin}/api/auth/me`, {
      headers: { Origin: origin },
    })
    expect(oldStudentSession.ok()).toBe(true)

    const studentRow = await findAccountRow(page, 'student', 'active', studentIdentity.username)
    await changeAccountStatus(page, studentRow, 'Disable account')
    await expect
      .poll(async () =>
        (
          await studentContext.request.get(`${origin}/api/auth/me`, {
            headers: { Origin: origin },
          })
        ).status(),
      )
      .toBe(401)

    const studentAuditPanel = page.locator('section[aria-labelledby="audit-events-title"]')
    await studentAuditPanel.getByLabel('Event type').selectOption('admin.user.disable')
    await studentAuditPanel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(
      studentAuditPanel
        .locator('.admin-workspace__audit-list')
        .getByText('Account disabled', { exact: true })
        .first(),
    ).toBeVisible()

    const disabledStudentRow = await findAccountRow(
      page,
      'student',
      'disabled',
      studentIdentity.username,
    )
    await changeAccountStatus(page, disabledStudentRow, 'Enable account')
    freshStudentContext = await browser.newContext(isolatedContext)
    await signIn(freshStudentContext, origin, studentIdentity)
    const freshStudentSession = await freshStudentContext.request.get(`${origin}/api/auth/me`, {
      headers: { Origin: origin },
    })
    expect(freshStudentSession.ok()).toBe(true)

    const activeInstructorRow = await findAccountRow(
      page,
      'instructor',
      'active',
      instructor.username,
    )
    await changeAccountStatus(page, activeInstructorRow, 'Disable account')
    const disabledInstructorRow = await findAccountRow(
      page,
      'instructor',
      'disabled',
      instructor.username,
    )
    await expect(disabledInstructorRow.getByRole('button', { name: 'Enable account' })).toHaveCount(
      0,
    )
    await disabledInstructorRow.getByRole('button', { name: 'Reissue activation link' }).click()
    await expect(page.getByLabel('Activation link', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close and clear link' }).click()

    await studentContext.close()
    studentContext = freshStudentContext
    freshStudentContext = undefined
    const studentPage = await studentContext.newPage()
    await studentPage.goto(`${origin}/admin`)
    await expect(studentPage).toHaveURL(`${origin}/forbidden`)
    await expect(
      studentPage.getByRole('heading', { name: 'This case needs permission' }),
    ).toBeVisible()
  } finally {
    await activationContext?.close()
    await studentContext?.close()
    await freshStudentContext?.close()
  }
})
