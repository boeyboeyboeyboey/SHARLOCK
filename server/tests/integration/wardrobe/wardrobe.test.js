import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

let database
let authOptions
let app

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') {
    throw new Error('Wardrobe integration tests require NODE_ENV=test.')
  }
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  if (!database?.name?.endsWith('_test')) {
    throw new Error('Refusing wardrobe fixture cleanup outside a disposable _test database.')
  }
  await Promise.all([
    database.db.collection('users').deleteMany({}),
    database.db.collection('auth_sessions').deleteMany({}),
    database.db.collection('game_attempts').deleteMany({}),
  ])
  app = createTestApp(database, authOptions)
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

const defaults = {
  scarf: 'scarf-red',
  hat: 'hat-deerstalker',
  monocle: 'monocle-gold',
  accessory: 'accessory-none',
}

function equip(account, slot, body, { token } = {}) {
  const call = account.agent.put(`/api/me/wardrobe/${slot}`).set('Origin', authOptions.clientOrigin)
  if (token !== null) call.set('X-CSRF-Token', token ?? account.csrfToken)
  return call.send(body)
}

// completed rows written directly: the progress read only needs these stored fields
async function seedCompleted(account, gameId, overrides = {}) {
  await database.db.collection('game_attempts').insertOne({
    playerId: new Types.ObjectId(account.user.id),
    gameId,
    rulesetVersion: 'seed-1',
    status: 'completed',
    mode: 'practice',
    score: 5,
    maxScore: 10,
    completedAt: new Date(),
    topicOutcomes: [],
    ...overrides,
  })
}

describe('wardrobe API', () => {
  it('requires a session', async () => {
    await request(app).get('/api/me/wardrobe').expect(401)
  })

  it('returns defaults unlocked and everything else locked for a fresh student', async () => {
    const account = await registerTestStudent(app)
    const response = await account.agent.get('/api/me/wardrobe').expect(200)
    expect(response.body.equipped).toEqual(defaults)
    expect(response.headers['cache-control']).toContain('no-store')
    const unlocked = response.body.items.filter((entry) => entry.unlocked).map((entry) => entry.id)
    expect(unlocked.sort()).toEqual(Object.values(defaults).sort())
    expect(response.body.items.find((entry) => entry.id === 'scarf-navy')).toEqual({
      id: 'scarf-navy',
      slot: 'scarf',
      name: 'Navy scarf',
      unlocked: false,
      unlockedBy: 'first-close-sql-injection-arcade',
      unlockedByName: 'Customs cleared',
    })
  })

  it('equips a default item', async () => {
    const account = await registerTestStudent(app)
    const response = await equip(account, 'hat', { itemId: 'hat-deerstalker' }).expect(200)
    expect(response.body).toEqual({ equipped: defaults })
  })

  it('rejects a locked item with a generic 403', async () => {
    const account = await registerTestStudent(app)
    const response = await equip(account, 'scarf', { itemId: 'scarf-navy' }).expect(403)
    expect(response.body.error.code).toBe('WARDROBE_ITEM_LOCKED')
    expect(JSON.stringify(response.body)).not.toContain('first-close')
  })

  it('rejects wrong slot, unknown slot, bad bodies and query strings with 400', async () => {
    const account = await registerTestStudent(app)
    await equip(account, 'scarf', { itemId: 'hat-flat-cap' }).expect(400)
    await equip(account, 'cape', { itemId: 'scarf-red' }).expect(400)
    await equip(account, 'scarf', { itemId: 'scarf-red', extra: true }).expect(400)
    await equip(account, 'scarf', { itemId: 7 }).expect(400)
    await equip(account, 'scarf', {}).expect(400)
    await account.agent
      .put('/api/me/wardrobe/scarf?x=1')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', account.csrfToken)
      .send({ itemId: 'scarf-red' })
      .expect(400)
  })

  it('rejects a missing csrf token and a foreign origin', async () => {
    const account = await registerTestStudent(app)
    await equip(account, 'scarf', { itemId: 'scarf-red' }, { token: null }).expect(403)
    await account.agent
      .put('/api/me/wardrobe/scarf')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', account.csrfToken)
      .send({ itemId: 'scarf-red' })
      .expect(403)
  })

  it('unlocks and equips an item after a qualifying completed attempt', async () => {
    const account = await registerTestStudent(app)
    await seedCompleted(account, 'clearance-tower')
    const listed = await account.agent.get('/api/me/wardrobe').expect(200)
    expect(listed.body.items.find((entry) => entry.id === 'scarf-forest').unlocked).toBe(true)
    expect(listed.body.items.find((entry) => entry.id === 'hat-brown-tweed').unlocked).toBe(true)
    expect(listed.body.items.find((entry) => entry.id === 'scarf-navy').unlocked).toBe(false)

    const response = await equip(account, 'scarf', { itemId: 'scarf-forest' }).expect(200)
    expect(response.body.equipped).toEqual({ ...defaults, scarf: 'scarf-forest' })

    const me = await account.agent.get('/api/auth/me').expect(200)
    expect(me.body.user.wardrobe).toEqual({ ...defaults, scarf: 'scarf-forest' })
    expect((await account.agent.get('/api/me/wardrobe').expect(200)).body.equipped.scarf).toBe(
      'scarf-forest',
    )
  })

  it('unlocks the brass monocle only from a standard run on a competitive ruleset', async () => {
    const account = await registerTestStudent(app)
    await seedCompleted(account, 'cli-cyber-defender', { rulesetVersion: 'cli-3' })
    await equip(account, 'monocle', { itemId: 'monocle-brass' }).expect(403)
    await seedCompleted(account, 'cli-cyber-defender', {
      rulesetVersion: 'cli-3',
      mode: 'standard',
    })
    await equip(account, 'monocle', { itemId: 'monocle-brass' }).expect(200)
  })

  it("does not use or change another user's wardrobe", async () => {
    const first = await registerTestStudent(app)
    const second = await registerTestStudent(app)
    await seedCompleted(first, 'clearance-tower')
    await equip(first, 'scarf', { itemId: 'scarf-forest' }).expect(200)
    await equip(second, 'scarf', { itemId: 'scarf-forest' }).expect(403)
    const other = await second.agent.get('/api/me/wardrobe').expect(200)
    expect(other.body.equipped).toEqual(defaults)
    expect(other.body.items.find((entry) => entry.id === 'scarf-forest').unlocked).toBe(false)
  })

  it('rejects a wardrobe key on the profile update', async () => {
    const account = await registerTestStudent(app)
    await account.agent
      .patch('/api/me/profile')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', account.csrfToken)
      .send({
        username: account.user.username,
        avatarId: account.user.avatarId,
        wardrobe: { scarf: 'scarf-navy' },
      })
      .expect(400)
    expect((await account.agent.get('/api/me/wardrobe').expect(200)).body.equipped).toEqual(
      defaults,
    )
  })

  it('reads defaults for an old user document without the field', async () => {
    const account = await registerTestStudent(app)
    await database.db
      .collection('users')
      .updateOne({ _id: new Types.ObjectId(account.user.id) }, { $unset: { wardrobe: '' } })
    expect((await account.agent.get('/api/me/wardrobe').expect(200)).body.equipped).toEqual(
      defaults,
    )
    const me = await account.agent.get('/api/auth/me').expect(200)
    expect(me.body.user.wardrobe).toEqual(defaults)
  })
})
