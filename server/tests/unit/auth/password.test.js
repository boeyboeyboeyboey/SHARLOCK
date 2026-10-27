import { describe, expect, it, vi } from 'vitest'
import {
  createPasswordGate,
  hashPassword,
  passwordHashOptions,
  verifyDummyPassword,
  verifyPassword,
} from '../../../src/modules/auth/password.js'

function deferred() {
  let resolve
  const promise = new Promise((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

describe('Argon2id password operations', () => {
  it('uses the approved Argon2id work factors and salted hashes', async () => {
    const password = 'Correct-Horse-🔒-2026'
    const firstHash = await hashPassword(password)
    const secondHash = await hashPassword(password)

    expect(passwordHashOptions).toMatchObject({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    })
    expect(firstHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/)
    expect(secondHash).not.toBe(firstHash)
    await expect(verifyPassword(firstHash, password)).resolves.toBe(true)
    await expect(verifyPassword(firstHash, 'wrong password')).resolves.toBe(false)
    await expect(verifyDummyPassword('unknown account password')).resolves.toBe(false)
  })

  it('queues a third simultaneous operation until a slot frees', async () => {
    const gate = createPasswordGate()
    const first = deferred()
    const second = deferred()
    const firstRun = gate(() => first.promise)
    const secondRun = gate(() => second.promise)
    let thirdStarted = false
    const thirdRun = gate(async () => {
      thirdStarted = true
      return 'third'
    })

    await Promise.resolve()
    expect(thirdStarted).toBe(false)
    first.resolve('first')
    await expect(thirdRun).resolves.toBe('third')
    second.resolve('second')
    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second'])
  })

  it('starts queued operations in arrival order', async () => {
    const gate = createPasswordGate({ maximumOperations: 1 })
    const held = deferred()
    const order = []
    const holder = gate(() => held.promise)
    const runs = ['a', 'b', 'c'].map((name) => gate(async () => order.push(name)))

    held.resolve()
    await Promise.all([holder, ...runs])
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('answers busy when the queue is full', async () => {
    const gate = createPasswordGate({ maximumOperations: 1, maximumWaiting: 1 })
    const held = deferred()
    const holder = gate(() => held.promise)
    const queued = gate(async () => 'queued')

    await expect(gate(async () => 'overflow')).rejects.toMatchObject({
      code: 'PASSWORD_SERVICE_BUSY',
      status: 503,
    })
    held.resolve()
    await expect(queued).resolves.toBe('queued')
    await holder
  })

  it('answers busy when a queued operation waits too long, then frees its place', async () => {
    vi.useFakeTimers()
    try {
      const gate = createPasswordGate({ maximumOperations: 1, maximumWaiting: 1, waitMs: 5000 })
      const held = deferred()
      const holder = gate(() => held.promise)
      let lateStarted = false
      const late = gate(async () => {
        lateStarted = true
      })
      const lateResult = expect(late).rejects.toMatchObject({ code: 'PASSWORD_SERVICE_BUSY' })

      await vi.advanceTimersByTimeAsync(5000)
      await lateResult
      expect(lateStarted).toBe(false)

      const next = gate(async () => 'next')
      held.resolve()
      await expect(next).resolves.toBe('next')
      await holder
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
