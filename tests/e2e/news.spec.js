import { test, expect } from './fixtures/auth.js'

function fixture(section = 'cybersecurity', range = 'week', overrides = {}) {
  const now = Date.now()
  return {
    provider: 'The Guardian',
    section,
    range,
    dateKey: new Date(now).toISOString().slice(0, 10),
    timezone: 'Asia/Singapore',
    editionLimit: 50,
    window: {
      from: new Date(now - 7 * 86400000).toISOString(),
      to: new Date(now + 86400000).toISOString(),
    },
    articles: Array.from({ length: 23 }, (_, index) => ({
      id: `${section}/${index}`,
      title: `Synthetic ${section} headline ${index + 1}`,
      url: `https://www.theguardian.com/test/${index}`,
      publishedAt: new Date(now - index * 60000).toISOString(),
      byline: [{ type: 'text', text: 'Fixture reporter' }],
      excerpt: [
        {
          type: 'text',
          text:
            index === 15
              ? 'A unique passkey dispatch for local search.'
              : 'This is synthetic test content, never a real published story.',
        },
      ],
      copyright: '',
    })),
    fetchedAt: new Date(now).toISOString(),
    freshUntil: new Date(now + 1800000).toISOString(),
    expiresAt: new Date(now + 23 * 3600000).toISOString(),
    refreshAvailableAt: new Date(now + 1800000).toISOString(),
    stale: false,
    partial: false,
    ...overrides,
  }
}

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  await page.route('https://static.guim.co.uk/**', (route) => route.abort())
})

async function feed(page, callback = () => {}) {
  await page.route('**/api/news**', (route) => {
    const url = new URL(route.request().url())
    callback(url)
    return route.fulfill({
      json: fixture(
        url.searchParams.get('section') || 'cybersecurity',
        url.searchParams.get('range') || 'week',
      ),
    })
  })
}

test('opens the newspaper directly and preserves town camera, focus, audio and history', async ({
  page,
}, testInfo) => {
  await feed(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByLabel('Jump to').selectOption('threat-briefing')
  await page.getByRole('button', { name: 'Close activity details' }).click()
  const building = page.getByRole('button', { name: 'Explore The daily briefing', exact: true })
  const transform = await page.locator('.town-world').evaluate((node) => node.style.transform)
  await page.locator('.town-world').evaluate((node) => {
    window.newsTownElement = node
  })
  if (testInfo.project.name === 'mobile-chromium') await building.tap()
  else await building.click()
  const dialog = page.getByRole('dialog', { name: 'The Sharlock Times' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/games\/threat-briefing$/)
  await expect(dialog.getByRole('heading', { name: 'The Sharlock Times' })).toBeFocused()
  await expect(dialog.locator('.gazette-article')).toHaveCount(10)
  await page.keyboard.press('Shift+Tab')
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement)),
    )
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL('/')
  await expect(building).toBeFocused()
  expect(
    await page.locator('.town-world').evaluate((node) => node === window.newsTownElement),
  ).toBe(true)
  expect(await page.locator('.town-world').evaluate((node) => node.style.transform)).toBe(transform)
  await expect(page.locator('.town-audio audio')).toHaveCount(1)
  await page.goForward()
  await expect(dialog).toBeVisible()
  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect(page).toHaveURL('/')
})

test('shares sections and filters while local search and pagination spend no requests', async ({
  page,
}) => {
  const requests = []
  await feed(page, (url) => requests.push(url.search))
  await page.goto('/games/threat-briefing')
  const dialog = page.getByRole('dialog', { name: 'The Sharlock Times' })
  await expect(dialog.locator('.gazette-article')).toHaveCount(10)
  await page.getByRole('button', { name: 'Newspaper page 2', exact: true }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Synthetic cybersecurity headline 11', exact: false }),
  ).toBeVisible()
  if (!(await page.getByLabel('Search this edition').isVisible()))
    await page.locator('.gazette-browse summary').click()
  await page.getByLabel('Search this edition').fill('passkey')
  await expect(dialog.locator('.gazette-article')).toHaveCount(1)
  await expect(page).toHaveURL(/q=passkey/)
  expect(requests).toHaveLength(1)
  await page.getByLabel('Search this edition').fill('')
  await expect(page).not.toHaveURL(/[?&]q=/)
  await page.getByRole('button', { name: 'Technology', exact: true }).click()
  await expect(dialog.locator('.gazette-article').first()).toContainText('Synthetic technology')
  await page.getByRole('combobox', { name: 'Edition', exact: true }).selectOption('month')
  await expect(page).toHaveURL(/section=technology&range=month/)
  await expect(dialog.locator('.gazette-article')).toHaveCount(10)
  expect(requests).toHaveLength(3)
  const articleLink = dialog.getByRole('link', { name: /Read at The Guardian/ }).first()
  await expect(articleLink).toHaveAttribute('target', '_blank')
  await expect(articleLink).toHaveAttribute('rel', 'noopener noreferrer')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Technology', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect(page).toHaveURL('/')
})

