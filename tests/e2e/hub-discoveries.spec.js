import { test, expect } from './fixtures/auth.js'

// the software renderer builds the wharf slowly
test.setTimeout(240000)
const slow = { timeout: 120000 }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.hubForce3d', '1')
    localStorage.setItem('sharlock.hubWatchManual', '1')
    localStorage.setItem('sharlock.loreIntroSeen', '1')
    localStorage.setItem('sharlock.controlsHintSeen', '3')
  })
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

async function hubReady(page) {
  await page.waitForFunction(
    () => window.__hub?.state.ready === true || /unavailable/.test(document.body.innerText),
    null,
    slow,
  )
  expect(await page.evaluate(() => window.__hub?.state.ready)).toBe(true)
}

test('E opens a hidden discovery card and the menu counts it', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  const finds = await page.evaluate(() => window.__hub.debug.finds())
  expect(finds).toHaveLength(6)
  const note = finds.find((f) => f.id === 'sticky-note')

  // nothing is near the spawn, so E does nothing
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)

  await page.evaluate(({ x, z }) => window.__hub.debug.teleport(x + 1, z + 1), note)
  await expect
    .poll(() => page.evaluate(() => window.__hub.state.nearFind), slow)
    .toBe('sticky-note')
  await page.keyboard.press('KeyE')
  // the announcement clears after 5 s, so read it before the slower card checks
  await expect(page.getByTestId('hub-status')).toHaveText('Discovery 1 of 6: Pinned note')
  const card = page.getByTestId('npc-dialogue')
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Pinned note' })).toBeVisible()
  await expect(page.getByTestId('npc-line')).toContainText('Safe: 1234')
  expect(await page.evaluate(() => localStorage.getItem('sharlock.discoveries'))).toBe(
    '["sticky-note"]',
  )

  await page.getByTestId('npc-next').click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(card).toHaveCount(0)

  await page.getByTestId('menu-button').click()
  await expect(page.getByTestId('menu-discoveries')).toContainText('1/6')
})

test('the prompt button opens a hidden npc and a repeat visit is not counted twice', async ({
  page,
}) => {
  await page.goto('/')
  await hubReady(page)
  const tailgater = (await page.evaluate(() => window.__hub.debug.finds())).find(
    (f) => f.id === 'tailgater',
  )
  await page.evaluate(({ x, z }) => window.__hub.debug.teleport(x - 1.5, z), tailgater)
  await expect.poll(() => page.evaluate(() => window.__hub.state.nearFind), slow).toBe('tailgater')
  // hidden npcs are never offered as ordinary townsfolk
  expect(await page.evaluate(() => window.__hub.state.nearNpc)).toBeNull()
  await page.getByTestId('inspect').click()
  await expect(
    page.getByTestId('npc-dialogue').getByRole('heading', { name: 'Stranger at the door' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-dialogue')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sharlock.discoveries'))).toBe(
    '["tailgater"]',
  )
})
