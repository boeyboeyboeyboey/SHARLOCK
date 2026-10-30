// server-wide token bucket for model requests: refills continuously, starts full
export const DEFAULT_REQUESTS_PER_MINUTE = 10

export function createTokenBucket({
  perMinute = DEFAULT_REQUESTS_PER_MINUTE,
  now = Date.now,
} = {}) {
  let tokens = perMinute
  let last = now()
  return {
    take() {
      const current = now()
      tokens = Math.min(perMinute, tokens + ((current - last) * perMinute) / 60000)
      last = current
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
  }
}
