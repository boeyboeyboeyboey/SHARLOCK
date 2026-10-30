import { test, expect } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'

// the software renderer builds the wharf slowly
test.setTimeout(360000)
const slow = { timeout: 120000 }

async function openHub(browser, baseURL, who) {
  const { context, page } = await signedInPage(browser, baseURL, who)
  // later init scripts win over the helper's 2d choice
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.townMode', '3d')
    localStorage.setItem('sharlock.hubForce3d', '1')
    localStorage.setItem('sharlock.hubWatchManual', '1')
    localStorage.setItem('sharlock.loreIntroSeen', '1')
    localStorage.setItem('sharlock.controlsHintSeen', '3')
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__hub?.state.ready === true, null, slow)
  return { context, page }
}

const peers = (page) => page.evaluate(() => window.__hub.debug.peers())

async function openMenu(page) {
  await page.getByTestId('menu-button').click()
  await expect(page.getByTestId('menu-online-toggle')).toBeVisible(slow)
}

const count = async (page) => Number(await page.getByTestId('menu-online-count').innerText())

test('classmates see each other on the wharf and other classes do not', async ({
  browser,
  baseURL,
}) => {
  const one = await seedClass(`pa${Date.now().toString(36)}`)
  const two = await seedClass(`pb${Date.now().toString(36)}`)
  const a = await openHub(browser, baseURL, one.studentA)
  const b = await openHub(browser, baseURL, one.studentB)
  const c = await openHub(browser, baseURL, two.studentA)
  try {
    await expect
      .poll(async () => (await peers(a.page)).map((p) => p.username), slow)
      .toEqual([one.studentB.username])
    await expect
      .poll(async () => (await peers(b.page)).map((p) => p.username), slow)
      .toEqual([one.studentA.username])
    expect(await peers(c.page)).toEqual([])

    await openMenu(a.page)
    await expect.poll(() => count(a.page), slow).toBe(1)
    await a.page.getByTestId('menu-online-toggle').click()
    await expect(a.page.getByTestId('menu-online-list')).toContainText(one.studentB.username)

    await openMenu(c.page)
    await expect.poll(() => count(c.page), slow).toBe(0)
  } finally {
    await Promise.all([a, b, c].map((x) => x.context.close()))
  }
})
