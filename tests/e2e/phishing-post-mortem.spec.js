import { test, expect } from './fixtures/auth.js'
import { randomBytes } from 'node:crypto'
import { seedClass, signedInPage } from './fixtures/class.js'
import { jumpToBuilding } from './fixtures/town.js'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { generateRound } from '../../server/src/modules/games/phishing-post-mortem/triage/generator/index.js'

const ACTIONS = /\/api\/attempts\/[^/]+\/actions$/
const START = /\/api\/games\/phishing-post-mortem\/attempts$/
const ANSWER_FIELDS = ['tellPartIds', 'verdict', 'explanation', 'seed']

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

const reportButton = (page) => page.getByRole('button', { name: 'Report', exact: true })
const trustButton = (page) => page.getByRole('button', { name: 'Trust', exact: true })
const nextButton = (page) => page.getByRole('button', { name: /^(Next email|See results)$/ })
const partButtons = (page) =>
  page.getByRole('button', {
    name: /^Report (sender|reply-to|link|attachment|QR code|request|message text):/,
  })
const runComplete = (page) => page.getByRole('heading', { name: 'Case closed' })
const attemptIdOf = (page) => new URL(page.url()).searchParams.get('attempt')

// the disposable test database is the seam for a run's seed and for moving its deadline
async function withAttempts(work) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Phishing E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const database = await connectDatabase(testUri)
  try {
    return await work(database.db.collection('game_attempts'), database.base.Types.ObjectId)
  } finally {
    await database.close()
  }
}

const readSeed = (attemptId) =>
  withAttempts(
    async (attempts, ObjectId) =>
      (await attempts.findOne({ _id: new ObjectId(attemptId) })).state.seed,
  )

const expireDeadline = (attemptId) =>
  withAttempts((attempts, ObjectId) => {
    const past = Date.now() - 1000
    return attempts.updateOne(
      { _id: new ObjectId(attemptId) },
      { $set: { startedAt: new Date(past - 180000), deadlineAt: new Date(past) } },
    )
  })

const PART_LABELS = {
  sender: 'sender',
  replyTo: 'reply-to',
  link: 'link',
  attachment: 'attachment',
  qr: 'QR code',
  request: 'request',
  body: 'message text',
}

async function startRun(page, contextOption = 'personal') {
  await page.goto('/games/phishing-post-mortem')
  await expect(page.getByRole('heading', { name: 'The Phishing Post-Mortem' })).toBeVisible()
  await page.getByLabel('Save this run to').selectOption(contextOption)
  await page.getByRole('button', { name: 'Start run' }).click()
  await expect(page).toHaveURL(/attempt=/)
  await expect(reportButton(page)).toBeVisible()
}

// one call on the current email; resolves with the action response body
async function call(page, how) {
  const responded = page.waitForResponse(
    (response) => ACTIONS.test(response.url()) && response.request().method() === 'POST',
  )
  if (how === 'report') {
    await reportButton(page).click()
    await expect(page.getByText('Tap what gave it away', { exact: true })).toBeVisible()
    await partButtons(page).first().click()
  } else {
    await trustButton(page).click()
  }
  const response = await responded
  expect(response.status()).toBe(200)
  return response.json()
}

async function playPractice(page, rounds) {
  for (let round = 0; round < rounds; round += 1) {
    await call(page, round % 2 === 0 ? 'trust' : 'report')
    await expect(nextButton(page)).toBeVisible()
    await nextButton(page).click()
  }
}

test('a personal practice run plays 12 emails, shows the debrief and saves', async ({ page }) => {
  await startRun(page)
  await expect(page.getByText('Email 1 of 12')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)

  await call(page, 'report')
  await expect(page.getByText(/Your call was (right|wrong)/)).toBeVisible()
  await expect(nextButton(page)).toBeFocused()
  await nextButton(page).click()
  await expect(page.getByText('Email 2 of 12')).toBeVisible()
  await call(page, 'trust')
  await nextButton(page).click()

  await playPractice(page, 9)
  await call(page, 'trust')
  await page.getByRole('button', { name: 'See results' }).click()
  await expect(runComplete(page)).toBeVisible()
  await expect(runComplete(page)).toBeInViewport()
  await expect(page.getByText('All 12 emails checked')).toBeVisible()
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
  // the review list can be long, so play again also sits above it
  await page.getByRole('button', { name: 'Play again' }).first().click()
  await expect(page).not.toHaveURL(/attempt=/)
  await expect(page.getByRole('heading', { name: 'Start a run' })).toBeVisible()
})

test('practice hints come in two tiers, are free and show in the feedback', async ({ page }) => {
  await startRun(page)
  const hintButton = page.getByRole('button', { name: 'Hint', exact: true })
  const hints = page.getByRole('region', { name: 'Hints' })
  const hinted = (response) =>
    ACTIONS.test(response.url()) &&
    response.request().method() === 'POST' &&
    response.request().postDataJSON().type === 'triage-hint'

  const first = page.waitForResponse(hinted)
  await hintButton.click()
  expect((await first).status()).toBe(200)
  await expect(hints.getByRole('listitem')).toHaveCount(1)

  await page.getByRole('button', { name: 'Another hint' }).click()
  await expect(hints.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'No more hints' })).toBeDisabled()

  await call(page, 'trust')
  await expect(page.getByText('Hint used', { exact: true })).toBeVisible()
  await nextButton(page).click()
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
})

