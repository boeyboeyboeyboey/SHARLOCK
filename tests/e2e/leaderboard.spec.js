import { randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { connectDatabase } from '../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../server/src/config/database-uri.js'
import { userModel } from '../../server/src/models/User.js'
import { institutionModel } from '../../server/src/models/Institution.js'
import { cohortModel } from '../../server/src/models/Cohort.js'
import { membershipModel } from '../../server/src/models/Membership.js'
import { instructorAssignmentModel } from '../../server/src/models/InstructorAssignment.js'
import { hashPassword } from '../../server/src/modules/auth/password.js'

function identity(role, suffix) {
  return {
    email: `board-${role}-${suffix}@example.test`,
    username: `lb-${role}-${suffix}`,
    password: `${randomBytes(18).toString('base64url')}Aa!`,
  }
}

// seeds an instructor, a class with two active students and the assignment
async function seedClass(suffix) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Leaderboard E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const instructor = identity('instructor', suffix)
  const studentA = identity('studenta', suffix)
  const studentB = identity('studentb', suffix)
  const database = await connectDatabase(testUri)
  try {
    const User = userModel(database)
    const passwordChangedAt = new Date()
    const account = async (who, role) => ({
      emailNormalized: who.email,
      username: who.username,
      usernameNormalized: who.username.toLowerCase(),
      avatarId: 'mint',
      passwordHash: await hashPassword(who.password),
      globalRoles: [role],
      accountStatus: 'active',
      authVersion: 1,
      instructorAssignmentRevision: 0,
      passwordChangedAt,
    })
    const [teacherDoc, docA, docB] = await User.create([
      await account(instructor, 'instructor'),
      await account(studentA, 'student'),
      await account(studentB, 'student'),
    ])
    const institution = await institutionModel(database).create({
      name: `Board QA ${suffix}`,
      slug: `board-qa-${suffix}`,
    })
    const cohort = await cohortModel(database).create({
      institutionId: institution._id,
      name: `Board Class ${suffix}`,
      term: 'QA term',
    })
    await instructorAssignmentModel(database).create({
      userId: teacherDoc._id,
      cohortId: cohort._id,
    })
    await membershipModel(database).create(
      [docA, docB].map((doc) => ({
        userId: doc._id,
        cohortId: cohort._id,
        status: 'active',
        decision: 'approved',
        approvedAt: new Date(),
      })),
    )
    return { instructor, studentA, studentB, classId: String(cohort._id) }
  } finally {
    await database.close()
  }
}

async function signedInPage(browser, baseURL, who) {
  const origin = new URL(baseURL).origin
  const context = await browser.newContext()
  const csrf = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  const { csrfToken } = await csrf.json()
  const login = await context.request.post(new URL('/api/auth/login', baseURL).href, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { email: who.email, password: who.password },
  })
  if (!login.ok()) throw new Error('Could not authenticate the leaderboard E2E session.')
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  return { context, page }
}

// plays one full G-SQL run, saving it to the given context option
async function playSqlRun(page, contextOption) {
  await page.goto('/games/sql-injection-arcade')
  await page.getByLabel('Save this case to').selectOption(contextOption)
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  await page.getByLabel('Fictional username', { exact: true }).fill("' OR 1=1 --")
  await page.getByRole('button', { name: 'Test payload', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Seal the breach' })).toBeVisible()
  await page.getByRole('radio', { name: 'Bind input as parameters in a prepared query' }).check()
  await page.getByRole('button', { name: 'Confirm repair' }).click()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
}

// seeds a class where student A has one saved class-context run
async function seedPlayedClass(browser, baseURL) {
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const session = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await playSqlRun(session.page, seeded.classId)
  } finally {
    await session.context.close()
  }
  return seeded
}

test('student sees their own row on the practice and all-time boards', async ({
  browser,
  baseURL,
}) => {
  const seeded = await seedPlayedClass(browser, baseURL)
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboards' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: /SQL Injection Arcade/ }),
    ).toBeVisible()
    await expect(page.getByRole('table', { name: 'Practice best scores' })).toBeVisible()

    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
    await expect(own.locator('strong', { hasText: seeded.studentA.username })).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(seeded.studentB.username) })).toHaveCount(
      0,
    )

    // only one game has attempts here, so the game tab row has a single tab
    const gameTab = page
      .getByRole('tablist', { name: 'Game' })
      .getByRole('tab', { name: 'SQL Injection Arcade' })
    await expect(gameTab).toHaveAttribute('aria-selected', 'true')
    await gameTab.click()
    await expect(page).toHaveURL(/game=sql-injection-arcade/)

    await page.getByRole('tab', { name: 'All-time' }).click()
    await expect(page).toHaveURL(/view=all-time/)
    const allTime = page.getByRole('table', { name: 'All-time points' })
    await expect(allTime).toBeVisible()
    const playsIndex = await allTime
      .getByRole('columnheader')
      .evaluateAll((cells) => cells.findIndex((cell) => cell.textContent.trim() === 'Plays'))
    await expect(
      allTime
        .getByRole('row', { name: new RegExp(seeded.studentA.username) })
        .getByRole('cell')
        .nth(playsIndex - 1),
    ).toHaveText('1')
  } finally {
    await context.close()
  }
})

test('instructor sees a class board without a self marker', async ({ browser, baseURL }) => {
  const seeded = await seedPlayedClass(browser, baseURL)
  const { context, page } = await signedInPage(browser, baseURL, seeded.instructor)
  try {
    await page.goto('/leaderboard')
    // a single class is preselected and the select is disabled
    await expect(page.getByRole('combobox', { name: 'Class', exact: true })).toHaveValue(
      seeded.classId,
    )
    await expect(page.getByRole('table', { name: 'Practice best scores' })).toBeVisible()

    const row = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(row).toHaveCount(1)
    await expect(row).not.toContainText('(you)')
    await expect(page.getByRole('row', { name: new RegExp(seeded.studentB.username) })).toHaveCount(
      0,
    )
  } finally {
    await context.close()
  }
})
