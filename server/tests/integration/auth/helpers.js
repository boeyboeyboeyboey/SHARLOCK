import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { createApp } from '../../../src/app.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { initializeAuthStorage } from '../../../src/modules/auth/storage.js'
import { createMemoryMailer } from '../../../src/modules/auth/mailer.js'

const authApps = new Set()
const appOrigins = new WeakMap()
const appMailers = new WeakMap()

export function testMailer(app) {
  const mailer = appMailers.get(app)
  if (!mailer) throw new Error('Create the app with createTestApp to read its test mailbox.')
  return mailer
}

export async function initializeTestAuth(database, config) {
  if (config?.nodeEnv !== 'test') {
    throw new Error('Auth integration tests require NODE_ENV=test.')
  }
  assertSafeTestDatabaseUri(config.databaseUri)
  await initializeAuthStorage(database)
  return {
    nodeEnv: config.nodeEnv,
    clientOrigin: config.clientOrigin,
    sessionSecret: config.sessionSecret,
  }
}

export function createTestApp(database, authOptions, featureOptions = {}) {
  const mailer = createMemoryMailer()
  const app = createApp(database, { ...featureOptions, auth: authOptions, mail: { mailer } })
  appMailers.set(app, mailer)
  appOrigins.set(app, authOptions.clientOrigin)
  authApps.add(app)
  return app
}

export async function disposeTestAuthApps() {
  const apps = [...authApps]
  authApps.clear()
  await Promise.all(apps.map((app) => app.locals.disposeAuth?.()))
}

// the cookie header an agent would send, for a websocket opened outside supertest; the jar files
// cookies under the host the agent reached, which is [::1] where the machine has ipv6
export function agentCookieHeader(agent) {
  const cookies = ['[::1]', '127.0.0.1'].flatMap((domain) =>
    agent.jar.getCookies({ domain, path: '/api', secure: false, script: false }),
  )
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

export async function registerTestStudent(app, overrides = {}) {
  const origin = appOrigins.get(app)
  if (!origin) throw new Error('Create the app with createTestApp before registering a student.')

  const agent = request.agent(app)
  const uniqueId = randomUUID().replaceAll('-', '')
  const registration = {
    email: `auth-${uniqueId}@example.test`,
    username: `learner-${uniqueId.slice(0, 12)}`,
    password: 'Synthetic-Test-Password-2026',
    avatarId: 'mint',
    ...overrides,
  }
  const csrf = await agent.get('/api/auth/csrf').set('Origin', origin).expect(200)
  const response = await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send(registration)
    .expect(202)

  // finish the account the way a student does: read the emailed code and confirm it
  const verified = await agent
    .post('/api/auth/verify-email')
    .set('Origin', origin)
    .set('X-CSRF-Token', response.body.csrfToken)
    .send({ code: testMailer(app).lastCodeFor(registration.email) })
    .expect(201)

  return {
    agent,
    user: verified.body.user,
    csrfToken: verified.body.csrfToken,
    email: registration.email,
    password: registration.password,
  }
}
