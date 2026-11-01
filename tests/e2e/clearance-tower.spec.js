import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { findLevel, LEVELS } from '../../server/src/modules/games/clearance-tower/levels.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import { SOLUTIONS } from '../../server/tests/unit/clearance-tower/solutions.js'
import { jumpToBuilding } from './fixtures/town.js'

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
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused()
}

const caseScore = (page) => page.getByTestId('clear-case-score')
const logEntry = (page, level, eventId) =>
  page.getByTestId('clear-log-entry').filter({
    hasText: level.day.find((event) => event.id === eventId).story,
  })

const pageOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test('solves the matrix case to three stars from the town card', async ({ page }) => {
  await page.goto('/')
  await jumpToBuilding(page, 'clearance-tower')
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
  await expect(page.getByTestId('clear-log-entry').filter({ hasText: 'Leaked' })).toHaveCount(0)
  await openCaseFile(page)
  await expect(caseScore(page)).toContainText('100 / 100')
  await expect(page.getByLabel('3 out of 3 stars')).toBeVisible()
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('the gift leaks through the trojan horse under discretionary control', async ({ page }) => {
  const level = await openCase(page, 'the-gift')
  await predict(page, level, SOLUTIONS['the-gift'].predictions)
  await runWholeDay(page)
  await expect(logEntry(page, level, 'a1')).toContainText('Leaked')
  await expect(page.getByTestId('clear-flagged-room')).toContainText('Board Report')
  await openCaseFile(page)
  await expect(caseScore(page)).toContainText('60 / 100')
  await expect(page.getByText('topic is not achieved, whatever the score')).toBeVisible()
})

test('closing one path of the trojan horse earns the full score on the gift', async ({ page }) => {
  const level = await openCase(page, 'the-gift')
  await page
    .getByRole('button', { name: 'Manager Voss may read Board Report', exact: true })
    .click()
  await predict(page, level, SOLUTIONS['the-gift'].predictions)
  await runWholeDay(page)
  await expect(logEntry(page, level, 'a1')).toContainText('Stopped')
  await openCaseFile(page)
  await expect(caseScore(page)).toContainText('100 / 100')
  await expect(page.getByLabel('3 out of 3 stars')).toBeVisible()
  await expect(page.getByText('Work completed: 7 of 10')).toBeVisible()
  await expect(
    page.getByText('blocks 3 tasks, so 7 completed earns the full work row'),
  ).toBeVisible()
})

test('hints name the principle, cost ten points each and show on the case file', async ({
  page,
}) => {
  const level = await openCase(page, 'the-matrix')
  const { policy, predictions } = SOLUTIONS['the-matrix']
  const first = page.getByRole('button', { name: 'Hint −10 points' })
  await expect(first).toBeVisible()
  await first.click()
  await expect(page.getByText(/Check least privilege/)).toBeVisible()
  await page.getByRole('button', { name: 'Another hint −10 points' }).click()
  await expect(page.getByText(/Every extra cell in the matrix/)).toBeVisible()
  const noMore = page.getByRole('button', { name: 'No more hints' })
  await expect(noMore).toBeDisabled()
  await expect(noMore).toBeFocused()

  await setGrants(page, level, policy.grants)
  await predict(page, level, predictions)
  await runWholeDay(page)
  await openCaseFile(page)
  await expect(caseScore(page)).toContainText('80 / 100')
  await expect(page.getByText('Hints: 2 (−20)')).toBeVisible()
})

test('compartment labels stop the trojan but let the clerk tamper', async ({ page }) => {
  const level = await openCase(page, 'compartments')
  await setLabels(page, level, SOLUTIONS.compartments.policy.objectLabels)
  const secretFloor = page
    .getByTestId('clear-floor')
    .filter({ hasText: 'Secret' })
    .filter({ hasNotText: 'Top Secret' })
  await expect(secretFloor).toContainText('Cyber Brief')
  await predict(page, level, SOLUTIONS.compartments.predictions)
  await runWholeDay(page)
  const trojan = logEntry(page, level, 'a2')
  await expect(trojan).toContainText('Stopped')
  await expect(trojan).toContainText('No write down')
  await expect(trojan).toContainText('Liaison Voss reads Defense Plan: not reached')
  await expect(logEntry(page, level, 'i1')).toContainText('Tampered')
  await openCaseFile(page)
  await expect(caseScore(page)).toContainText('100 / 100')
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
  await expect(caseScore(page)).toContainText('100 / 100')
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
  await expect(page.getByTestId('clear-log-entry')).toHaveCount(1)
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
  await expect(caseScore(page)).toContainText('100 / 100')
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

test('fits every supported width on each screen of a case', async ({ page }) => {
  test.setTimeout(90_000)
  const sizes = [
    ...[375, 576, 768, 992, 1200, 1440].map((width) => ({ width, height: 900 })),
    { width: 667, height: 375 },
  ]
  const expectFits = async (screen) => {
    for (const size of sizes) {
      await page.setViewportSize(size)
      expect(await pageOverflow(page), `${screen} at ${size.width}px`).toBeLessThanOrEqual(0)
    }
  }
  const backToCases = async () => {
    await page.getByRole('button', { name: 'Dossier' }).click()
    await page.getByRole('button', { name: 'All cases' }).click()
  }

  await page.goto('/games/clearance-tower')
  await startClimb(page)
  await pickCase(page, 'compartments')
  await expectFits('labels')
  await backToCases()

  await pickCase(page, 'roles-not-people')
  for (let added = 0; added < 3; added += 1)
    await page.getByRole('button', { name: 'Add role' }).click()
  await expectFits('roles')
  await backToCases()

  const level = await pickCase(page, 'the-matrix')
  await expectFits('matrix')
  await page.setViewportSize({ width: 375, height: 900 })
  const matrix = page.getByRole('table', { name: /Access matrix/ })
  const sideways = await matrix.evaluate((table) => {
    const wrap = table.parentElement
    return wrap.scrollWidth - wrap.clientWidth
  })
  expect(sideways, 'matrix scrolls sideways at 375px').toBeLessThanOrEqual(0)

  const { policy, predictions } = SOLUTIONS['the-matrix']
  await setGrants(page, level, policy.grants)
  await predict(page, level, predictions)
  await expectFits('predictions')
  await runWholeDay(page)
  await expectFits('day')
  await openCaseFile(page)
  await expectFits('case file')
})

test('a reload keeps the unsaved policy and calls of a case', async ({ page }) => {
  const level = await openCase(page, 'the-matrix')
  const grant = page.getByRole('button', { name: 'Director Hale may read Ops Plan', exact: true })
  await grant.click()
  await expect(grant).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next: predict' }).click()
  const [first] = level.predictions
  await page.getByRole('group', { name: first.request }).getByLabel('Blocked').check()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Choose a case' })).toBeVisible()
  await pickCase(page, 'the-matrix')
  await expect(page.getByText('Your unsaved policy and calls for this case were')).toBeVisible()
  await expect(grant).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next: predict' }).click()
  await expect(page.getByRole('group', { name: first.request }).getByLabel('Blocked')).toBeChecked()
})

test('a second tab makes the first tab reload the climb before it can continue', async ({
  page,
  context,
}) => {
  await openCase(page, 'the-matrix')
  const attemptUrl = page.url()
  const other = await context.newPage()
  try {
    await other.goto(attemptUrl)
    await pickCase(other, 'the-gift')
    await other.getByRole('button', { name: 'Hint −10 points' }).click()
    await expect(other.getByText(/Where to look/)).toBeVisible()
  } finally {
    await other.close()
  }

  await page.getByRole('button', { name: 'Hint −10 points' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('changed in another tab')
  await expect(alert.getByRole('button', { name: 'Retry same request' })).toHaveCount(0)
  await alert.getByRole('button', { name: 'Reload climb' }).click()
  await expect(alert).toHaveCount(0)
  await page.getByRole('button', { name: 'Hint −10 points' }).click()
  await expect(page.getByText(/Where to look/)).toBeVisible()
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
  await jumpToBuilding(page, 'clearance-tower')
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
    await expect(caseScore(page)).toContainText('100 / 100')
    await page.getByRole('button', { name: 'All cases' }).click()
    await expect(page.getByText('Scored 100 / 100')).toBeVisible()

    // a submitted case reopens as its stored day, and cannot be run twice
    await page.getByRole('button', { name: new RegExp(level.title) }).click()
    await expect(page.getByRole('heading', { name: 'The day plays out' })).toBeFocused()

    await page.getByRole('button', { name: 'Skip to end' }).click()
    await page.getByRole('button', { name: 'Open the case file' }).click()
    await page.getByRole('button', { name: 'All cases' }).click()
    await page.getByRole('button', { name: 'Finish climb' }).click()
    await expect(page.getByRole('status')).toContainText('closes for good')
    await page
      .getByRole('button', { name: 'Finish with 1 of 6 cases? Press again to save' })
      .click()
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

  // the dismissal saves in the background, so wait for it before the reload reads it back
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me/how-to-play/clearance-tower') &&
      response.request().method() === 'PUT',
  )
  await guide.getByLabel("Don't show again").check()
  expect((await saved).ok()).toBe(true)
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
