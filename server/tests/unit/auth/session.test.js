import { describe, expect, it, vi } from 'vitest'
import { AuthMongoStore, validateAuthSettings } from '../../../src/modules/auth/session.js'

function makeSession(now) {
  return {
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
    absoluteExpiresAt: new Date(now + 60_000),
    userId: 'user-id',
    authVersion: 1,
    cookie: {
      expires: new Date(now + 30_000),
      toJSON() {
        return { expires: this.expires }
      },
    },
  }
}

function invokeStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error) => (error ? reject(error) : resolve()))
  })
}

function makeAdapter(now) {
  const records = new Map()
  const store = {
    set: vi.fn((sessionId, sessionData, callback) => {
      records.set(sessionId, {
        session: sessionData,
        expires: new Date(sessionData.cookie.expires),
      })
      callback(null)
    }),
    destroy: vi.fn((sessionId, callback) => {
      records.delete(sessionId)
      callback(null)
    }),
    get: vi.fn(),
  }
  const collection = {
    updateOne: vi.fn(async (filter, update, options) => {
      const record = records.get(filter._id)
      const absoluteExpiry = record?.session.absoluteExpiresAt
      if (
        !record ||
        options.upsert !== false ||
        record.expires <= filter.expires.$gt ||
        absoluteExpiry <= filter['session.absoluteExpiresAt'].$gt
      ) {
        return { matchedCount: 0 }
      }
      record.session = update.$set.session || record.session
      record.expires = update.$set.expires || record.expires
      if (update.$set['session.lastSeenAt']) {
        record.session.lastSeenAt = update.$set['session.lastSeenAt']
      }
      return { matchedCount: 1 }
    }),
  }
  const adapter = new AuthMongoStore(store, collection, () => now)
  return { adapter, collection, records, store }
}

describe('Mongo auth session adapter', () => {
  it('accepts only validated loopback development and test origins', () => {
    const secret = 'a'.repeat(64)
    expect(
      validateAuthSettings({
        nodeEnv: 'test',
        clientOrigin: 'http://localhost:5173',
        sessionSecret: secret,
      }).secureCookie,
    ).toBe(false)
    expect(() =>
      validateAuthSettings({
        nodeEnv: 'test',
        clientOrigin: 'https://localhost:5173',
        sessionSecret: secret,
      }),
    ).toThrow(/exact validated origin/)
    expect(() =>
      validateAuthSettings({
        nodeEnv: 'development',
        clientOrigin: 'http://sharlock.example',
        sessionSecret: secret,
      }),
    ).toThrow(/exact validated origin/)
    expect(() =>
      validateAuthSettings({
        nodeEnv: 'production',
        clientOrigin: 'http://localhost:5173',
        sessionSecret: secret,
      }),
    ).toThrow(/development or test/)
  })

  it('does not recreate a revoked session when stale save or touch completes later', async () => {
    const now = Date.now()
    const { adapter, collection, records, store } = makeAdapter(now)
    const sessionData = makeSession(now)
    records.set('revoked-id', {
      session: sessionData,
      expires: new Date(now + 30_000),
    })

    await invokeStore(adapter, 'destroy', 'revoked-id')
    await expect(invokeStore(adapter, 'set', 'revoked-id', sessionData)).rejects.toThrow(
      'Session no longer exists.',
    )
    await expect(invokeStore(adapter, 'touch', 'revoked-id', sessionData)).resolves.toBeUndefined()

    expect(records.has('revoked-id')).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
    expect(collection.updateOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ _id: 'revoked-id' }),
      expect.any(Object),
      { upsert: false },
    )
    expect(collection.updateOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ _id: 'revoked-id' }),
      expect.any(Object),
      { upsert: false },
    )
  })

  it('uses connect-mongo upsert only for a successfully regenerated session object', async () => {
    const now = Date.now()
    const { adapter, records, store } = makeAdapter(now)
    const request = { sessionID: 'old-id' }
    adapter.generate = (nextRequest) => {
      nextRequest.sessionID = 'new-id'
      nextRequest.session = makeSession(now)
    }

    await new Promise((resolve, reject) => {
      adapter.regenerate(request, (error) => (error ? reject(error) : resolve()))
    })
    await invokeStore(adapter, 'set', request.sessionID, request.session)

    expect(store.set).toHaveBeenCalledOnce()
    expect(records.has('new-id')).toBe(true)
  })

  it('updates activity metadata through a conditional existing-session save', async () => {
    const now = Date.now()
    const { adapter, records } = makeAdapter(now)
    const sessionData = makeSession(now)
    sessionData.lastSeenAt = new Date(now - 1_000)
    records.set('active-id', {
      session: sessionData,
      expires: new Date(now + 30_000),
    })

    await invokeStore(adapter, 'set', 'active-id', sessionData)

    expect(records.get('active-id').session.lastSeenAt).toEqual(new Date(now))
    expect(records.has('active-id')).toBe(true)
  })

  it('refuses saves and touches after the absolute expiry even while the record remains', async () => {
    const now = Date.now()
    const { adapter, records } = makeAdapter(now)
    const sessionData = makeSession(now - 60_000)
    records.set('expired-id', {
      session: sessionData,
      expires: new Date(now + 30_000),
    })

    await expect(invokeStore(adapter, 'set', 'expired-id', sessionData)).rejects.toThrow(
      'Session no longer exists.',
    )
    await expect(invokeStore(adapter, 'touch', 'expired-id', sessionData)).resolves.toBeUndefined()
    expect(records.has('expired-id')).toBe(true)
  })
})
