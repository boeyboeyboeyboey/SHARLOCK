import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'

const suffix = () => randomBytes(4).toString('hex')

const expectNoAccess = async (page) => {
  await expect(page).toHaveURL(/\/forbidden$/)
  await expect(
    page.getByRole('heading', { name: "You don't have access to this page." }),
  ).toBeVisible()
}

test('an assigned instructor approves, declines and revokes from their own page', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(suffix(), { pendingStudents: 2 })
  const [approved, declined] = seeded.pending
  const { context, page } = await signedInPage(browser, baseURL, seeded.instructor)
  const declinedSession = await signedInPage(browser, baseURL, declined)
  try {
    await declinedSession.page.goto('/leaderboard')
    await expect(declinedSession.page.getByText('Your class request is waiting')).toBeVisible()

    await page.goto(`/instructor?class=${seeded.classId}`)
    await expect(page.getByRole('heading', { name: 'Manage your classes' })).toBeVisible()

    const approvedRow = page.locator('li').filter({ hasText: approved.username }).first()
    await approvedRow.getByRole('button', { name: 'Approve' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Class access approved.' }),
    ).toBeVisible()

    await page.getByRole('button', { name: `Decline ${declined.username}` }).click()
    await page.getByRole('button', { name: 'Yes, decline' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Join request declined.' }),
    ).toBeVisible()
    await expect(page.getByText(declined.username, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByText(approved.username, { exact: true })).toBeVisible()
    await expect(page.getByText(declined.username, { exact: true })).toHaveCount(0)

    await declinedSession.page.reload()
    await expect(
      declinedSession.page.getByText('Join a class to see its leaderboard.'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Generate code' }).click()
    await expect(page.getByLabel('New class invitation code')).toBeVisible()
    await page.getByRole('button', { name: 'Close and clear code' }).click()
    await page.getByRole('button', { name: 'Revoke code' }).click()
    await page.getByRole('button', { name: 'Yes, revoke it' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'The invitation code was revoked.' }),
    ).toBeVisible()
  } finally {
    await declinedSession.context.close()
    await context.close()
  }
})

test('an instructor has no way into the admin area or another class', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(suffix())
  const other = await seedClass(suffix())
  const { context, page } = await signedInPage(browser, baseURL, seeded.instructor)
  try {
    await page.goto('/admin')
    await expectNoAccess(page)

    await page.goto('/')
    await page.getByTestId('menu-button').click()
    const menu = page.getByTestId('site-menu')
    await expect(menu.getByRole('link', { name: 'Manage your classes' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)

    await page.goto(`/instructor?class=${other.classId}`)
    await expect(page.getByLabel('Class', { exact: true })).toHaveValue(seeded.classId)
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByText(seeded.studentA.username, { exact: true })).toBeVisible()
    await expect(page.getByText(other.studentA.username, { exact: true })).toHaveCount(0)

    const foreign = await context.request.get(
      new URL(`/api/cohorts/${other.classId}/memberships?status=active`, baseURL).href,
      { headers: { Origin: new URL(baseURL).origin } },
    )
    expect([403, 404]).toContain(foreign.status())
  } finally {
    await context.close()
  }
})

test('a student reaches Settings in the 2D town but not the staff pages', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(suffix())
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.goto('/instructor')
    await expectNoAccess(page)
    await page.goto('/admin')
    await expectNoAccess(page)

    await page.goto('/settings')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expect(page.getByTestId('settings-ui-size')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('town-player')).toBeVisible()
  } finally {
    await context.close()
  }
})
