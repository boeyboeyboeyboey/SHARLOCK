import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'

// every request pings the database; generous enough for a readiness wait, which polls about once a second
const HEALTH_REQUESTS_PER_MINUTE = 120

export function createHealthRouter(
  database,
  { rateLimitPerMinute = HEALTH_REQUESTS_PER_MINUTE } = {},
) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: rateLimitPerMinute,
    store: new MemoryStore(),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({ status: 'rate-limited' })
    },
  })
  const router = Router()
  router.get('/health', limiter, async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      if (database.readyState !== 1) throw new Error()
      await database.db.admin().command({ ping: 1 }, { maxTimeMS: 1000 })
      response.json({ status: 'ok', database: 'connected' })
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'unavailable' })
    }
  })
  return router
}
