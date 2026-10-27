import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { findLevel, LEVELS } from '../../server/src/modules/games/clearance-tower/levels.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import { SOLUTIONS } from '../../server/tests/unit/clearance-tower/solutions.js'

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

const nameOf = (list, id) => list.find((item) => item.id === id).name

// every full page load spends one signed-in csrf bootstrap, which the server rate-limits per ip,
// so tests load the game once and move between cases with in-app clicks
async function pickCase(page, levelId) {
  const level = findLevel(levelId)
  await page.getByRole('button', { name: new RegExp(level.title) }).click()
  await expect(page.getByRole('heading', { name: level.title, level: 2 })).toBeFocused()
  await page.getByRole('button', { name: 'Open the policy desk' }).click()
  await expect(page.getByRole('heading', { name: /^Policy desk/ })).toBeFocused()
  return level
}

async function startClimb(page, contextOption = 'personal') {
  await page.getByLabel('Save this case to').selectOption(contextOption)
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  await expect(page.getByRole('heading', { name: 'Choose a case' })).toBeVisible()
}

async function openCase(page, levelId) {
  await page.goto('/games/clearance-tower')
  await startClimb(page)
  return pickCase(page, levelId)
}

async function setGrants(page, level, grants) {
  for (const grant of grants)
    for (const right of grant.rights) {
      const word = right === 'r' ? 'read' : 'write'
      const label = `${nameOf(level.agents, grant.subject)} may ${word} ${nameOf(level.files, grant.object)}`
      await page.getByRole('button', { name: label, exact: true }).click()
    }
}

async function setLabels(page, level, objectLabels) {
  for (const file of level.files) {
    const card = page.getByRole('group', { name: file.name, exact: true })
    const label = objectLabels[file.id]
    await card.getByLabel('Level').selectOption(label.level)
    for (const categoryId of label.categories)
      await card.getByLabel(nameOf(level.categories, categoryId)).check()
  }
}

async function predict(page, level, predictions) {
  await page.getByRole('button', { name: 'Next: predict' }).click()
  for (const prompt of level.predictions) {
    const call = page.getByRole('group', { name: prompt.request })
    await call.getByLabel(predictions[prompt.id] === 'allow' ? 'Allowed' : 'Blocked').check()
  }
}

