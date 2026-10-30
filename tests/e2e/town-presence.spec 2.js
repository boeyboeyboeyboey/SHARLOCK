import { test, expect } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'

async function openTown(browser, baseURL, who) {
  const { context, page } = await signedInPage(browser, baseURL, who)
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.goto('/')
  await expect(page.getByTestId('town-player')).toBeVisible()
  return { context, page }
}

async function onlineCount(page) {
  await page.getByTestId('menu-button').click()
  return Number(await page.getByTestId('menu-online-count').innerText())
}

test('classmates in the 2d town see each other and are counted online', async ({
  browser,
  baseURL,
}) => {
  const room = await seedClass(`tp${Date.now().toString(36)}`)
  const a = await openTown(browser, baseURL, room.studentA)
  const b = await openTown(browser, baseURL, room.studentB)
  try {
    await expect(a.page.getByTestId('town-peer')).toHaveAttribute(
      'data-username',
      room.studentB.username,
    )
    await expect(b.page.getByTestId('town-peer')).toHaveAttribute(
      'data-username',
      room.studentA.username,
    )
    await expect.poll(() => onlineCount(a.page)).toBe(1)
    await a.page.getByTestId('menu-online-toggle').click()
    await expect(a.page.getByTestId('menu-online-list')).toContainText(room.studentB.username)
  } finally {
    await Promise.all([a, b].map((x) => x.context.close()))
  }
})