test('shows failures, permits retry, and explains empty and stale editions', async ({ page }) => {
  let mode = 'failure'
  await page.route('**/api/news**', (route) => {
    if (mode === 'failure')
      return route.fulfill({
        status: 503,
        json: {
          error: { code: 'NEWS_UNAVAILABLE', message: 'The news desk is temporarily unavailable.' },
          refreshAvailableAt: new Date(Date.now() + 1000).toISOString(),
        },
      })
    return route.fulfill({
      json: fixture(
        'cybersecurity',
        'week',
        mode === 'empty'
          ? { articles: [] }
          : { freshUntil: new Date(Date.now() - 1000).toISOString(), stale: true, partial: true },
      ),
    })
  })
  await page.goto('/games/threat-briefing')
  await expect(
    page.getByRole('dialog', { name: 'The Sharlock Times' }).locator('.gazette-status'),
  ).toContainText('temporarily unavailable')
  mode = 'empty'
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect(page.getByRole('heading', { name: 'A quiet news desk' })).toBeVisible()
  mode = 'stale'
  await page.reload()
  await expect(
    page.getByRole('dialog', { name: 'The Sharlock Times' }).locator('.gazette-status'),
  ).toContainText('cached edition')
  await expect(
    page.getByRole('dialog', { name: 'The Sharlock Times' }).locator('.gazette-status'),
  ).toContainText('Some stories')
})

