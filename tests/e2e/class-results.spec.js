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
import { HOW_TO_PLAY_GAME_IDS } from '../../server/src/modules/profile/how-to-play.js'
import { playSqlRun } from './fixtures/sql.js'

function identity(role, suffix) {
  return {
    email: `results-${role}-${suffix}@example.test`,
    username: `res-${role[0]}-${suffix}`,
    password: `${randomBytes(18).toString('base64url')}Aa!`,
  }
}

// seeds an instructor, a class with one active student and the assignment
async function seedClass(suffix) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Class results E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const instructor = identity('instructor', suffix)
  const student = identity('student', suffix)
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
      howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS],
      accountStatus: 'active',
      authVersion: 1,
      instructorAssignmentRevision: 0,
      passwordChangedAt,
    })
    const [teacherDoc, studentDoc] = await User.create([
      await account(instructor, 'instructor'),
      await account(student, 'student'),
    ])
    const institution = await institutionModel(database).create({
      name: `Results QA ${suffix}`,
      slug: `results-qa-${suffix}`,
    })
    const cohort = await cohortModel(database).create({
      institutionId: institution._id,
      name: `Results Class ${suffix}`,
      term: 'QA term',
    })
    await instructorAssignmentModel(database).create({
      userId: teacherDoc._id,
      cohortId: cohort._id,
    })
    await membershipModel(database).create({
      userId: studentDoc._id,
      cohortId: cohort._id,
      status: 'active',
      decision: 'approved',
      approvedAt: new Date(),
    })
    return { instructor, student, classId: String(cohort._id) }
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
  if (!login.ok()) throw new Error('Could not authenticate the class results E2E session.')
  const page = await context.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  return { context, page }
}

test('instructor sees only class-context results and can drill into a student', async ({
  browser,
  baseURL,
}) => {
  const suffix = randomBytes(4).toString('hex')
  const seeded = await seedClass(suffix)

  const studentSession = await signedInPage(browser, baseURL, seeded.student)
  try {
    await playSqlRun(studentSession.page, seeded.classId)
    await playSqlRun(studentSession.page, 'personal')
  } finally {
    await studentSession.context.close()
  }

  const teacherSession = await signedInPage(browser, baseURL, seeded.instructor)
  try {
    const page = teacherSession.page
    await page.goto('/instructor')
    await page.getByLabel('Class', { exact: true }).selectOption(seeded.classId)
    await page.getByRole('button', { name: 'Results', exact: true }).click()
    await expect(page).toHaveURL(/view=results/)
    await expect(page).toHaveURL(new RegExp(`class=${seeded.classId}`))

    const summary = page.getByRole('region', { name: 'Class summary' })
    const sqlCard = summary.getByRole('listitem').filter({ hasText: 'SQL Injection Arcade' })
    await expect(sqlCard.getByText('1 of 1 students attempted')).toBeVisible()
    await expect(sqlCard.getByText(/^Average best score \d+%$/)).toBeVisible()

    const studentButton = page.getByRole('button', { name: seeded.student.username })
    await studentButton.click()
    const attemptsTable = page.getByRole('table', { name: /Completed class attempts for/ })
    await expect(attemptsTable.locator('tbody tr')).toHaveCount(1)
    await expect(
      attemptsTable.getByRole('rowheader', { name: 'SQL Injection Arcade' }),
    ).toHaveCount(1)

    await page.getByRole('button', { name: 'Back to students' }).click()
    await expect(studentButton).toBeFocused()

    await page.getByRole('button', { name: 'Roster', exact: true }).click()
    await expect(page).not.toHaveURL(/view=/)
  } finally {
    await teacherSession.context.close()
  }
})
