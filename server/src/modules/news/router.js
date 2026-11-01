import { Router } from 'express'
import { MemoryStore, rateLimit } from 'express-rate-limit'
import { NewsError, parseNewsQuery } from './policy.js'
import { createGuardianProvider } from './providers/guardian.js'
import { createNewsService } from './service.js'
import { createNewsStore } from './store.js'

const NEWS_REQUESTS_PER_MINUTE = 60

export function createNewsRouter(
  database,
  { apiKey, provider, store, now = Date.now, rateLimitPerMinute = NEWS_REQUESTS_PER_MINUTE } = {},
) {
  const service = createNewsService({
    store: store || createNewsStore(database, { now }),
    provider: provider || createGuardianProvider({ apiKey, now }),
    now,
  })
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: rateLimitPerMinute,
    store: new MemoryStore(),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_request, response) {
      response.set('Cache-Control', 'no-store')
      response.set('Retry-After', '60')
      response.status(429).json({
        error: {
          code: 'NEWS_RATE_LIMITED',
          message: 'Too many newspaper requests. Please try again shortly.',
        },
        refreshAvailableAt: new Date(now() + 60000).toISOString(),
        requestId: response.locals.requestId,
      })
    },
  })
  const router = Router()
  router.get('/news', limiter, async (request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      response.json(await service.get(parseNewsQuery(request.query)))
    } catch (error) {
      const safe =
        error instanceof NewsError
          ? error
          : new NewsError(
              'NEWS_UNAVAILABLE',
              'The newspaper is temporarily unavailable. Please try again shortly.',
              now() + 60000,
            )
      if (safe.retryAt)
        response.set('Retry-After', String(Math.max(1, Math.ceil((safe.retryAt - now()) / 1000))))
      response.status(safe.status).json({
        error: { code: safe.code, message: safe.message },
        ...(safe.retryAt && { refreshAvailableAt: new Date(safe.retryAt).toISOString() }),
        requestId: response.locals.requestId,
      })
    }
  })
  return router
}
