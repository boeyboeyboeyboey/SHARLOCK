import { test, expect } from './fixtures/auth.js'
import { npcs } from '../../client/src/features/hub/scenes/wharf/npcs.js'

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

// below 992px the destination list starts collapsed
async function pickDest(page, id) {
  const toggle = page.getByTestId('destinations-toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await page.getByTestId(`dest-${id}`).click()
}

async function hubReady(page) {
  await page.waitForFunction(
    () => window.__hub?.state.ready === true || /unavailable/.test(document.body.innerText),
    null,
    slow,
  )
  expect(await page.evaluate(() => window.__hub?.state.ready)).toBe(true)
}

test('talks to a game keeper, reads every line and goes in', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  const lines = await page.evaluate(() => window.__hub.debug.npcs())
  expect(lines).toHaveLength(npcs.filter((npc) => npc.kind !== 'hidden').length)

  await pickDest(page, 'cli-cyber-defender')
  await expect
    .poll(() => page.evaluate(() => window.__hub.state.nearNpc), slow)
    .toBe('telegraph-clerk')
  const talk = page.getByTestId('talk')
  await expect(talk).toHaveAccessibleName('Talk to Telegraph clerk')
  await talk.click()

  const dialogue = page.getByTestId('npc-dialogue')
  await expect(dialogue).toBeVisible()
  await expect(dialogue.getByRole('heading', { name: 'Telegraph clerk' })).toBeVisible()
  await expect(page.getByTestId('hub-status')).toHaveText('Talking to Telegraph clerk')
  await expect(dialogue).toBeFocused()

  // movement is paused while talking
  const before = await page.evaluate(() => window.__hub.debug.position())
  await page.keyboard.down('KeyW')
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await page.keyboard.up('KeyW')
  const after = await page.evaluate(() => window.__hub.debug.position())
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05)

  const next = page.getByTestId('npc-next')
  let count = 1
  while (await next.isVisible()) {
    await next.click()
    count += 1
  }
  expect(count).toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('npc-close')).toHaveText('Close')
  await page.getByTestId('npc-enter').click()
  await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)
})

test('Escape closes the talk panel first and hands focus to Enter at the keeper door', async ({
  page,
}) => {
  await page.goto('/')
  await hubReady(page)
  await pickDest(page, 'cli-cyber-defender')
  await expect(page.getByTestId('talk')).toBeVisible(slow)
  await page.getByTestId('talk').click()
  await expect(page.getByTestId('npc-dialogue')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
  await expect(page.getByTestId('enter')).toBeFocused()
  // the pick survives the first Escape and goes on the second
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'false')
})

test('Return goes in after closing the keeper chat', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await pickDest(page, 'cli-cyber-defender')
  await expect(page.getByTestId('talk')).toBeVisible(slow)
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-dialogue')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)
})

test('E talks to the nearby keeper and E does nothing when nobody is near', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
  await pickDest(page, 'cli-cyber-defender')
  await expect(page.getByTestId('talk')).toBeVisible(slow)
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-dialogue')).toBeVisible()
  await expect(page.getByTestId('hub-status')).toHaveText('Talking to Telegraph clerk')
})

test('a wanderer talks, then says bye', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await page.evaluate(() => window.__hub.debug.teleport(-2.2, 66.3))
  await expect.poll(() => page.evaluate(() => window.__hub.state.nearNpc), slow).toBe('fisherman')
  await expect(page.getByTestId('enter')).toHaveCount(0)
  await page.getByTestId('talk').click()
  await expect(
    page.getByTestId('npc-dialogue').getByRole('heading', { name: 'Fisherman' }),
  ).toBeVisible()
  await expect(page.getByTestId('npc-line')).not.toBeEmpty()
  await expect(page.getByTestId('npc-enter')).toHaveCount(0)
  const bye = page.getByTestId('npc-close')
  await expect(bye).toHaveText(/Next|Bye/)
  while ((await bye.count()) === 0 || (await bye.innerText()) !== 'Bye') {
    await page.getByTestId('npc-next').click()
  }
  await bye.click()
  await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test('a patrolling wanderer can be talked to at its live position', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await page.evaluate(() => window.__hub.debug.freezeNpcs(true))
  const lamplighter = await page.evaluate(() =>
    window.__hub.debug.npcs().find((n) => n.id === 'lamplighter'),
  )
  await page.evaluate(({ x, z }) => window.__hub.debug.teleport(x, z - 1.5), lamplighter)
  await expect.poll(() => page.evaluate(() => window.__hub.state.nearNpc), slow).toBe('lamplighter')
  const still = await page.evaluate(() =>
    window.__hub.debug.npcs().find((n) => n.id === 'lamplighter'),
  )
  expect(Math.hypot(still.x - lamplighter.x, still.z - lamplighter.z)).toBeLessThan(0.01)
  await page.getByTestId('talk').click()
  await expect(
    page.getByTestId('npc-dialogue').getByRole('heading', { name: 'Lamplighter' }),
  ).toBeVisible()
})

for (const [width, height] of [
  [667, 375],
  [568, 320],
]) {
  test.describe(`a talk on a ${width}x${height} touch screen`, () => {
    test.use({ viewport: { width, height } })

    test('reads every line and clicks every talk button', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'touch layout only')
      await page.goto('/')
      await hubReady(page)
      await pickDest(page, 'cli-cyber-defender')
      await expect(page.getByTestId('talk')).toBeVisible(slow)
      await page.getByTestId('talk').click({ timeout: 5000 })

      const line = page.getByTestId('npc-line')
      const next = page.getByTestId('npc-next')
      await expect(line).toBeInViewport({ ratio: 1 })
      while (await next.isVisible()) {
        await next.click({ timeout: 5000 })
        await line.scrollIntoViewIfNeeded()
        await expect(line).toBeInViewport({ ratio: 1 })
      }

      // the controls that still work during a talk stay clear of the panel
      const panel = await page.getByTestId('npc-dialogue').boundingBox()
      for (const control of [
        page.getByTestId('menu-button'),
        page.getByRole('button', { name: /^sound (on|off)$/i }),
        page.getByTestId('destinations-toggle'),
        page.getByTestId('hub-map-toggle'),
        page.getByTestId('hub-jump'),
        page.getByTestId('hub-sprint'),
        page.locator('.hub-joystick'),
      ]) {
        const box = await control.boundingBox()
        const apart =
          box.x >= panel.x + panel.width ||
          box.x + box.width <= panel.x ||
          box.y >= panel.y + panel.height ||
          box.y + box.height <= panel.y
        expect(apart, `${control} overlaps the talk panel`).toBe(true)
      }

      await page.getByTestId('npc-close').click({ timeout: 5000 })
      await expect(page.getByTestId('npc-dialogue')).toHaveCount(0)
      // the keeper of the picked door hands focus to Enter
      await expect(page.getByTestId('enter')).toBeFocused()
      await page.getByTestId('talk').click({ timeout: 5000 })
      while (await next.isVisible()) await next.click({ timeout: 5000 })
      await page.getByTestId('npc-enter').click({ timeout: 5000 })
      await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)
    })
  })
}
