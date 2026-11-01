import { randomBytes } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import { connectDatabase } from '../../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../server/src/config/database-uri.js'
import { userModel } from '../../../server/src/models/User.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../../server/src/modules/profile/how-to-play.js'
import { hashPassword } from '../../../server/src/modules/auth/password.js'
import { signInContext } from './sign-in.js'

async function createAccount(database, identity, role) {
  await userModel(database).create({
    emailNormalized: identity.email,
    username: identity.username,
    usernameNormalized: identity.username.toLowerCase(),
    avatarId: 'mint',
    passwordHash: await hashPassword(identity.password),
    globalRoles: [role],
    accountStatus: 'active',
    authVersion: 1,
    instructorAssignmentRevision: 0,
    passwordChangedAt: new Date(),
    howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS],
  })
}

function createIdentity(role, suffix) {
  const email = `e2e-${role}-${suffix}@example.test`
  const username = `e2e-${role[0]}-${randomBytes(6).toString('hex')}`
  const password = `E2e-${role}-${randomBytes(18).toString('base64url')}Aa!`
  return { email, username, password }
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
      const database = await connectDatabase(testUri)
      let context

      try {
        await createAccount(database, administrator, 'admin')

        context = await browser.newContext()
        await signInContext(context, baseURL, administrator)
        await use({
          storageState: await context.storageState(),
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
  // a fresh student per test: joining a class or disabling the account must not leak into the next test
  // eslint-disable-next-line no-empty-pattern
  studentIdentity: async ({}, use, testInfo) => {
    const testUri = process.env.TEST_MONGODB_URI
    assertSafeTestDatabaseUri(testUri)
    const identity = createIdentity(
      'student',
      `${testInfo.workerIndex.toString(36)}-${randomBytes(8).toString('hex')}`,
    )
    const database = await connectDatabase(testUri)
    try {
      await createAccount(database, identity, 'student')
    } finally {
      await database.close()
    }
    await use(identity)
  },
  administratorIdentity: async ({ workerAdminState }, use) => {
    await use(workerAdminState.administratorIdentity)
  },
})

export { expect, test }
