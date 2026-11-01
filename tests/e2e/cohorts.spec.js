import { expect, test } from './fixtures/admin.js'
import { forceTown2d, newTown2dContext } from './fixtures/town.js'

test.skip(
  process.env.SHARLOCK_TEST_REPLICA_SET !== '1',
  'This journey needs transactions; run with --replica-set.',
)
test.beforeEach(({ page }) => forceTown2d(page))

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
  expect(linkChecks).toEqual({
    originMatches: true,
    path: '/join-class',
    hasQuery: false,
    fragmentKeys: ['code'],
    codeLength: 16,
    codeValid: true,
  })

  const studentContext = await newTown2dContext(browser, {
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  })
  try {
    const studentPage = await studentContext.newPage()
    await studentPage.goto(invitationUrl)
    await expect(studentPage).toHaveURL(/\/join-class$/)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(studentPage).toHaveURL(/\/login/)
    await studentPage.getByLabel('Email or username').fill(studentIdentity.email)
    await studentPage.getByLabel('Password', { exact: true }).fill(studentIdentity.password)
    await studentPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(studentPage).toHaveURL(/\/\?classRequest=pending$/, { timeout: 10000 })
    await expect(studentPage.getByText(/Class request pending staff approval/)).toBeVisible()

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
    await studentPage.goto('/join-class')
    const alreadyIn = studentPage.getByTestId('already-in-class')
    await expect(alreadyIn).toContainText("You're already in Synthetic Blue Class.")
    await expect(alreadyIn).toContainText(
      'To join another, ask your instructor to remove you from this class first.',
    )
    await expect(studentPage.getByRole('button', { name: 'Join class' })).toHaveCount(0)
    await alreadyIn.getByRole('link', { name: 'Your classes' }).click()
    await expect(studentPage).toHaveURL(/\/classes$/)
    await studentPage.setViewportSize({ width: 768, height: 900 })
    await expect(studentPage.getByRole('dialog', { name: 'Your classes' })).toBeVisible()
    expect(
      await studentPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
  } finally {
    await studentContext.close()
  }
})
