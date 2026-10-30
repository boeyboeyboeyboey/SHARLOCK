import { describe, expect, it } from 'vitest'
import { createTokenBucket } from '../../../src/modules/games/social-engineering-simulator/limiter.js'

describe('token bucket', () => {
  it('allows the burst, then refuses until it refills', () => {
    let clock = 0
    const bucket = createTokenBucket({ perMinute: 3, now: () => clock })
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ])
    clock += 19999
    expect(bucket.take()).toBe(false)
    clock += 2
    expect(bucket.take()).toBe(true)
  })

  it('never stores more than one minute of requests', () => {
    let clock = 0
    const bucket = createTokenBucket({ perMinute: 2, now: () => clock })
    clock += 10 * 60000
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false])
  })
})
