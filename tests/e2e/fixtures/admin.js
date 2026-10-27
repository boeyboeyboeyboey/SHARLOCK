import { randomBytes } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import { connectDatabase } from '../../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../server/src/config/database-uri.js'
import { userModel } from '../../../server/src/models/User.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../../server/src/modules/profile/how-to-play.js'
import { hashPassword } from '../../../server/src/modules/auth/password.js'
import { postFixtureLogin } from './sign-in.js'

function createIdentity(role, suffix) {
  const email = `e2e-${role}-${suffix}@example.test`
  const username = `e2e-${role[0]}-${randomBytes(6).toString('hex')}`
  const password = `E2e-${role}-${randomBytes(18).toString('base64url')}Aa!`
  return { email, username, password }
}

async function signInTestAccount(context, baseURL, identity) {
  const origin = new URL(baseURL).origin
  const csrfResponse = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
    headers: { Origin: origin },
  })
  if (!csrfResponse.ok()) throw new Error('Could not initialize the E2E session.')
  const { csrfToken } = await csrfResponse.json()
  await postFixtureLogin(context.request, {
    loginUrl: new URL('/api/auth/login', baseURL).href,
    origin,
    csrfToken,
    email: identity.email,
    password: identity.password,
    message: 'Could not authenticate the E2E session',
  })
}

const test = base.extend({
  workerAdminState: [
    async ({ browser }, use, workerInfo) => {
      const testUri = process.env.TEST_MONGODB_URI
      if (process.env.NODE_ENV !== 'test' || !testUri) {
        throw new Error('Admin E2E fixtures require the guarded test database.')
      }
      assertSafeTestDatabaseUri(testUri)

      const baseURL = workerInfo.project.use.baseURL
      if (typeof baseURL !== 'string') throw new Error('E2E base URL is required.')
      const suffix = `${workerInfo.workerIndex.toString(36)}-${randomBytes(8).toString('hex')}`
      const administrator = createIdentity('admin', suffix)
      const student = createIdentity('student', suffix)
      const database = await connectDatabase(testUri)
      let context

      try {
        const User = userModel(database)
        const passwordChangedAt = new Date()
        await User.create([
          {
            emailNormalized: administrator.email,
            username: administrator.username,
            usernameNormalized: administrator.username.toLowerCase(),
            avatarId: 'mint',
            passwordHash: await hashPassword(administrator.password),
            globalRoles: ['admin'],
            accountStatus: 'active',
            authVersion: 1,
            instructorAssignmentRevision: 0,
            passwordChangedAt,
            howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS],
          },
          {
            emailNormalized: student.email,
            username: student.username,
            usernameNormalized: student.username.toLowerCase(),
            avatarId: 'mint',
            passwordHash: await hashPassword(student.password),
            globalRoles: ['student'],
            accountStatus: 'active',
            authVersion: 1,
            instructorAssignmentRevision: 0,
            passwordChangedAt,
            howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS],
          },
        ])

        context = await browser.newContext()
        await signInTestAccount(context, baseURL, administrator)
        await use({
          storageState: await context.storageState(),
          studentIdentity: student,
          administratorIdentity: administrator,
        })
      } finally {
        await context?.close()
        await database.close()
      }
    },
    { scope: 'worker' },
  ],
  storageState: async ({ workerAdminState }, use) => {
    await use(workerAdminState.storageState)
  },
  studentIdentity: async ({ workerAdminState }, use) => {
    await use(workerAdminState.studentIdentity)
  },
  administratorIdentity: async ({ workerAdminState }, use) => {
    await use(workerAdminState.administratorIdentity)
  },
})

export { expect, test }