test('a class run is timed and ends on the third mistake, then ranks on the class board', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
    await startRun(page, seeded.classId)
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByText('Mistakes 0 of 3')).toBeVisible()
    await expect(page.getByRole('button', { name: /hint/i })).toHaveCount(0)

    // trusting every email hits three mistakes long before three minutes pass
    let mistakes = 0
    for (let step = 0; step < 60 && mistakes < 3; step += 1) {
      const body = await call(page, 'trust')
      mistakes = body.publicState.mistakes
    }
    expect(mistakes).toBe(3)
    await expect(runComplete(page)).toBeVisible()
    await expect(page.getByText('Ended on the third mistake')).toBeVisible()
    await expect(page.getByText('Result saved to your account.')).toBeVisible()

    await page.goto('/leaderboard')
    await expect(
      page.getByRole('heading', { level: 2, name: /The Phishing Post-Mortem/ }),
    ).toBeVisible()
    await expect(page.getByText('Timed runs')).toBeVisible()
    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
  } finally {
    await context.close()
  }
})

test('never sends the answer key or seed before a call and shows no links', async ({ page }) => {
  const started = page.waitForResponse(
    (response) => START.test(response.url()) && response.request().method() === 'POST',
  )
  await startRun(page)
  const text = await (await started).text()
  const state = JSON.parse(text).publicState
  expect(state.last).toBeNull()
  for (const field of ANSWER_FIELDS) expect(Object.keys(state.current)).not.toContain(field)
  expect(text).not.toMatch(/\b[0-9a-f]{32}\b/)
  await expect(page.getByRole('article').getByRole('link')).toHaveCount(0)
})

test('reporting moves focus to the first part and Escape cancels', async ({ page }) => {
  await startRun(page)
  await reportButton(page).click()
  await expect(partButtons(page).first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(partButtons(page)).toHaveCount(0)
  await expect(reportButton(page)).toBeFocused()
})

test('a reload mid-run resumes the same attempt', async ({ page }) => {
  await startRun(page)
  await call(page, 'trust')
  await nextButton(page).click()
  await expect(page.getByText('Email 2 of 12')).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/attempt=/)
  await expect(page.getByText('Email 2 of 12')).toBeVisible()
  await expect(page.getByText('Start a run')).toHaveCount(0)
})

test('recovers from a rejected call without losing the run', async ({ page }) => {
  await startRun(page)
  let rejectFirst = true
  await page.route(ACTIONS, async (route) => {
    if (rejectFirst) {
      rejectFirst = false
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'The service is unavailable. Try again.' } }),
      })
      return
    }
    await route.continue()
  })
  await trustButton(page).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(nextButton(page)).toBeVisible()
})

