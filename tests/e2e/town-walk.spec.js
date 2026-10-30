import { test, expect } from './fixtures/auth.js'
import { gameCatalog } from '../../client/src/data/gameCatalog.js'

test.beforeEach(async ({ page }) => {
  // the walker lives in the 2D town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

const feet = (page) =>
  page.getByTestId('town-player').evaluate((el) => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
  }))

// holds a key until the feet are within reach of the target on that axis
async function hold(page, key, axis, sign, target) {
  await page.keyboard.down(key)
  await expect
    .poll(async () => sign * ((await feet(page))[axis] - target), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(0)
  await page.keyboard.up(key)
}

test('walks with the keys to a door and opens the building with E', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'needs a physical keyboard')
  test.setTimeout(60_000)
  await page.goto('/dashboard')
  const player = page.getByTestId('town-player')
  await expect(player).toHaveAttribute('data-facing', 'down')
  const start = await feet(page)

  // the office door is at (330, 600), level with the start on open ground to the left
  const game = gameCatalog.find((item) => item.id === 'social-engineering-simulator')
  const door = { x: game.building.x + 96, y: game.building.y + 200 }
  // hold until just short of the door, then tap one step at a time until its prompt shows
  await hold(page, 'KeyA', 'x', -1, door.x + 50)
  await expect(player).toHaveAttribute('data-facing', 'left')
  expect((await feet(page)).x).toBeLessThan(start.x)
  await expect
    .poll(
      async () => {
        const count = await page.getByTestId('door-prompt').count()
        if (!count) await page.keyboard.press('KeyA')
        return count
      },
      { timeout: 20_000 },
    )
    .toBe(1)
  const prompt = page.getByTestId('door-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toHaveAccessibleName(`Enter ${game.name}`)
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('region', { name: game.name, exact: true })).toBeVisible()
})

test('walks to a tapped spot and does not walk after a drag', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'uses a mouse')
  await page.goto('/dashboard')
  const world = page.locator('.town-world')
  const before = await feet(page)
  const box = await world.boundingBox()
  const ratio = box.width / 1120
  // open street to the right of the start
  await page.mouse.click(box.x + (before.x + 70) * ratio, box.y + before.y * ratio)
  await expect
    .poll(async () => Math.abs((await feet(page)).x - (before.x + 70)), { timeout: 10_000 })
    .toBeLessThan(3)

  const after = await feet(page)
  const frame = await page.getByRole('region', { name: 'Interactive town map' }).boundingBox()
  await page.mouse.move(frame.x + 80, frame.y + 80)
  await page.mouse.down()
  await page.mouse.move(frame.x + 160, frame.y + 120, { steps: 6 })
  await page.mouse.up()
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  expect(await feet(page)).toEqual(after)
})

test('keys are ignored while the menu is open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'needs a physical keyboard')
  await page.goto('/dashboard')
  const before = await feet(page)
  await page.getByTestId('menu-button').click()
  await expect(page.getByTestId('site-menu')).toBeVisible()
  await page.keyboard.down('KeyD')
  await page.keyboard.up('KeyD')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('site-menu')).toBeHidden()
  expect(await feet(page)).toEqual(before)
})

test('shows one still pose under reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'needs a physical keyboard')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dashboard')
  const art = page.getByTestId('town-player').locator('svg')
  const still = await art.innerHTML()
  const start = await feet(page)
  await page.keyboard.down('KeyD')
  await expect.poll(async () => (await feet(page)).x).toBeGreaterThan(start.x + 20)
  const facingRight = await art.innerHTML()
  expect(facingRight).not.toBe(still)
  await expect.poll(async () => (await feet(page)).x).toBeGreaterThan(start.x + 80)
  expect(await art.innerHTML()).toBe(facingRight)
  await page.keyboard.up('KeyD')
})

// holds a key to roughly the target, then taps it a step at a time until the talk prompt shows
async function walkToTalk(page, key, axis, sign, target) {
  await hold(page, key, axis, sign, target)
  await expect
    .poll(
      async () => {
        const count = await page.getByTestId('talk-prompt').count()
        if (!count) await page.keyboard.press(key)
        return count
      },
      { timeout: 20_000 },
    )
    .toBe(1)
}

test('talks to a keeper with E and steps through the dialogue', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'needs a physical keyboard')
  test.setTimeout(60_000)
  await page.goto('/dashboard')
  // the publican stands left of the office door on the start row
  await walkToTalk(page, 'KeyA', 'x', -1, 300)
  await expect(page.getByTestId('talk-prompt')).toHaveAccessibleName('Talk to Publican')
  await page.keyboard.press('KeyE')
  const dialogue = page.getByTestId('npc-dialogue')
  await expect(dialogue).toBeVisible()
  await expect(dialogue.getByRole('heading', { name: 'Publican' })).toBeVisible()
  const first = await page.getByTestId('npc-line').innerText()
  await page.keyboard.press('KeyE')
  await expect(page.getByTestId('npc-line')).not.toHaveText(first)
  await page.keyboard.press('Escape')
  await expect(dialogue).toBeHidden()
})

test('finds a discovery with E and the Menu count goes up', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'needs a physical keyboard')
  test.setTimeout(60_000)
  await page.goto('/dashboard')
  // the lost memory stick lies in the east yard on the start row
  await walkToTalk(page, 'KeyD', 'x', 1, 1000)
  await page.keyboard.press('KeyE')
  const dialogue = page.getByTestId('npc-dialogue')
  await expect(dialogue.getByRole('heading', { name: 'Lost memory stick' })).toBeVisible()
  await dialogue.getByRole('button', { name: 'Next' }).click()
  await dialogue.getByRole('button', { name: 'Got it' }).click()
  await expect(dialogue).toBeHidden()
  await page.getByTestId('menu-button').click()
  await expect(page.getByTestId('menu-discoveries')).toContainText('1/6')
})
