import { randomBytes } from 'node:crypto'
import { connectDatabase } from '../../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../server/src/config/database-uri.js'
import { userModel } from '../../../server/src/models/User.js'
import { institutionModel } from '../../../server/src/models/Institution.js'
import { cohortModel } from '../../../server/src/models/Cohort.js'
import { membershipModel } from '../../../server/src/models/Membership.js'
import { instructorAssignmentModel } from '../../../server/src/models/InstructorAssignment.js'
import { hashPassword } from '../../../server/src/modules/auth/password.js'
import { postFixtureLogin } from './sign-in.js'

function identity(role, suffix) {
  return {
    email: `class-${role}-${suffix}@example.test`,
    username: `cl-${role}-${suffix}`,
    password: `${randomBytes(18).toString('base64url')}Aa!`,
  }
}

// seeds an instructor, a class with two active students and the assignment
export async function seedClass(suffix) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('Class E2E requires the guarded test database.')
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
      name: `Class QA ${suffix}`,
      slug: `class-qa-${suffix}`,
    })
    const cohort = await cohortModel(database).create({
      institutionId: institution._id,
      name: `Tower Class ${suffix}`,
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

export async function signedInPage(browser, baseURL, who) {
  const origin = new URL(baseURL).origin
  // the test's browser applies the shared worker cookie by default; logging in over it would
  // rotate and destroy that worker session
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const csrf = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  const { csrfToken } = await csrf.json()
  await postFixtureLogin(context.request, {
    loginUrl: new URL('/api/auth/login', baseURL).href,
    origin,
    csrfToken,
    email: who.email,
    password: who.password,
    message: 'Could not authenticate the class E2E session',
  })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  return { context, page }
}