async function runWholeDay(page) {
  await page.getByRole('button', { name: 'Run the day' }).click()
  await expect(page.getByRole('heading', { name: 'The day plays out' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip to end' }).click()
}

async function openCaseFile(page) {
  await page.getByRole('button', { name: 'Open the case file' }).click()
  await expect(page.locator('.clearance-game [data-phase-heading]')).toBeFocused()
}

const pageOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test('solves the matrix case to three stars from the town card', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Jump to').selectOption('clearance-tower')
  const card = page.getByRole('region', { name: 'Clearance Tower', exact: true })
  await card.getByRole('link').click()
  await expect(page).toHaveURL(/\/games\/clearance-tower$/)
  await expect(page.getByRole('heading', { name: 'Clearance Tower', level: 1 })).toBeVisible()
  await startClimb(page)
  const level = await pickCase(page, 'the-matrix')
  const { policy, predictions } = SOLUTIONS['the-matrix']
  await setGrants(page, level, policy.grants)
  await page.getByRole('button', { name: 'Access lists' }).click()
  await expect(page.getByText('Director Hale: r w')).toBeVisible()
  await page.getByRole('button', { name: 'Matrix', exact: true }).click()
  await predict(page, level, predictions)
  await runWholeDay(page)
  await expect(page.getByText(`Event ${level.day.length} of ${level.day.length}`)).toBeVisible()
  await expect(page.locator('.clear-log-entry.is-leaked')).toHaveCount(0)
  await openCaseFile(page)
  await expect(page.locator('.clear-score')).toContainText('100 / 100')
  await expect(page.getByLabel('3 out of 3 stars')).toBeVisible()
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('the gift leaks through the trojan horse under discretionary control', async ({ page }) => {
  const level = await openCase(page, 'the-gift')
  await predict(page, level, SOLUTIONS['the-gift'].predictions)
  await runWholeDay(page)
  await expect(page.locator('[data-event-id="a1"]')).toContainText('Leaked')
  await expect(page.locator('.clear-room.is-flagged')).toContainText('Board Report')
  await openCaseFile(page)
  await expect(page.locator('.clear-score')).toContainText('80 / 100')
})

test('compartment labels stop the trojan but let the clerk tamper', async ({ page }) => {
  const level = await openCase(page, 'compartments')
  await setLabels(page, level, SOLUTIONS.compartments.policy.objectLabels)
  const secretFloor = page.locator('.clear-floor', { hasText: 'Secret' }).filter({
    hasNotText: 'Top Secret',
  })
  await expect(secretFloor).toContainText('Cyber Brief')
  await predict(page, level, SOLUTIONS.compartments.predictions)
  await runWholeDay(page)
  await expect(page.locator('[data-event-id="a2"]')).toContainText('Stopped')
  await expect(page.locator('[data-event-id="a2"]')).toContainText('No write down')
  await expect(page.locator('[data-event-id="i1"]')).toContainText('Tampered')
  await openCaseFile(page)
  await expect(page.locator('.clear-score')).toContainText('100 / 100')
  await expect(page.getByText(/Tampering allowed by the model: 1/)).toBeVisible()
})

test('the reshuffle is a handful of badge edits', async ({ page }) => {
  const level = await openCase(page, 'reshuffle')
  for (const [agent, role] of [
    ['Agent Achebe', 'Operator'],
    ['Agent Achebe', 'Auditor'],
    ['Officer Moreau', 'Security Officer'],
    ['Agent Tan', 'Auditor'],
    ['Agent Tan', 'Security Officer'],
    ['Agent Ward', 'Operator'],
  ])
    await page.getByLabel(`${agent} holds ${role}`, { exact: true }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
  await predict(page, level, SOLUTIONS.reshuffle.predictions)
  await runWholeDay(page)
  await openCaseFile(page)
  await expect(page.locator('.clear-score')).toContainText('100 / 100')
  await expect(
    page.getByText('You made 6 badge edits. Underneath, 10 matrix cells changed.'),
  ).toBeVisible()
})

test('builds roles from scratch and warns about mixed duties', async ({ page }) => {
  await openCase(page, 'roles-not-people')
  await page.getByRole('button', { name: 'Add role' }).click()
  await page.getByLabel('Role name').fill('Everything')
  for (const permission of ['Edit Access Register', 'Read Audit Trail'])
    await page.getByLabel(permission).check()
  await page.getByLabel('Officer Moreau holds Everything', { exact: true }).check()
  await expect(page.getByRole('status')).toContainText('Officer Moreau')
  await page.getByLabel('Role name').fill('  ')
  await expect(page.getByRole('button', { name: 'Next: predict' })).toBeDisabled()
})

test('reduced motion waits for the player to step through the day', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const level = await openCase(page, 'read-down-write-up')
  await setLabels(page, level, SOLUTIONS['read-down-write-up'].policy.objectLabels)
  await predict(page, level, SOLUTIONS['read-down-write-up'].predictions)
  await page.getByRole('button', { name: 'Run the day' }).click()
  await expect(page.getByText(`Event 0 of ${level.day.length}`)).toBeVisible()
  await page.getByRole('button', { name: 'Next event' }).click()
  await expect(page.getByText(`Event 1 of ${level.day.length}`)).toBeVisible()
  await expect(page.locator('.clear-log-entry')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Open the case file' })).toBeDisabled()
})

test('plays a case through focused controls and keyboard activation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'keyboard journey runs on desktop')
  const level = await openCase(page, 'read-down-write-up')
  const labels = SOLUTIONS['read-down-write-up'].policy.objectLabels
  for (const file of level.files) {
    const select = page.getByRole('group', { name: file.name, exact: true }).getByLabel('Level')
    await select.focus()
    await select.selectOption(labels[file.id].level)
  }
  const next = page.getByRole('button', { name: 'Next: predict' })
  await next.focus()
  await page.keyboard.press('Enter')
  for (const prompt of level.predictions) {
    const choice =
      SOLUTIONS['read-down-write-up'].predictions[prompt.id] === 'allow' ? 'Allowed' : 'Blocked'
    await page.getByRole('group', { name: prompt.request }).getByLabel(choice).focus()
    await page.keyboard.press('Space')
  }
  await page.getByRole('button', { name: 'Run the day' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Skip to end' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Open the case file' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.clear-score')).toContainText('100 / 100')
})

test('keeps the day script and answers out of every response before submitting', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const bodies = []
  page.on('response', async (response) => {
    if (
      (response.url().includes('/api/games/clearance-tower/') ||
        response.url().includes('/api/attempts/')) &&
      !response.url().endsWith('/actions') &&
      !response.url().endsWith('/complete')
    )
      bodies.push(await response.text())
  })
  await page.goto('/games/clearance-tower')
  await startClimb(page)
  for (const level of LEVELS) {
    await pickCase(page, level.id)
    await page.getByRole('button', { name: 'Dossier' }).click()
    await page.getByRole('button', { name: 'All cases' }).click()
  }
  const seen = bodies.join('\n')
  expect(seen).toContain('"submittedCount"')
  for (const level of LEVELS) {
    for (const prompt of level.predictions) expect(seen).not.toContain(prompt.explanation)
    for (const event of level.day.filter((item) => item.kind !== 'work'))
      expect(seen).not.toContain(event.story)
  }
  expect(seen).not.toContain('"answer"')
})

test('fits every supported width without page overflow', async ({ page }) => {
  await openCase(page, 'compartments')
  for (const width of [375, 576, 768, 992, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await pageOverflow(page), `${width}px`).toBeLessThanOrEqual(0)
  }
  await page.setViewportSize({ width: 667, height: 375 })
  expect(await pageOverflow(page), 'landscape').toBeLessThanOrEqual(0)
})

test('fits a laptop-height window without page scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'fit rule applies from 992px wide')
  await page.setViewportSize({ width: 1280, height: 720 })
  const fits = () =>
    page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  await page.goto('/games/clearance-tower')
  await startClimb(page)
  await expect(page.getByRole('button', { name: /The Matrix/ })).toBeVisible()
  expect(await fits()).toBe(true)
  await pickCase(page, 'roles-not-people')
  expect(await fits()).toBe(true)
})

test('old regex urls lead to the tower', async ({ page }) => {
  for (const previous of ['red-blue', 'regex-defender']) {
    await page.goto(`/games/${previous}`)
    await expect(page).toHaveURL('/games/clearance-tower')
    await expect(page.getByRole('heading', { name: 'Clearance Tower', level: 1 })).toBeVisible()
  }
})

test('keeps the shared town styles after leaving the game', async ({ page }) => {
  const sharedStyle = () =>
    page.locator('body').evaluate((body) => {
      const probe = document.createElement('span')
      probe.className = 'visually-hidden'
      body.append(probe)
      const clipPath = getComputedStyle(probe).clipPath
      probe.remove()
      const style = getComputedStyle(body)
      return { clipPath, fontFamily: style.fontFamily, background: style.backgroundColor }
    })
  await page.goto('/')
  const before = await sharedStyle()
  await page.getByLabel('Jump to').selectOption('clearance-tower')
  await page.getByRole('region', { name: 'Clearance Tower', exact: true }).getByRole('link').click()
  await startClimb(page)
  await pickCase(page, 'the-matrix')
  await page.getByRole('link', { name: 'Back to town' }).click()
  await expect(page).toHaveURL('/')
  await expect.poll(sharedStyle).toEqual(before)
})

test('a class student saves a climb and appears on the class leaderboard', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.goto('/games/clearance-tower')
    await startClimb(page, seeded.classId)
    const level = await pickCase(page, 'the-matrix')
    const { policy, predictions } = SOLUTIONS['the-matrix']
    await setGrants(page, level, policy.grants)
    await predict(page, level, predictions)
    await runWholeDay(page)
    await openCaseFile(page)
    await expect(page.locator('.clear-score')).toContainText('100 / 100')
    await page.getByRole('button', { name: 'All cases' }).click()
    await expect(page.getByText('Scored 100 / 100')).toBeVisible()

    // a submitted case reopens as its stored day, and cannot be run twice
    await page.getByRole('button', { name: new RegExp(level.title) }).click()
    await expect(page.getByRole('heading', { name: 'The day plays out' })).toBeFocused()

    await page.getByRole('button', { name: 'Skip to end' }).click()
    await page.getByRole('button', { name: 'Open the case file' }).click()
    await page.getByRole('button', { name: 'All cases' }).click()
    await page.getByRole('button', { name: 'Finish climb' }).click()
    await expect(page.getByText('100 / 600', { exact: true })).toBeVisible()
    await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
    await expect(page.getByText(`${level.title}: 100 / 100`)).toBeVisible()

    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { level: 2, name: /Clearance Tower/ })).toBeVisible()
    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
  } finally {
    await context.close()
  }
})

test('the how to play guide opens once, then follows the saved dismissal', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL).origin
  const csrf = await page.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  const { csrfToken } = await csrf.json()
  const undismiss = await page.request.put(
    new URL('/api/me/how-to-play/clearance-tower', baseURL).href,
    { headers: { Origin: origin, 'X-CSRF-Token': csrfToken }, data: { dismissed: false } },
  )
  expect(undismiss.ok()).toBe(true)

  await page.goto('/games/clearance-tower')
  const guide = page.getByRole('dialog', { name: /^How to play/ })
  await expect(guide).toBeVisible()
  const pause = guide.getByRole('button', { name: 'Pause animation' })
  await expect(pause).toHaveAttribute('aria-pressed')
  await expect(guide.getByText('Step 1 of 4')).toBeVisible()
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide.getByText('Step 2 of 4')).toBeVisible()

  await guide.getByLabel("Don't show again").check()
  await guide.getByRole('button', { name: 'Start playing' }).click()
  await expect(guide).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Start a climb' })).toBeVisible()
  await expect(guide).toBeHidden()
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(guide).toBeVisible()
  await expect(guide.getByLabel("Don't show again")).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
})
