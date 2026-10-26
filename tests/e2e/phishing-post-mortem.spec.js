import { test, expect } from './fixtures/auth.js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { seedClass, signedInPage } from './fixtures/class.js'

const MODULE = '../../server/src/modules/games/phishing-post-mortem'
const load = (relativePath) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'))
const CASES = ['case-01', 'case-02'].map((id) => ({
  id,
  content: load(`${MODULE}/cases/${id}.public.json`),
  answers: load(`${MODULE}/cases/answers/${id}.answers.json`),
}))

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

// the server picks the case, so the spec reads the served title to find its answer key
async function startCase(page, contextOption = 'personal') {
  await page.getByLabel('Save this case to').selectOption(contextOption)
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  await expect(page.locator('.sharmail-briefing h2')).toBeVisible()
  const title = await page.locator('.sharmail-briefing h2').textContent()
  const active = CASES.find((entry) => entry.content.title === title.trim())
  expect(active, 'served case should be one of the authored cases').toBeTruthy()
  return active
}

async function openCase(page) {
  await page.goto('/games/phishing-post-mortem')
  await expect(page.getByRole('heading', { name: 'The Phishing Post-Mortem' })).toBeVisible()
  return startCase(page)
}

async function solve(page, active, isMobile) {
  const patientZero = active.content.emails.find(
    (email) => email.id === active.answers.patientZeroId,
  )
  await openMessage(page, patientZero, isMobile)
  await page.getByRole('button', { name: 'Accuse this message' }).click()
  await openEvidence(page)
  for (const evidenceId of active.answers.evidenceIds) {
    const option = active.content.evidenceOptions.find((entry) => entry.id === evidenceId)
    await page.getByRole('checkbox', { name: option.label }).check()
  }
  await page.getByRole('button', { name: 'Submit final verdict' }).click()
}

// the clue checkboxes live in a panel opened from the docked verdict bar
async function openEvidence(page) {
  const toggle = page.getByRole('button', { name: /^Evidence \d\/2$/ })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

async function openMessage(page, email, isMobile) {
  if (isMobile) await page.getByRole('button', { name: 'Back to inbox' }).click()
  await page.locator(`.sharmail-row[data-email-id="${email.id}"]`).click()
  await expect(page.getByRole('heading', { name: email.subject, exact: true })).toBeVisible()
}

test('solves a case end to end and scores the full hundred', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  const patientZero = active.content.emails.find(
    (email) => email.id === active.answers.patientZeroId,
  )

  await openMessage(page, patientZero, isMobile)
  await expect(page.getByText(patientZero.senderAddress, { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Accuse this message' }).click()
  await expect(page.getByRole('button', { name: 'Accused as Patient Zero' })).toBeVisible()

  await openEvidence(page)
  for (const evidenceId of active.answers.evidenceIds) {
    const option = active.content.evidenceOptions.find((entry) => entry.id === evidenceId)
    await page.getByRole('checkbox', { name: option.label }).check()
  }
  await page.getByRole('button', { name: 'Submit final verdict' }).click()

  await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()
  await expect(page.getByText('Verdict upheld')).toBeVisible()
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
  await expect(page.getByText(active.answers.chain[0], { exact: false })).toBeVisible()

  // finished cases stay readable: reopen Patient Zero from the inbox, then return to the debrief
  await openMessage(page, patientZero, isMobile)
  await expect(page.getByText('This was Patient Zero')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accuse this message' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit final verdict' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to debrief' }).click()
  await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()
})

test('a wrong verdict scores nothing and still reveals the chain', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  const decoy = active.content.emails.find((email) => email.id !== active.answers.patientZeroId)

  await openMessage(page, decoy, isMobile)
  await page.getByRole('button', { name: 'Accuse this message' }).click()
  const [first, second] = active.content.evidenceOptions
  await openEvidence(page)
  await page.getByRole('checkbox', { name: first.label }).check()
  await page.getByRole('checkbox', { name: second.label }).check()
  await page.getByRole('button', { name: 'Submit final verdict' }).click()

  await expect(page.getByRole('heading', { name: '0 / 100 points' })).toBeVisible()
  await expect(page.getByText('Verdict overturned')).toBeVisible()
  await expect(page.getByText(active.answers.summary, { exact: false })).toBeVisible()
})

test('never sends the answer key to the browser before a verdict', async ({ page }) => {
  const payloads = []
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/api/games/phishing-post-mortem/attempts') || url.includes('/api/attempts/'))
      payloads.push(await response.text())
  })
  const active = await openCase(page)
  expect(payloads).not.toHaveLength(0)
  for (const payload of payloads) {
    expect(payload).not.toContain('patientZeroId')
    expect(payload).not.toContain(active.answers.summary)
    expect(payload).not.toContain('evidenceNotes')
  }
  const rendered = await page.content()
  expect(rendered).not.toContain(active.answers.summary)
})

test('link destinations are inert and only shown on request', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  const withLink = active.content.emails.find((email) => email.links.length > 0)
  const link = withLink.links[0]

  await openMessage(page, withLink, isMobile)
  await expect(page.getByText(link.destination, { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: 'Inspect destination' }).first().click()
  await expect(page.getByText(link.destination, { exact: false })).toBeVisible()
  await expect(page).toHaveURL(/\/games\/phishing-post-mortem\?attempt=/)
  await expect(page.locator('.sharmail-links a')).toHaveCount(0)
})

test('play again returns to the chooser for a fresh server-picked case', async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  await solve(page, active, isMobile)
  await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()

  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page).not.toHaveURL(/attempt=/)
  await expect(page.getByLabel('Save this case to')).toBeVisible()
  await startCase(page)
})