test('opens How to play from the start screen', async ({ page }) => {
  await page.goto('/games/phishing-post-mortem')
  await page.getByRole('button', { name: 'How to play' }).click()
  const guide = page.getByRole('dialog', { name: 'How to play: The Phishing Post-Mortem' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Start playing' }).click()
  await expect(guide).toBeHidden()
})

test('a class run that reaches its deadline saves as Time up and reopens on its debrief', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await startRun(page, seeded.classId)
    await expireDeadline(attemptIdOf(page))
    await page.reload()
    await expect(page.getByText("Time's up")).toBeVisible()
    await expect(page.getByText('Result saved to your account.')).toBeVisible()
    await page.reload()
    await expect(runComplete(page)).toBeVisible()
    await expect(page.getByText("Time's up")).toBeVisible()
    await expect(reportButton(page)).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('reporting the real tell earns the bonus and marks what gave it away', async ({ page }) => {
  await startRun(page)
  const seed = await readSeed(attemptIdOf(page))
  for (let roundIndex = 0; roundIndex < 12; roundIndex += 1) {
    const { email, answer } = generateRound({ seed, roundIndex })
    if (answer.verdict !== 'phish') {
      await call(page, 'trust')
      await nextButton(page).click()
      continue
    }
    const tell = email.parts.find((part) => answer.tellPartIds.includes(part.id))
    await reportButton(page).click()
    const responded = page.waitForResponse((response) => ACTIONS.test(response.url()))
    await page
      .getByRole('button', { name: new RegExp(`^Report ${PART_LABELS[tell.kind]}:`) })
      .first()
      .click()
    const body = await (await responded).json()
    expect(body.publicState.last.tellHit).toBe(true)
    // an email can have two tells, and each one is marked
    await expect(page.getByText('What gave it away', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(`+${body.publicState.last.points} points`)).toBeVisible()
    return
  }
  throw new Error('no phish in twelve rounds')
})

test('keyboard focus stays on the hint button while a hint loads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard journey')
  await startRun(page)
  const hint = page.getByRole('button', { name: 'Hint', exact: true })
  await hint.focus()
  await page.keyboard.press('Enter')
  const another = page.getByRole('button', { name: 'Another hint' })
  await expect(another).toBeFocused()
  await expect(page.getByRole('region', { name: 'Hints' }).getByRole('listitem')).toHaveCount(1)
  await page.keyboard.press('Enter')
  const spent = page.getByRole('button', { name: 'No more hints' })
  await expect(spent).toBeFocused()
  await expect(page.getByRole('region', { name: 'Hints' }).getByRole('listitem')).toHaveCount(2)
  // the hint stays readable while the player picks the part
  await reportButton(page).click()
  await expect(page.getByRole('region', { name: 'Hints' }).getByRole('listitem')).toHaveCount(2)
})

for (const size of [
  { width: 375, height: 667 },
  { width: 1200, height: 800 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test('the clock, sender and decision stay on screen email after email', async ({
      browser,
      baseURL,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'desktop-chromium',
        'the size is set here, one run is enough',
      )
      const seeded = await seedClass(randomBytes(4).toString('hex'))
      const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
      try {
        await page.setViewportSize(size)
        await startRun(page, seeded.classId)
        const clock = page.getByRole('timer')
        const sender = page.getByText('From', { exact: true })
        const emailTop = () => sender.evaluate((element) => element.getBoundingClientRect().top)
        const clockBottom = () =>
          clock.evaluate(
            (element) => element.closest('.triage-status').getBoundingClientRect().bottom,
          )
        await page.screenshot({
          path: testInfo.outputPath(`phish-${size.width}x${size.height}.png`),
          animations: 'disabled',
        })
        for (let round = 0; round < 3; round += 1) {
          await expect(clock).toBeInViewport()
          await expect(sender).toBeInViewport()
          await expect(reportButton(page)).toBeInViewport()
          await expect(trustButton(page)).toBeInViewport()
          // read to the end of the email; the clock and the decision do not move away
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          await expect(clock).toBeInViewport()
          await expect(trustButton(page)).toBeInViewport()
          const responded = page.waitForResponse((response) => ACTIONS.test(response.url()))
          await trustButton(page).click()
          const body = await (await responded).json()
          if (!body.publicState.current) break
          await expect(page.getByRole('article').getByRole('heading')).toHaveText(
            body.publicState.current.subject,
          )
          await expect.poll(emailTop).toBeGreaterThanOrEqual(await clockBottom())
        }
      } finally {
        await context.close()
      }
    })
  })
}

test('fits a 375px screen without a horizontal scrollbar mid-run', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await startRun(page)
  await expect(reportButton(page)).toBeInViewport()
  await expect(trustButton(page)).toBeInViewport()
  await reportButton(page).click()
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
  expect(await overflow(), 'no horizontal overflow while picking').toBe(false)
  await page.keyboard.press('Escape')
  await call(page, 'trust')
  expect(await overflow(), 'no horizontal overflow on feedback').toBe(false)
})

test('enters from the town and returns to it', async ({ page }) => {
  await page.goto('/')
  await jumpToBuilding(page, 'phishing-post-mortem')
  const card = page.getByRole('region', { name: 'The Phishing Post-Mortem', exact: true })
  await expect(card.getByText('Playable game in development')).toHaveCount(0)
  await card.getByRole('link', { name: 'Enter activity' }).click()
  await expect(page).toHaveURL(/\/games\/phishing-post-mortem$/)
  await expect(page.getByRole('heading', { name: 'The Phishing Post-Mortem' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to town' }).click()
  await expect(page).toHaveURL('/')
})

test('keeps the shared town styles after leaving the game', async ({ page }) => {
  await page.goto('/')
  const sharedClipPath = await page.locator('body').evaluate((body) => {
    const probe = document.createElement('span')
    probe.className = 'visually-hidden'
    body.append(probe)
    const clipPath = getComputedStyle(probe).clipPath
    probe.remove()
    return clipPath
  })
  const bodyStyle = await page.locator('body').evaluate((body) => {
    const style = getComputedStyle(body)
    return { fontFamily: style.fontFamily, color: style.color, background: style.backgroundColor }
  })

  await page.goto('/games/phishing-post-mortem')
  await expect(page.getByRole('heading', { name: 'The Phishing Post-Mortem' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to town' }).click()
  await expect(page).toHaveURL('/')
  const returnedClipPath = await page.locator('body').evaluate((body) => {
    const probe = document.createElement('span')
    probe.className = 'visually-hidden'
    body.append(probe)
    const clipPath = getComputedStyle(probe).clipPath
    probe.remove()
    return clipPath
  })
  expect(returnedClipPath).toBe(sharedClipPath)
  await expect
    .poll(() =>
      page.locator('body').evaluate((body) => {
        const style = getComputedStyle(body)
        return {
          fontFamily: style.fontFamily,
          color: style.color,
          background: style.backgroundColor,
        }
      }),
    )
    .toEqual(bodyStyle)
})
