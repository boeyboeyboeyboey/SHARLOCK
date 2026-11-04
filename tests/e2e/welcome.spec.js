import { test, expect } from '@playwright/test'

test('a signed-out visitor lands on the welcome page and can reach sign-in and sign-up', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { name: 'Sharlock Hub', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Sharlock' })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/welcome$/)
  await page.getByRole('link', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Create a student account' })).toBeVisible()
})
