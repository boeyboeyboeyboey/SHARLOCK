import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { connectDatabase } from '../../src/config/database.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createTestApp, disposeTestAuthApps, initializeTestAuth } from './auth/helpers.js'

let database
let app
let authOptions

beforeAll(async () => {
  // validate the test target before opening a database connection
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
  app = createTestApp(database, authOptions)
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

describe('Express and MongoDB scaffold', () => {
  it('checks a real database and returns a minimal health response', async () => {
    const response = await request(app).get('/api/health').expect(200)
    expect(response.body).toEqual({ status: 'ok', database: 'connected' })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('limits the health check per address without the normal limit getting in a readiness wait', async () => {
    const limited = createTestApp(database, authOptions, { health: { rateLimitPerMinute: 2 } })
    await request(limited).get('/api/health').expect(200)
    await request(limited).get('/api/health').expect(200)
    const refused = await request(limited).get('/api/health').expect(429)
    expect(refused.headers['retry-after']).toBe('60')
    expect(refused.body).toEqual({ status: 'rate-limited' })
    // a poll about once a second for the whole 30 s startup window stays well under the default
    const normal = createTestApp(database, authOptions)
    for (let poll = 0; poll < 30; poll += 1) await request(normal).get('/api/health').expect(200)
  })

  it('round-trips a document in the disposable database', async () => {
    const collection = database.db.collection('scaffold_checks')
    const record = { _id: randomUUID(), purpose: 'connection verification' }
    try {
      await collection.insertOne(record)
      expect(await collection.findOne({ _id: record._id })).toEqual(record)
    } finally {
      await collection.deleteOne({ _id: record._id })
    }
  })

  it('reports a disconnected database as unavailable', async () => {
    const connection = await connectDatabase(loadEnvironment().databaseUri)
    await connection.close()
    const response = await request(createTestApp(connection, authOptions))
      .get('/api/health')
      .expect(503)
    expect(response.body).toEqual({ status: 'unavailable', database: 'unavailable' })
  })

  it('returns a safe JSON 404 with a server-generated request ID', async () => {
    const response = await request(app).get('/api/not-a-route?secret=private').expect(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
    expect(response.body.requestId).toBe(response.headers['x-request-id'])
    expect(response.text).not.toContain('private')
  })

  it('rejects malformed JSON without echoing the body', async () => {
    const response = await request(app)
      .post('/api/not-a-route')
      .set('Content-Type', 'application/json')
      .send('{"private":')
      .expect(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
    expect(response.text).not.toContain('private')
    expect(response.body.stack).toBeUndefined()
  })

  it('limits JSON request body size', async () => {
    const response = await request(app)
      .post('/api/not-a-route')
      .send({ input: 'x'.repeat(17000) })
      .expect(413)
    expect(response.body.error.code).toBe('BODY_TOO_LARGE')
  })
})
