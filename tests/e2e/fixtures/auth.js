import { randomBytes } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { connectDatabase } from '../../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../server/src/config/database-uri.js'
import { createAuthService } from '../../../server/src/modules/auth/service.js'
import { parseRegistrationInput } from '../../../server/src/modules/auth/policy.js'
import { userModel } from '../../../server/src/models/User.js'
import { HOW_TO_PLAY_GAME_IDS } from '../../../server/src/modules/profile/how-to-play.js'
import { postFixtureLogin } from './sign-in.js'

const test = base.extend({
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const testUri = process.env.TEST_MONGODB_URI
      if (process.env.NODE_ENV !== 'test' || !testUri)
        throw new Error('Authenticated E2E fixtures require the guarded test database.')
      assertSafeTestDatabaseUri(testUri)

      const baseURL = workerInfo.project.use.baseURL
      if (typeof baseURL !== 'string') throw new Error('E2E base URL is required.')
      const clientOrigin = new URL(baseURL).origin
      const workerId = workerInfo.workerIndex.toString(36)
      const email = `e2e-${workerId}@example.test`
      const password = `${randomBytes(24).toString('base64url')}A!`
      const database = await connectDatabase(testUri)
      let context

      try {
        await createAuthService(database).register(
          parseRegistrationInput({
            email,
            username: `e2e-${workerId}`,
            password,
            avatarId: 'mint',
          }),
        )

        // hide every how to play dialog so existing specs never see it
        await userModel(database).updateOne(
          { emailNormalized: email },
          { $set: { howToPlayDismissed: [...HOW_TO_PLAY_GAME_IDS] } },
        )

        context = await browser.newContext()
        const csrfResponse = await context.request.get(new URL('/api/auth/csrf', baseURL).href, {
          headers: { Origin: clientOrigin },
        })
        if (!csrfResponse.ok()) throw new Error('Could not initialize the E2E session.')
        const { csrfToken } = await csrfResponse.json()
        await postFixtureLogin(context.request, {
          loginUrl: new URL('/api/auth/login', baseURL).href,
          origin: clientOrigin,
          csrfToken,
          email,
          password,
          message: 'Could not authenticate the E2E session',
        })

        await use(await context.storageState())
      } finally {
        await context?.close()
        await database.close()
      }
    },
    { scope: 'worker' },
  ],
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },
})

export { expect, test }
