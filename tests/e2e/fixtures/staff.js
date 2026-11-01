import { expect } from '@playwright/test'

// the provisioning forms sit in a collapsed section on the instructors tab
export async function openAddStaff(page) {
  const section = page.locator('details').filter({ hasText: 'Add staff' })
  if (!(await section.evaluate((element) => element.open))) {
    await section.locator('summary').click()
  }
  await expect(section.getByRole('heading', { name: 'Provision an instructor' })).toBeVisible()
}

// closing without copying asks first, because the link cannot be shown again
export async function closeLinkDialog(page) {
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export async function openAssignments(editor) {
  await editor.getByRole('button', { name: 'Edit assignments' }).click()
}
