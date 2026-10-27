import { randomBytes } from 'node:crypto'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { createAuthService } from '../../server/src/modules/auth/service.js'
import { parseRegistrationInput } from '../../server/src/modules/auth/policy.js'
import { expect, test } from './fixtures/admin.js'

async function createStudent() {
  const testUri = process.env.TEST_MONGODB_URI
  assertSafeTestDatabaseUri(testUri)
  const suffix = randomBytes(6).toString('hex')
  const username = `e2e-del-${suffix}`
  const database = await connectDatabase(testUri)
  try {
    await createAuthService(database).register(
      parseRegistrationInput({
        email: `e2e-del-${suffix}@example.test`,
        username,
        password: `${randomBytes(24).toString('base64url')}A!`,
        avatarId: 'mint',
      }),
    )
  } finally {
    await database.close()
  }
  return username
}

test('admin deletes a student account and finds it in the audit log', async ({
  page,
  administratorIdentity,
}) => {
  const username = await createStudent()
  await page.goto('/admin?tab=accounts')
  const panel = page.locator('section[aria-labelledby="account-controls-title"]')
  await panel.getByLabel('Role').selectOption('student')
  await panel.getByRole('button', { name: 'Apply filters' }).click()

  const table = panel.locator('.admin-workspace__account-table')
  await expect(table).toHaveAttribute('aria-busy', 'false')
  // the list is paged, so walk pages until the new student shows
  let row = panel.getByRole('row').filter({ hasText: username })
  while (!(await row.count())) {
    const next = panel.getByRole('button', { name: 'Next accounts' })
    await expect(next).toBeEnabled()
    await next.click()
    await expect(table).toHaveAttribute('aria-busy', 'false')
    row = panel.getByRole('row').filter({ hasText: username })
  }

  await row.getByRole('button', { name: `Delete account ${username}` }).click()
  const dialog = page.getByRole('dialog', { name: `Delete ${username}?` })
  await expect(dialog).toBeVisible()
  const submit = dialog.getByRole('button', { name: 'Delete account' })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel(`Type ${username} to confirm`).fill(username.toUpperCase())
  await dialog.getByLabel('Reason').selectOption({ label: 'Wrong name' })
  await dialog.getByLabel('Your administrator password').fill(administratorIdentity.password)
  await submit.click()

  await expect(panel.getByRole('status').filter({ hasText: 'Account deleted.' })).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(panel.getByText(username, { exact: true })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Audit log', exact: true }).click()
  const audit = page.locator('section[aria-labelledby="audit-events-title"]')
  await audit.getByLabel('Event type').selectOption({ label: 'Account deleted' })
  await audit.getByRole('button', { name: 'Apply filters' }).click()
  await expect(audit.getByText('Deleted · Wrong name').first()).toBeVisible()
})