test('resumes a saved attempt from its address', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  await solve(page, active, isMobile)
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
})

test('the inbox panes follow the responsive layout and return focus to the message row', async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  const target = active.content.emails[3]
  const inbox = page.locator('.sharmail-pane-list')
  const reading = page.locator('.sharmail-pane-reading')

  await expect(reading).toBeVisible()
  if (isMobile) await expect(inbox).toBeHidden()
  else await expect(inbox).toBeVisible()

  if (isMobile) {
    await page.getByRole('button', { name: 'Back to inbox' }).click()
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
    await expect(inbox).toBeVisible()
    await expect(reading).toBeHidden()
  }

  const row = page.locator(`.sharmail-row[data-email-id="${target.id}"]`)
  await row.click()
  await expect(page.getByRole('heading', { name: target.subject, exact: true })).toBeVisible()
  await expect(reading).toBeVisible()
  if (isMobile) {
    await expect(inbox).toBeHidden()
    await page.getByRole('button', { name: 'Back to inbox' }).click()
    await expect(row).toBeFocused()
  } else {
    await expect(inbox).toBeVisible()
  }
})

test('the inbox walks with the arrow keys', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard walking is checked on desktop')
  await openCase(page)
  const rows = page.locator('.sharmail-row')
  await rows.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(rows.first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.sharmail-reading')).toBeVisible()
})

test('recovers from a rejected verdict without losing the case', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const active = await openCase(page)
  const patientZero = active.content.emails.find(
    (email) => email.id === active.answers.patientZeroId,
  )
  let rejectFirstSubmission = true

  await page.route('**/api/attempts/*/actions', async (route) => {
    if (rejectFirstSubmission) {
      rejectFirstSubmission = false
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'The verdict service is unavailable. Try again.' },
        }),
      })
      return
    }
    await route.continue()
  })

  await openMessage(page, patientZero, isMobile)
  await page.getByRole('button', { name: 'Accuse this message' }).click()
  await openEvidence(page)
  for (const evidenceId of active.answers.evidenceIds) {
    const option = active.content.evidenceOptions.find((entry) => entry.id === evidenceId)
    await page.getByRole('checkbox', { name: option.label }).check()
  }
  await page.getByRole('button', { name: 'Submit final verdict' }).click()

  await expect(page.getByRole('alert')).toContainText('Retry to check the same request.')
  await expect(page.locator('.sharmail-row[aria-current="true"]')).toHaveAttribute(
    'data-email-id',
    patientZero.id,
  )
  await page.getByRole('button', { name: 'Retry verdict' }).click()
  await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
})

test('fits every supported width without a horizontal page scrollbar', async ({ page }) => {
  await openCase(page)
  for (const width of [375, 576, 768, 992, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow, `no horizontal overflow at ${width}px`).toBe(false)
  }
})

test('enters from the town and returns to it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Jump to').selectOption('phishing-post-mortem')
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

test('a class student saves a solved case and appears on the class leaderboard', async ({
  browser,
  baseURL,
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chromium'
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.goto('/games/phishing-post-mortem')
    const active = await startCase(page, seeded.classId)
    await solve(page, active, isMobile)
    await expect(page.getByRole('heading', { name: '100 / 100 points' })).toBeVisible()
    await expect(page.getByText('Result saved to your account.')).toBeVisible()

    await page.goto('/leaderboard')
    await expect(
      page.getByRole('heading', { level: 2, name: /The Phishing Post-Mortem/ }),
    ).toBeVisible()
    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
  } finally {
    await context.close()
  }
})
