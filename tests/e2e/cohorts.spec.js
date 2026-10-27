import { expect, test } from './fixtures/admin.js'

async function csrf(request, baseURL) {
  const origin = new URL(baseURL).origin
  const response = await request.get(`${baseURL}/api/auth/csrf`, { headers: { Origin: origin } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).csrfToken
}

async function post(request, baseURL, path, body) {
  const token = await csrf(request, baseURL)
  const response = await request.post(`${baseURL}/api${path}`, {
    headers: { Origin: new URL(baseURL).origin, 'X-CSRF-Token': token },
    data: body,
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test('learner follows a class link and gets access after instructor approval', async ({
  page,
  browser,
  baseURL,
  studentIdentity,
}, testInfo) => {
  test.setTimeout(90_000)
  const staffRequest = page.context().request
  const suffix = `${testInfo.workerIndex}-${Date.now().toString(36)}`
  const institution = await post(staffRequest, baseURL, '/admin/institutions', {
    name: `Cohort QA ${suffix}`,
    slug: `cohort-qa-${suffix}`,
  })
  const institutionId = institution.institution?.id || institution.id
  const createdClass = await post(staffRequest, baseURL, '/admin/cohorts', {
    institutionId,
    name: 'Synthetic Blue Class',
    term: 'QA term',
  })
  const classId = createdClass.cohort?.id || createdClass.id

  await page.goto('/instructor')
  await expect(page.getByRole('heading', { name: 'Manage your classes' })).toBeVisible()
  const isCodeRequest = (response, method) =>
    new URL(response.url()).pathname.endsWith(`/cohorts/${classId}/enrollment-codes`) &&
    response.request().method() === method
  const codeLoaded = page.waitForResponse((response) => isCodeRequest(response, 'GET'))
  await page.getByLabel('Class', { exact: true }).selectOption(classId)
  await codeLoaded
  const [generated] = await Promise.all([
    page.waitForResponse((response) => isCodeRequest(response, 'POST')),
    page.getByRole('button', { name: 'Generate code' }).click(),
  ])
  expect(generated.ok()).toBeTruthy()
  const linkField = page.getByLabel('Invitation link')
  const invitationUrl = await linkField.inputValue()
  await page.getByRole('button', { name: 'Close and clear code' }).click()
  await expect(linkField).toHaveCount(0)
  const parsedInvitation = new URL(invitationUrl)
  const code = (new URLSearchParams(parsedInvitation.hash.slice(1)).get('code') || '').replace(
    /-/g,
    '',
  )
  const linkChecks = {
    originMatches: parsedInvitation.origin === new URL(baseURL).origin,
    path: parsedInvitation.pathname,
    hasQuery: Boolean(parsedInvitation.search),
    fragmentKeys: [...new URLSearchParams(parsedInvitation.hash.slice(1)).keys()],
    codeLength: code.length,
    codeValid: /^[A-HJ-NP-Z2-9]{16}$/.test(code),
  }
  expect(
    linkChecks.originMatches &&
      linkChecks.path === '/join-class' &&
      !linkChecks.hasQuery &&
      linkChecks.fragmentKeys.length === 1 &&
      linkChecks.fragmentKeys[0] === 'code' &&
      linkChecks.codeValid,
    `Instructor invitation link metadata is invalid: ${JSON.stringify(linkChecks)}`,
  ).toBe(true)

  const studentContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  })
  try {
    const studentPage = await studentContext.newPage()
    const invitationCaptureResponses = []
    const journeyResponses = []
    studentPage.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (path === '/api/auth/csrf' || path === '/api/auth/class-invitation') {
        invitationCaptureResponses.push({ path, status: response.status() })
      }
      if (['/api/auth/me', '/api/me/enrollment', '/api/cohorts/join-requests'].includes(path)) {
        journeyResponses.push(
          response.json().then(
            (body) => ({
              path,
              status: response.status(),
              hasInvitation: body?.hasInvitation,
              onboardingCompleted: body?.onboardingCompleted,
              code: body?.error?.code,
            }),
            () => ({ path, status: response.status() }),
          ),
        )
      }
    })
    await studentPage.goto(invitationUrl)
    await expect(studentPage).toHaveURL(/\/join-class$/)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(studentPage).toHaveURL(/\/login/)
    await studentPage.getByLabel('Email or username').fill(studentIdentity.email)
    await studentPage.getByLabel('Password', { exact: true }).fill(studentIdentity.password)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    try {
      await expect(studentPage).toHaveURL(/\/\?classRequest=pending$/, { timeout: 10000 })
    } catch {
      const enrollmentResponse = await studentContext.request.get(`${baseURL}/api/me/enrollment`)
      const enrollment = enrollmentResponse.ok() ? await enrollmentResponse.json() : {}
      const safeAlerts = await studentPage.getByRole('alert').allTextContents()
      const sendButtonVisible = await studentPage
        .getByRole('button', { name: 'Send class request' })
        .isVisible()
        .catch(() => false)
      const responseState = await Promise.all(journeyResponses)
      throw new Error(
        `Invitation handoff did not reach the town; server hasInvitation=${Boolean(enrollment.hasInvitation)}; sendButtonVisible=${sendButtonVisible}; alerts=${JSON.stringify(safeAlerts)}; captureResponses=${JSON.stringify(invitationCaptureResponses)}; journeyResponses=${JSON.stringify(responseState)}.`,
      )
    }
    await expect(
      studentPage.getByText(/Your class request is pending staff approval/),
    ).toBeVisible()

    await studentPage.goto('/classes')
    await expect(studentPage.getByText('Request pending')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Class', { exact: true })).toHaveValue(classId)
    await expect(page.getByText(studentIdentity.username, { exact: true })).toBeVisible()
    const requestRow = page.locator('li').filter({ hasText: studentIdentity.username }).first()
    await requestRow.getByRole('button', { name: 'Approve' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Class access approved.' }),
    ).toBeVisible()

    await studentPage.reload()
    await expect(studentPage.getByText('Active', { exact: true })).toBeVisible()
    await expect(studentPage.locator('body')).toContainText('Synthetic Blue Class')
    await studentPage.setViewportSize({ width: 768, height: 900 })
    await expect(studentPage.getByRole('link', { name: 'Your classes' })).toBeVisible()
    expect(
      await studentPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
  } finally {
    await studentContext.close()
  }
})
