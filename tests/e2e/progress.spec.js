import { randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { createAuthService } from '../../server/src/modules/auth/service.js'
import { parseRegistrationInput } from '../../server/src/modules/auth/policy.js'
import { userModel } from '../../server/src/models/User.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../server/src/modules/profile/how-to-play.js'
import { playSqlRun } from './fixtures/sql.js'

const gameNames = [
  'CLI Cyber Defender',
  'The Phishing Post-Mortem',
  'SQL Injection Arcade',
  'The daily briefing',
  'LLM Social Engineering Simulator',
  'Clearance Tower',
]

// each test gets its own student so progress starts empty
async function signedInContext(browser, baseURL, label) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Progress E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const origin = new URL(baseURL).origin
  const suffix = randomBytes(4).toString('hex')
  const email = `progress-${label}-${suffix}@example.test`
  const password = `${randomBytes(24).toString('base64url')}A!`
  const database = await connectDatabase(testUri)
  try {
    await createAuthService(database).register(
      parseRegistrationInput({
        email,
        username: `prog-${label}-${suffix}`,
        password,
        avatarId: 'mint',
      }),
    )
    await userModel(database).updateOne(
      { emailNormalized: email },
      { $set: { howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS] } },
    )
  } finally {
    await database.close()
  }
  const context = await browser.newContext()
  const csrf = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  const { csrfToken } = await csrf.json()
  const login = await context.request.post(new URL('/api/auth/login', baseURL).href, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { email, password },
  })
  if (!login.ok()) throw new Error('Could not authenticate the progress E2E session.')
  return context
}

async function openProgress(context) {
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  return page
}

test('a new student sees the empty state and every activity', async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await signedInContext(browser, baseURL, 'empty')
  try {
    const page = await openProgress(context)
    await page.goto('/progress')
    await expect(page.getByRole('heading', { name: 'Your learning progress.' })).toBeVisible()
    await expect(page.getByText('No results yet.')).toBeVisible()
    for (const name of gameNames)
      await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible()
    for (const id of [
      'cli-cyber-defender',
      'phishing-post-mortem',
      'sql-injection-arcade',
      'social-engineering-simulator',
      'clearance-tower',
    ])
      await expect(page.getByTestId(`game-${id}`).getByText('None yet')).toBeVisible()
    await expect(
      page.getByTestId('game-threat-briefing').getByText('Not a scored activity'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Still to find' })).toBeVisible()
    await expect(page.getByText('Locked', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Attempt history' })).toHaveCount(0)
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
    if (process.env.PROGRESS_SHOTS_DIR && testInfo.project.name === 'mobile-chromium')
      await page.screenshot({
        path: `${process.env.PROGRESS_SHOTS_DIR}/progress-empty-mobile.png`,
        fullPage: true,
      })
  } finally {
    await context.close()
  }
})

test('a completed G-SQL attempt appears in points, history and badges', async ({
  browser,
  baseURL,
}) => {
  const context = await signedInContext(browser, baseURL, 'sql')
  try {
    const page = await openProgress(context)
    // play a full run through the real UI so the server scores it
    await playSqlRun(page, 'personal')
    const score = await page
      .getByText(/^\d+ \/ \d+$/)
      .first()
      .innerText()

    const check = async () => {
      const game = page.getByTestId('game-sql-injection-arcade')
      await expect(game.getByText('Completed', { exact: true })).toBeVisible()
      await expect(game.locator('dd').nth(0)).toHaveText('1')
      await expect(game.locator('dd').nth(1)).toHaveText(score)
      const [points, outOf] = score.split(' / ').map(Number)
      await expect(game.locator('dd').nth(2)).toHaveText(
        `${Math.round((points * 100) / outOf)} / 100`,
      )
      const history = page.getByRole('table', { name: 'Completed attempts, newest first' })
      await expect(
        history.getByRole('row', { name: new RegExp(`SQL Injection Arcade ${score}`) }),
      ).toHaveCount(1)
      await expect(page.getByText('First clue').first()).toBeVisible()
      await expect(page.getByText('No results yet.')).toHaveCount(0)
    }

    await page.goto('/progress')
    await check()
    await page.reload()
    await check()
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
    if (process.env.PROGRESS_SHOTS_DIR && test.info().project.name !== 'mobile-chromium') {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.screenshot({
        path: `${process.env.PROGRESS_SHOTS_DIR}/progress-full-desktop.png`,
        fullPage: true,
      })
    }
    if (process.env.PROGRESS_SHOTS_DIR && test.info().project.name === 'mobile-chromium')
      await page.screenshot({
        path: `${process.env.PROGRESS_SHOTS_DIR}/progress-full-mobile.png`,
        fullPage: true,
      })
  } finally {
    await context.close()
  }
})
