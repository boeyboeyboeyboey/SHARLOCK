import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeNewsStorage, newsModels } from '../../../src/modules/news/models.js'
import { createNewsStore } from '../../../src/modules/news/store.js'
import { createGuardianProvider } from '../../../src/modules/news/providers/guardian.js'
import { createTestApp, disposeTestAuthApps, initializeTestAuth } from '../auth/helpers.js'

let database
let models
let app
let provider
let authOptions
const article = {
  id: 'test',
  title: 'Synthetic newspaper test',
  url: 'https://www.theguardian.com/test',
  publishedAt: new Date().toISOString(),
  byline: [{ type: 'text', text: 'Test reporter' }],
  excerpt: [{ type: 'text', text: 'Fixture only' }],
  copyright: '',
}

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('News integration tests require an isolated test database')
  database = await connectDatabase(config.databaseUri)
  await initializeNewsStorage(database)
  authOptions = await initializeTestAuth(database, config)
  models = newsModels(database)
})
beforeEach(async () => {
  await models.Cache.deleteMany({})
  await models.Quota.deleteMany({})
  provider = {
    configured: true,
    fetchEdition: vi.fn(async () => ({ articles: [article], partial: false })),
  }
  app = createTestApp(database, authOptions, { news: { provider } })
})
afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('news HTTP and Mongo persistence', () => {
  it('persists one shared edition, serializes a safe DTO and reuses it after a new app instance', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/news').expect(200)),
    )
    expect(provider.fetchEdition).toHaveBeenCalledTimes(1)
    expect(results[0].headers['cache-control']).toBe('no-store')
    expect(results[0].body.articles).toEqual([article])
    expect(results[0].body).not.toHaveProperty('_id')
    expect(await models.Cache.countDocuments()).toBe(1)
    expect((await models.Quota.findById(new Date().toISOString().slice(0, 10))).used).toBe(1)
    const anotherApp = createTestApp(database, authOptions, { news: { provider } })
    await request(anotherApp).get('/api/news').expect(200)
    expect(provider.fetchEdition).toHaveBeenCalledTimes(1)
    expect(
      (await models.Cache.collection.indexes()).some((index) => index.expireAfterSeconds === 0),
    ).toBe(true)
  })
  it.each([
    'section=technology&section=cybersecurity',
    'range[]=week',
    'section[$ne]=technology',
    'url=https://example.com',
    'q=phishing',
    'range=year',
  ])('rejects invalid input without spending provider quota: %s', async (query) => {
    const result = await request(app).get(`/api/news?${query}`).expect(400)
    expect(result.body.error.code).toBe('INVALID_NEWS_QUERY')
    expect(provider.fetchEdition).not.toHaveBeenCalled()
  })
  it('atomically prevents overspending the daily allowance', async () => {
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    await models.Quota.create({
      _id: day,
      used: 449,
      nextRequestAt: new Date(0),
      expiresAt: new Date(now + 86400000),
    })
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createNewsStore(database).reserve()),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await models.Quota.findById(day)).used).toBe(450)
    await request(app).get('/api/news').expect(503).expect('Retry-After', /\d+/)
    expect(provider.fetchEdition).not.toHaveBeenCalled()
  })
  it('persists the provider pacing gap independently of the daily budget key', async () => {
    const time = Date.now()
    await models.Quota.create({
      _id: 'guardian-pacing',
      used: 0,
      nextRequestAt: new Date(time + 600),
      expiresAt: new Date(time + 86400000),
    })
    await createNewsStore(database).reserve()
    expect(Date.now() - time).toBeGreaterThanOrEqual(580)
    expect(
      (await models.Quota.findById('guardian-pacing')).nextRequestAt.getTime(),
    ).toBeGreaterThan(time + 1500)
  })

  it('keeps fresh cache but never serves expired publisher text during failure', async () => {
    await request(app).get('/api/news').expect(200)
    await models.Cache.updateMany({}, { freshUntil: new Date(Date.now() - 1000) })
    provider.fetchEdition.mockRejectedValue(new Error('private upstream credentials'))
    const stale = await request(app).get('/api/news').expect(200)
    expect(stale.body.stale).toBe(true)
    await models.Cache.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    const expired = await request(app).get('/api/news').expect(503)
    expect(expired.text).not.toContain('private')
    expect(expired.body.articles).toBeUndefined()
    await createNewsStore(database).cleanup()
    expect(await models.Cache.countDocuments()).toBe(0)
  })
  it('serves the labelled sample without a key, stores nothing and leaves the rest of the app usable', async () => {
    const unconfigured = createTestApp(database, authOptions)
    const result = await request(unconfigured).get('/api/news').expect(200)
    expect(result.body).toMatchObject({ sample: true, provider: 'Sample edition' })
    expect(result.body.articles.length).toBeGreaterThan(0)
    expect(result.body.articles.every((story) => story.url === '')).toBe(true)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(await models.Cache.countDocuments()).toBe(0)
    expect(await models.Quota.countDocuments()).toBe(0)
    await request(unconfigured).get('/api/health').expect(200)
  })
  it('falls back to the sample when the real provider cannot reach the publisher', async () => {
    const failing = createGuardianProvider({
      apiKey: 'test-only-not-a-key',
      fetchImpl: async () => {
        throw new Error('offline')
      },
    })
    const offline = createTestApp(database, authOptions, { news: { provider: failing } })
    const result = await request(offline).get('/api/news').expect(200)
    expect(result.body.sample).toBe(true)
    expect(result.text).not.toContain('test-only-not-a-key')
    expect(await models.Cache.countDocuments()).toBe(0)
  })
  it('limits requests per address and answers in the usual error shape', async () => {
    const limited = createTestApp(database, authOptions, {
      news: { provider, rateLimitPerMinute: 2 },
    })
    await request(limited).get('/api/news').expect(200)
    await request(limited).get('/api/news').expect(200)
    const refused = await request(limited).get('/api/news').expect(429).expect('Retry-After', '60')
    expect(refused.body.error.code).toBe('NEWS_RATE_LIMITED')
    expect(refused.body.requestId).toBe(refused.headers['x-request-id'])
  })
})
