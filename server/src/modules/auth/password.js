import argon2 from 'argon2'
import { AuthError } from './policy.js'

export const passwordHashOptions = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
})

const DUMMY_PASSWORD = 'sharlock-auth-dummy-verification-value'
const gateLimits = Object.freeze({ maximumOperations: 2, maximumWaiting: 32, waitMs: 5000 })

export class PasswordBusyError extends AuthError {
  constructor() {
    super('PASSWORD_SERVICE_BUSY', 'Sign-in is temporarily busy. Please try again shortly.', 503)
    this.name = 'PasswordBusyError'
  }
}

// at most maximumOperations hashes run at once to bound memory; later callers wait in order
// for a slot, and only a full queue or a wait past waitMs answers busy
export function createPasswordGate(limits = gateLimits) {
  const { maximumOperations, maximumWaiting, waitMs } = { ...gateLimits, ...limits }
  let activeOperations = 0
  const waiting = []

  function acquire() {
    if (activeOperations < maximumOperations) {
      activeOperations += 1
      return Promise.resolve()
    }
    if (waiting.length >= maximumWaiting) return Promise.reject(new PasswordBusyError())
    return new Promise((resolve, reject) => {
      const entry = { resolve }
      entry.timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(entry), 1)
        reject(new PasswordBusyError())
      }, waitMs)
      entry.timer.unref?.()
      waiting.push(entry)
    })
  }

  function release() {
    const next = waiting.shift()
    if (!next) {
      activeOperations -= 1
      return
    }
    // the slot passes straight to the next caller, so activeOperations stays the same
    clearTimeout(next.timer)
    next.resolve()
  }

  return async function runPasswordOperation(operation) {
    await acquire()
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

const dummyPasswordHash = await argon2.hash(DUMMY_PASSWORD, passwordHashOptions)
const runPasswordOperation = createPasswordGate()

export function hashPassword(password) {
  return runPasswordOperation(() => argon2.hash(password, passwordHashOptions))
}

export function verifyPassword(passwordHash, password) {
  return runPasswordOperation(() => argon2.verify(passwordHash, password))
}

export function verifyDummyPassword(password) {
  return runPasswordOperation(() => argon2.verify(dummyPasswordHash, password))
}
