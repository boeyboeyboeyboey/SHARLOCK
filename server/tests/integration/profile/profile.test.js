import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { userModel } from '../../../src/models/User.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../../integration/auth/helpers.js'

let database
let authOptions
let app

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Profile integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  if (!database?.name?.endsWith('_test')) {
    throw new Error('Refusing profile fixture cleanup outside a disposable _test database.')
  }
  await Promise.all([
    database.db.collection('users').deleteMany({}),
    database.db.collection('auth_sessions').deleteMany({}),
  ])
  app = createTestApp(database, authOptions)
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

function patchProfile(account, input, { origin, token } = {}) {
  return account.agent
    .patch('/api/me/profile')
    .set('Origin', origin || authOptions.clientOrigin)
    .set('X-CSRF-Token', token || account.csrfToken)
    .send(input)
}

describe('profile API', () => {
  it('requires a current session and returns only the caller profile fields', async () => {
    await request(app).get('/api/me/profile').expect(401)
    const account = await registerTestStudent(app)
    const response = await account.agent.get('/api/me/profile').expect(200)

    expect(response.body).toEqual({
      username: account.user.username,
      avatarId: account.user.avatarId,
    })
    expect(Object.keys(response.body).sort()).toEqual(['avatarId', 'username'])
    expect(response.headers['cache-control']).toContain('no-store')
  })

  it('updates the authenticated account and persists the direct safe response', async () => {
    const account = await registerTestStudent(app)
    const updated = await patchProfile(account, {
      username: 'New_Capybara',
      avatarId: 'reader',
    }).expect(200)

    expect(updated.body).toEqual({ username: 'New_Capybara', avatarId: 'reader' })
    expect(Object.keys(updated.body).sort()).toEqual(['avatarId', 'username'])
    expect(await account.agent.get('/api/me/profile').expect(200)).toMatchObject({
      body: updated.body,
    })
    expect(await account.agent.get('/api/auth/me').expect(200)).toMatchObject({
      body: { user: { username: 'New_Capybara', avatarId: 'reader' } },
    })

    const stored = await userModel(database)
      .findById(account.user.id)
      .select('+passwordHash')
      .lean()
    expect(stored).toMatchObject({
      username: 'New_Capybara',
      usernameNormalized: 'new_capybara',
      avatarId: 'reader',
      emailNormalized: account.email,
      globalRoles: ['student'],
    })
    expect(updated.text).not.toMatch(/email|role|authVersion|password|session|membership|score/i)
  })

  it('rejects writes without valid CSRF and expected origin', async () => {
    const account = await registerTestStudent(app)
    await account.agent
      .patch('/api/me/profile')
      .set('Origin', authOptions.clientOrigin)
      .send({ username: 'New_Capybara', avatarId: 'blue' })
      .expect(403)
    await patchProfile(
      account,
      { username: 'New_Capybara', avatarId: 'blue' },
      {
        origin: 'http://untrusted.example',
      },
    ).expect(403)
  })

  it('rejects mass assignment, user IDs, unsafe keys, invalid names, and unsupported avatars', async () => {
    const account = await registerTestStudent(app)
    const invalidBodies = [
      '{"username":"New_Name","avatarId":"mint","userId":"66f0a35f2d84787cce1a1001"}',
      '{"username":"New_Name","avatarId":"mint","role":"admin"}',
      '{"username":"New_Name","avatarId":"mint","$set":{"accountStatus":"disabled"}}',
      '{"username":"New_Name","avatarId":"mint","__proto__":{"polluted":true}}',
    ]
    for (const body of invalidBodies) {
      const response = await account.agent
        .patch('/api/me/profile')
        .set('Origin', authOptions.clientOrigin)
        .set('X-CSRF-Token', account.csrfToken)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    }
    await patchProfile(account, { username: 'bad name', avatarId: 'mint' }).expect(400)
    await patchProfile(account, {
      username: 'New_Name',
      avatarId: 'data:image/png;base64,xx',
    }).expect(400)
    expect({}.polluted).toBeUndefined()
    expect(await account.agent.get('/api/me/profile').expect(200)).toMatchObject({
      body: { username: account.user.username, avatarId: account.user.avatarId },
    })
  })

  it('maps case-insensitive duplicate and concurrent username races to safe conflicts', async () => {
    const first = await registerTestStudent(app, { username: 'Case_Name' })
    const second = await registerTestStudent(app, { username: 'Other_Name' })
    const duplicate = await patchProfile(second, {
      username: 'case_name',
      avatarId: 'blue',
    }).expect(409)
    expect(duplicate.body.error).toMatchObject({ code: 'PROFILE_CONFLICT' })
    expect(duplicate.text).not.toMatch(/usernameNormalized|duplicate key|index|emailNormalized/i)
    expect(await second.agent.get('/api/me/profile').expect(200)).toMatchObject({
      body: { username: 'Other_Name', avatarId: second.user.avatarId },
    })

    const third = await registerTestStudent(app, { username: 'Third_Name' })
    const fourth = await registerTestStudent(app, { username: 'Fourth_Name' })
    const results = await Promise.all([
      patchProfile(third, { username: 'Shared_Name', avatarId: 'peach' }),
      patchProfile(fourth, { username: 'shared_name', avatarId: 'gamer' }),
    ])
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
    const conflict = results.find(({ status }) => status === 409)
    expect(conflict.text).not.toMatch(/usernameNormalized|duplicate key|index|emailNormalized/i)
    expect(await first.agent.get('/api/me/profile').expect(200)).toMatchObject({
      body: { username: 'Case_Name', avatarId: first.user.avatarId },
    })
  })

  it('rejects an account disabled after registration and preserves its stored profile', async () => {
    const account = await registerTestStudent(app)
    await userModel(database).updateOne(
      { _id: account.user.id },
      { $set: { accountStatus: 'disabled' } },
    )

    await patchProfile(account, { username: 'Disabled_Name', avatarId: 'blue' }).expect(401)
    const stored = await userModel(database).findById(account.user.id).lean()
    expect(stored).toMatchObject({
      username: account.user.username,
      avatarId: account.user.avatarId,
    })
  })
})

