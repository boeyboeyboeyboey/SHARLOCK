import session from 'express-session'
import MongoStore from 'connect-mongo'

export const SESSION_COOKIE_NAME = 'sharlock.sid'
export const AUTH_IDLE_MS = 30 * 60 * 1000
export const AUTH_ABSOLUTE_MS = 8 * 60 * 60 * 1000
export const CSRF_ABSOLUTE_MS = 10 * 60 * 1000
// outlives the emailed code, so an expired code is reported as such and can be resent
export const VERIFICATION_SESSION_MS = 30 * 60 * 1000

function idleWindowFor(sessionData) {
  if (sessionData.userId || sessionData.replacedAt) return AUTH_IDLE_MS
  return sessionData.pendingVerificationUserId ? VERIFICATION_SESSION_MS : CSRF_ABSOLUTE_MS
}

function safeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Auth settings are required.')
  }

  const allowedKeys = new Set(['nodeEnv', 'clientOrigin', 'sessionSecret', 'now'])
  if (Object.keys(settings).some((key) => !allowedKeys.has(key))) {
    throw new TypeError('Auth settings contain an unsupported field.')
  }
  if (!['development', 'test'].includes(settings.nodeEnv)) {
    throw new TypeError('Auth nodeEnv must be development or test.')
  }
  if (
    typeof settings.sessionSecret !== 'string' ||
    !/^[a-fA-F0-9]{64,}$/.test(settings.sessionSecret)
  ) {
    throw new TypeError('Auth sessionSecret must contain at least 64 hexadecimal characters.')
  }
  if (settings.now !== undefined && typeof settings.now !== 'function') {
    throw new TypeError('Auth clock must be a function.')
  }

  let origin
  try {
    origin = new URL(settings.clientOrigin)
  } catch {
    throw new TypeError('Auth clientOrigin must be an exact HTTP origin.')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if (
    origin.origin !== settings.clientOrigin ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.protocol !== 'http:' ||
    !loopback
  ) {
    throw new TypeError('Auth clientOrigin must be an exact validated origin.')
  }

  return Object.freeze({
    nodeEnv: settings.nodeEnv,
    clientOrigin: settings.clientOrigin,
    sessionSecret: settings.sessionSecret,
    now: settings.now || Date.now,
    // only a validated loopback http origin reaches here
    secureCookie: false,
  })
}

function callbackPromise(invoke) {
  return new Promise((resolve, reject) => {
    invoke((error, value) => (error ? reject(error) : resolve(value)))
  })
}

function serializeSession(sessionData) {
  const serialized = {}
  for (const [key, value] of Object.entries(sessionData)) {
    serialized[key] =
      key === 'cookie' && typeof value?.toJSON === 'function' ? value.toJSON() : value
  }
  return serialized
}

function sessionExpiresAt(sessionData, now) {
  const currentTime = now()
  const absoluteExpiry = sessionData.absoluteExpiresAt
    ? new Date(sessionData.absoluteExpiresAt).getTime()
    : currentTime + AUTH_ABSOLUTE_MS
  return new Date(Math.min(currentTime + idleWindowFor(sessionData), absoluteExpiry))
}

export class AuthMongoStore extends session.Store {
  constructor(store, collection, now) {
    super()
    this.store = store
    this.collection = collection
    this.now = now
    this.newSessions = new WeakSet()
  }

  get(sessionId, callback) {
    this.store.get(sessionId, callback)
  }

  set(sessionId, sessionData, callback) {
    if (this.newSessions.has(sessionData)) {
      this.newSessions.delete(sessionData)
      this.store.set(sessionId, sessionData, callback)
      return
    }

    const currentTime = this.now()
    const serialized = serializeSession(sessionData)
    serialized.lastSeenAt = new Date(currentTime)
    this.collection
      .updateOne(
        {
          _id: sessionId,
          expires: { $gt: new Date(currentTime) },
          'session.absoluteExpiresAt': { $gt: new Date(currentTime) },
          // a request still in flight when its session was replaced must not restore it
          'session.replacedAt': { $exists: false },
        },
        {
          $set: {
            session: serialized,
            expires: sessionExpiresAt(sessionData, this.now),
          },
        },
        { upsert: false },
      )
      .then((result) => {
        if (result.matchedCount === 0) {
          callback(new Error('Session no longer exists.'))
          return
        }
        callback(null)
      })
      .catch((error) => callback(error))
  }

  destroy(sessionId, callback) {
    this.store.destroy(sessionId, callback)
  }

