import { Router } from 'express'
import { ClearanceError, rateLimited } from './policy.js'
import { createClearanceService } from './service.js'

const WINDOW_MS = 60000
const MAX_REQUESTS_PER_WINDOW = 300
const MAX_TRACKED_CLIENTS = 500

// courtesy pacing for a public unauthenticated endpoint, not a security boundary
function createPacer(now, limit) {
  const seen = new Map()
  return function allow(key) {
    const cutoff = now() - WINDOW_MS
    const recent = (seen.get(key) ?? []).filter((stamp) => stamp > cutoff)
    const allowed = recent.length < limit
    if (allowed) recent.push(now())
    seen.set(key, recent)
    if (seen.size > MAX_TRACKED_CLIENTS) seen.delete(seen.keys().next().value)
    return allowed
  }
}

function sendError(response, error) {
  const safe =
    error instanceof ClearanceError
      ? error
      : new ClearanceError(
          'CLEAR_UNAVAILABLE',
          'The tower is temporarily unavailable. Please try again shortly.',
          503,
        )
  response.status(safe.status).json({
    error: {
      code: safe.code,
      message: safe.message,
      ...(safe.fieldErrors && { fieldErrors: safe.fieldErrors }),
    },
    requestId: response.locals.requestId,
  })
}

export function createClearanceRouter({
  service,
  now = Date.now,
  limit = MAX_REQUESTS_PER_WINDOW,
} = {}) {
  const game = service || createClearanceService()
  const allow = createPacer(now, limit)
  const router = Router()
  const base = '/games/clearance-tower'

  function handle(action) {
    return (request, response) => {
      response.set('Cache-Control', 'no-store')
      try {
        if (!allow(request.ip || 'unknown')) throw rateLimited()
        response.json(action(request))
      } catch (error) {
        sendError(response, error)
      }
    }
  }

  router.get(
    `${base}/levels`,
    handle(() => game.listLevels()),
  )

  return router
}
