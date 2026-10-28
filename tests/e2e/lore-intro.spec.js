import { test, expect } from './fixtures/auth.js'

// the software renderer builds the wharf slowly
test.setTimeout(240000)
const slow = { timeout: 120000 }

const FIRST_CARD = 'London, 1880.'
const SECOND_CARD = /The telegraph has wired the British Empire together/

function newsFixture() {
  const now = Date.now()
  return {
    provider: 'The Guardian',
    section: 'cybersecurity',
    range: 'week',
    dateKey: new Date(now).toISOString().slice(0, 10),
    timezone: 'Asia/Singapore',
    editionLimit: 50,
    window: {
      from: new Date(now - 7 * 86400000).toISOString(),
      to: new Date(now + 86400000).toISOString(),
    },
    articles: [],
    fetchedAt: new Date(now).toISOString(),
    freshUntil: new Date(now + 1800000).toISOString(),
    expiresAt: new Date(now + 23 * 3600000).toISOString(),
    refreshAvailableAt: new Date(now + 1800000).toISOString(),
    stale: false,
    partial: false,
  }
}

// no seen key here, so the intro plays on first entry
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.hubForce3d', '1')
    localStorage.setItem('sharlock.hubWatchManual', '1')
  })
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  await page.route('https://static.guim.co.uk/**', (route) => route.abort())
  await page.route('**/api/news**', (route) => route.fulfill({ json: newsFixture() }))
})

async function hubReady(page) {
  await page.waitForFunction(
    () => window.__hub?.state.ready === true || /unavailable/.test(document.body.innerText),
    null,
    slow,
  )
  expect(await page.evaluate(() => window.__hub?.state.ready)).toBe(true)
}

const intro = (page) => page.getByRole('dialog', { name: 'Introduction' })

test('first entry shows the intro, Skip intro reveals the hub and a reload skips it', async ({
  page,
}) => {
  await page.goto('/')
  await expect(intro(page)).toBeVisible()
  await expect(intro(page).getByText(FIRST_CARD)).toBeVisible()
  const skip = intro(page).getByRole('button', { name: /skip intro/i })
  await expect(skip).toBeVisible()
  await skip.click()
  await expect(intro(page)).toHaveCount(0)
  await hubReady(page)

  await page.reload()
  await hubReady(page)
  await expect(intro(page)).toHaveCount(0)
})

test('Enter advances a card and Space skips the intro', async ({ page }) => {
  await page.goto('/')
  await expect(intro(page).getByText(FIRST_CARD)).toBeVisible()
  await intro(page).focus()
  await page.keyboard.press('Enter')
  await expect(intro(page).getByText(SECOND_CARD)).toBeVisible()
  await page.keyboard.press('Space')
  await expect(intro(page)).toHaveCount(0)
})

test('Replay intro shows the intro again after it was seen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sharlock.loreIntroSeen', '1'))
  await page.goto('/')
  await hubReady(page)
  await expect(intro(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Replay intro', exact: true }).click()
  await expect(intro(page).getByText(FIRST_CARD)).toBeVisible()
})

test('reduced motion waits for Continue instead of auto-advancing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(intro(page).getByText(FIRST_CARD)).toBeVisible()
  const next = intro(page).getByRole('button', { name: 'Continue' })
  await expect(next).toBeVisible()
  await next.click()
  await expect(intro(page).getByText(SECOND_CARD)).toBeVisible()
})