  regenerate(request, callback) {
    super.regenerate(request, (error) => {
      if (!error) this.newSessions.add(request.session)
      callback(error)
    })
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const touchedAt = this.now()
    const absoluteExpiry = sessionData.absoluteExpiresAt
      ? new Date(sessionData.absoluteExpiresAt).getTime()
      : touchedAt + CSRF_ABSOLUTE_MS
    const expiresAt = new Date(Math.min(touchedAt + idleWindowFor(sessionData), absoluteExpiry))
    this.collection
      .updateOne(
        {
          _id: sessionId,
          expires: { $gt: new Date(touchedAt) },
          'session.absoluteExpiresAt': { $gt: new Date(touchedAt) },
          'session.replacedAt': { $exists: false },
        },
        {
          $set: {
            expires: expiresAt,
            'session.lastSeenAt': new Date(touchedAt),
          },
        },
        { upsert: false },
      )
      .then(() => callback(null))
      .catch((error) => callback(error))
  }
}

export function validateAuthSettings(settings) {
  return safeSettings(settings)
}

export function createAuthSessionMiddleware(database, settings) {
  const authSettings = safeSettings(settings)
  if (!database?.db || typeof database.getClient !== 'function' || !database.name) {
    throw new TypeError('A connected Mongoose database is required for auth sessions.')
  }

  const mongoStore = MongoStore.create({
    clientPromise: Promise.resolve(database.getClient()),
    dbName: database.name,
    collectionName: 'auth_sessions',
    autoRemove: 'disabled',
    stringify: false,
    touchAfter: 0,
    ttl: AUTH_ABSOLUTE_MS / 1000,
  })
  const store = new AuthMongoStore(
    mongoStore,
    database.db.collection('auth_sessions'),
    authSettings.now,
  )
  const middleware = session({
    name: SESSION_COOKIE_NAME,
    secret: authSettings.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: authSettings.secureCookie,
      path: '/api',
      maxAge: CSRF_ABSOLUTE_MS,
    },
  })

  return Object.freeze({ middleware, settings: authSettings, store })
}

export function setSessionCookieLifetime(request, now = Date.now) {
  if (!request.session) return
  const currentTime = now()
  const absoluteExpiry = request.session.absoluteExpiresAt
    ? new Date(request.session.absoluteExpiresAt).getTime()
    : currentTime + CSRF_ABSOLUTE_MS
  const maxAge = idleWindowFor(request.session)
  request.session.cookie.maxAge = Math.max(0, Math.min(maxAge, absoluteExpiry - currentTime))
  request.session.cookie.expires = new Date(
    currentTime + Math.max(0, Math.min(maxAge, absoluteExpiry - currentTime)),
  )
}

export async function rotateSession(request, values) {
  await callbackPromise((callback) => request.session.regenerate(callback))
  Object.assign(request.session, values)
}

export async function saveSession(request) {
  await callbackPromise((callback) => request.session.save(callback))
}

export async function destroySession(request) {
  if (!request.session) return
  await callbackPromise((callback) => request.session.destroy(callback))
}

export function createAnonymousSessionValues(now = Date.now) {
  const currentTime = now()
  return {
    createdAt: new Date(currentTime),
    lastSeenAt: new Date(currentTime),
    absoluteExpiresAt: new Date(currentTime + CSRF_ABSOLUTE_MS),
    userId: null,
    authVersion: null,
  }
}

export function createPendingVerificationSessionValues(userId, authVersion, now = Date.now) {
  const currentTime = now()
  return {
    ...createAnonymousSessionValues(() => currentTime),
    absoluteExpiresAt: new Date(currentTime + VERIFICATION_SESSION_MS),
    pendingVerificationUserId: userId,
    pendingVerificationAuthVersion: authVersion,
  }
}

export function createAuthenticatedSessionValues(userId, authVersion, now = Date.now) {
  const currentTime = now()
  return {
    createdAt: new Date(currentTime),
    lastSeenAt: new Date(currentTime),
    absoluteExpiresAt: new Date(currentTime + AUTH_ABSOLUTE_MS),
    userId,
    authVersion,
  }
}

export function sessionIsExpired(sessionData, now = Date.now) {
  if (!sessionData?.createdAt || !sessionData?.absoluteExpiresAt) return true
  const currentTime = now()
  const absoluteExpiry = new Date(sessionData.absoluteExpiresAt).getTime()
  if (!Number.isFinite(absoluteExpiry) || absoluteExpiry <= currentTime) return true
  if (!sessionData.lastSeenAt) return true
  const lastSeenAt = new Date(sessionData.lastSeenAt).getTime()
  if (!Number.isFinite(lastSeenAt)) return true
  return currentTime - lastSeenAt >= idleWindowFor(sessionData)
}

export function clearSessionCookie(response, secureCookie) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(secureCookie),
    path: '/api',
  })
}