describe('how to play dismissal API', () => {
  function putDismissed(account, gameId, body, { token, origin } = {}) {
    return account.agent
      .put(`/api/me/how-to-play/${gameId}`)
      .set('Origin', origin || authOptions.clientOrigin)
      .set('X-CSRF-Token', token || account.csrfToken)
      .send(body)
  }

  it('starts empty, dismisses, repeats idempotently and restores per account', async () => {
    const account = await registerTestStudent(app)
    const other = await registerTestStudent(app)
    expect(account.user.howToPlayDismissed).toEqual([])

    const first = await putDismissed(account, 'clearance-tower', { dismissed: true }).expect(200)
    expect(first.body).toEqual({ howToPlayDismissed: ['clearance-tower'] })
    expect(first.headers['cache-control']).toContain('no-store')
    await putDismissed(account, 'clearance-tower', { dismissed: true }).expect(200)
    const second = await putDismissed(account, 'cli-cyber-defender', { dismissed: true }).expect(
      200,
    )
    expect(second.body.howToPlayDismissed.sort()).toEqual(['clearance-tower', 'cli-cyber-defender'])

    const me = await account.agent.get('/api/auth/me').expect(200)
    expect(me.body.user.howToPlayDismissed.sort()).toEqual([
      'clearance-tower',
      'cli-cyber-defender',
    ])
    const otherMe = await other.agent.get('/api/auth/me').expect(200)
    expect(otherMe.body.user.howToPlayDismissed).toEqual([])

    const removed = await putDismissed(account, 'clearance-tower', { dismissed: false }).expect(200)
    expect(removed.body).toEqual({ howToPlayDismissed: ['cli-cyber-defender'] })
    await putDismissed(account, 'clearance-tower', { dismissed: false }).expect(200)
    expect((await userModel(database).findById(account.user.id).lean()).howToPlayDismissed).toEqual(
      ['cli-cyber-defender'],
    )
  })

  it('rejects unknown games and bodies that are not exactly { dismissed: boolean }', async () => {
    const account = await registerTestStudent(app)
    const unknown = await putDismissed(account, 'threat-briefing', { dismissed: true }).expect(400)
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR')
    await putDismissed(account, 'clearance-tower', { dismissed: true, role: 'admin' }).expect(400)
    await putDismissed(account, 'clearance-tower', { dismissed: 'yes' }).expect(400)
    await putDismissed(account, 'clearance-tower', {}).expect(400)
    const stored = await userModel(database).findById(account.user.id).lean()
    expect(stored.howToPlayDismissed ?? []).toEqual([])
  })

  it('requires a session, CSRF token and expected origin', async () => {
    const account = await registerTestStudent(app)
    await request(app)
      .put('/api/me/how-to-play/clearance-tower')
      .send({ dismissed: true })
      .expect(401)
    await account.agent
      .put('/api/me/how-to-play/clearance-tower')
      .set('Origin', authOptions.clientOrigin)
      .send({ dismissed: true })
      .expect(403)
    await putDismissed(
      account,
      'clearance-tower',
      { dismissed: true },
      { origin: 'http://untrusted.example' },
    ).expect(403)
  })

  it('does not change the profile PATCH allowlist', async () => {
    const account = await registerTestStudent(app)
    await patchProfile(account, {
      username: 'New_Name',
      avatarId: 'mint',
      howToPlayDismissed: ['clearance-tower'],
    }).expect(400)
  })
})