test('handles direct malformed links, keyboard close and leaving without style or scroll locks', async ({
  page,
}) => {
  await feed(page)
  await page.goto('/games/threat-briefing?section=bad&q[]=x&page=100&url=unsafe')
  await expect(page).toHaveURL(/\/games\/threat-briefing$/)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect(page).toHaveURL('/')
  await page.getByLabel('Jump to').selectOption('sql-injection-arcade')
  await page
    .getByRole('region', { name: 'SQL Injection Arcade', exact: true })
    .getByRole('link', { name: 'Enter activity' })
    .click()
  await expect(page).toHaveURL(/\/games\/sql-injection-arcade$/)
  await expect(page.getByRole('dialog', { name: 'The Sharlock Times' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('fits newspaper layouts and provides visible focus at supported widths', async ({ page }) => {
  await feed(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/games/threat-briefing')
  const dialog = page.getByRole('dialog', { name: 'The Sharlock Times' })
  await expect(dialog.locator('.gazette-article')).toHaveCount(10)
  for (const width of [375, 576, 767, 768, 992, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await expect(page.getByRole('button', { name: 'Close newspaper' })).toBeVisible()
  }
  await page.setViewportSize({ width: 667, height: 375 })
  await page.getByRole('button', { name: 'Next newspaper page' }).click()
  await expect(page.getByRole('button', { name: 'Close newspaper' })).toBeInViewport()
  await expect(dialog).toHaveCSS('animation-name', 'none')
  await page.getByRole('tab', { name: 'OWASP Top 10' }).click()
  for (const width of [375, 576, 767, 768, 992, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 667, height: 375 })
  await page.locator('.owasp-risks summary').last().click()
  await expect(page.getByRole('button', { name: 'Close newspaper' })).toBeInViewport()
  await expect(page.locator('.gazette-sound')).toBeInViewport()
})

test('opens the OWASP reference without news requests and preserves news filters across accessible tabs', async ({
  page,
}) => {
  const requests = []
  await feed(page, (url) => requests.push(url.search))
  await page.goto('/games/threat-briefing?tab=owasp&section=technology&range=month&page=2')
  const owaspTab = page.getByRole('tab', { name: 'OWASP Top 10' })
  const newsTab = page.getByRole('tab', { name: 'Latest news' })
  const guide = page.getByRole('tabpanel', { name: 'OWASP Top 10' })
  await expect(owaspTab).toHaveAttribute('aria-selected', 'true')
  await expect(guide.getByRole('heading', { name: 'Ten risks worth recognising' })).toBeVisible()
  await expect(guide.locator('details')).toHaveCount(10)
  await expect(guide).toContainText('2025 EDITION')
  await expect(
    guide.getByRole('heading', { name: 'Broken Access Control', exact: true }),
  ).toBeVisible()
  await expect(
    guide.getByRole('heading', { name: 'Software Supply Chain Failures', exact: true }),
  ).toBeVisible()
  const last = guide.locator('details').last()
  await last.locator('summary').click()
  await expect(last).toContainText('fail securely')
  const source = last.getByRole('link', { name: /Read A10 at OWASP/ })
  await expect(source).toHaveAttribute(
    'href',
    'https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/',
  )
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(guide.getByRole('link', { name: /CC BY 3.0/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Powered by The Guardian' })).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await owaspTab.focus()
  await page.keyboard.press('Home')
  await expect(newsTab).toBeFocused()
  await expect(owaspTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(newsTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.gazette-article').first()).toContainText(
    'Synthetic technology headline 11',
  )
  expect(requests).toEqual(['?section=technology&range=month'])
  await page.keyboard.press('End')
  await expect(owaspTab).toBeFocused()
  await page.keyboard.press('Space')
  await expect(guide).toBeVisible()
  await expect(page).toHaveURL(/tab=owasp&section=technology&range=month&page=2/)
  await page.reload()
  await expect(guide).toBeVisible()
  expect(requests).toHaveLength(1)
  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect(page).toHaveURL('/')
})

test('plays the supplied newspaper loop, keeps one player across tabs and restores town sound on close', async ({
  page,
}) => {
  await feed(page)
  await page.goto('/')
  const townAudio = page.locator('.town-audio audio')
  // autoplay may be blocked until the first interaction
  const mute = page.getByRole('button', { name: 'Mute town sound' })
  if (!(await mute.isVisible())) await page.mouse.click(1, 1)
  await expect(mute).toBeVisible()
  await expect.poll(() => townAudio.evaluate((el) => !el.paused && !el.muted)).toBe(true)
  await page.getByLabel('Jump to').selectOption('threat-briefing')
  const mediaResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3'),
  )
  await page.getByRole('link', { name: 'Read the Times', exact: true }).click()
  const response = await mediaResponse
  expect([200, 206]).toContain(response.status())
  expect(response.headers()['content-type']).toContain('audio/')
  const newspaperAudio = page.locator('.gazette-audio audio')
  await expect
    .poll(() => newspaperAudio.evaluate((el) => !el.paused && !el.muted && el.currentTime > 0))
    .toBe(true)
  expect(await newspaperAudio.evaluate((el) => ({ loop: el.loop, volume: el.volume }))).toEqual({
    loop: true,
    volume: 0.2,
  })
  expect(await townAudio.evaluate((el) => el.paused && el.muted)).toBe(true)
  const handle = await newspaperAudio.elementHandle()
  await page.getByRole('tab', { name: 'OWASP Top 10' }).click()
  expect(await handle.evaluate((el) => el.isConnected && !el.paused)).toBe(true)
  await page.getByRole('button', { name: 'Mute newspaper sound' }).click()
  expect(await handle.evaluate((el) => el.paused && el.muted)).toBe(true)
  await page.getByRole('tab', { name: 'Latest news' }).click()
  expect(await handle.evaluate((el) => el.paused && el.muted)).toBe(true)
  await page.getByRole('button', { name: 'Play newspaper sound' }).click()
  await expect.poll(() => handle.evaluate((el) => !el.paused && !el.muted)).toBe(true)
  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect
    .poll(() => handle.evaluate((el) => el.paused && el.muted && !el.isConnected))
    .toBe(true)
  await expect.poll(() => townAudio.evaluate((el) => !el.paused && !el.muted)).toBe(true)
  await page.getByLabel('Jump to').selectOption('sql-injection-arcade')
  await page
    .getByRole('region', { name: 'SQL Injection Arcade', exact: true })
    .getByRole('link', { name: 'Enter activity' })
    .click()
  await expect(page.locator('audio')).toHaveCount(0)
})

test('recovers from blocked autoplay and keeps the reference readable when audio is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    let blocked = false
    HTMLMediaElement.prototype.play = function () {
      if (this.src.endsWith('Lo-fi_8-bit_coffee_s_1-1789752418868.mp3') && !blocked) {
        blocked = true
        return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'))
      }
      return play.call(this)
    }
  })
  await page.goto('/games/threat-briefing?tab=owasp')
  await expect(page.locator('.gazette-audio-status')).toContainText('Tap Sound')
  const sound = page.getByRole('button', { name: 'Play newspaper sound' })
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await sound.click()
  await expect
    .poll(() => page.locator('.gazette-audio audio').evaluate((el) => !el.paused && !el.muted))
    .toBe(true)
  await expect(page.locator('.gazette-audio-status')).toHaveCount(0)
  await page.route('**/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3', (route) => route.abort())
  await page.reload()
  await sound.click()
  await expect(page.locator('.gazette-audio-status')).toContainText('try again')
  await expect(page.getByRole('heading', { name: 'Ten risks worth recognising' })).toBeVisible()
  await expect(sound).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(page.locator('.town-audio audio')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^(Turn on|Mute) town sound$/ })).toBeVisible()
})
