import { Router } from 'express'
import { AuthError } from '../../auth/policy.js'
import { CohortError } from '../../cohorts/policy.js'
import { AttemptError } from '../../attempts/policy.js'
import {
  CliError,
  parseCommandBody,
  parseCompleteBody,
  parseEmptyBody,
  parseHintBody,
  parseRunId,
  parseStart,
  rateLimited,
} from './policy.js'
import { createCliDefenderService } from './service.js'

const WINDOW_MS = 60000
const MAX_REQUESTS_PER_WINDOW = 300
const MAX_TRACKED_CLIENTS = 500

// courtesy pacing for a public unauthenticated endpoint, not a security boundary
function createPacer(now, limit) {
  const seen = new Map()
  return function allow(key) {
    const cutoff = now() - WINDOW_MS
    const recent = (seen.get(key) ?? []).filter((stamp) => stamp > cutoff)
    if (recent.length >= limit) {
      seen.set(key, recent)
      return false
    }
    recent.push(now())
    seen.set(key, recent)
    if (seen.size > MAX_TRACKED_CLIENTS) seen.delete(seen.keys().next().value)
    return true
  }
}

const authMessages = {
  AUTHENTICATION_REQUIRED: [401, 'Sign in to continue.'],
  CAPABILITY_FORBIDDEN: [403, 'This action is unavailable.'],
  CSRF_INVALID: [403, 'Refresh the security token and try again.'],
  ORIGIN_FORBIDDEN: [403, 'This request came from an untrusted origin.'],
}

function failAuth(response, error) {
  const [status, message] = authMessages[error.code] ?? [401, 'Sign in to continue.']
  response.status(status).json({
    error: { code: error.code, message },
    requestId: response.locals.requestId,
  })
}

function fail(response, error) {
  if (error instanceof AuthError) return failAuth(response, error)
  if (error instanceof AttemptError || error instanceof CohortError) {
    return response.status(error.status).json({
      error: { code: error.code, message: error.message },
      requestId: response.locals.requestId,
    })
  }
  const safe =
    error instanceof CliError
      ? error
      : new CliError(
          'CLI_UNAVAILABLE',
          'The terminal is temporarily unavailable. Please try again shortly.',
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

export function createCliDefenderRouter({
  service,
  attempts,
  requireSession = [],
  requireMutation = [],
  now = Date.now,
  limit = MAX_REQUESTS_PER_WINDOW,
} = {}) {
  const game = service || createCliDefenderService()
  const allow = createPacer(now, limit)
  const router = Router()
  const base = '/games/cli-cyber-defender/runs'
  const playerOf = (response) => response.locals.authUser.id

  // session and csrf middleware run first; their errors reach the shared error handler below
  function route(method, path, handler) {
    const guards = method === 'get' ? requireSession : [...requireSession, ...requireMutation]
    router[method](
      path,
      (_request, response, next) => {
        response.set('Cache-Control', 'no-store')
        next()
      },
      ...guards,
      async (request, response) => {
        try {
          if (!allow(`${request.ip || 'unknown'}:${playerOf(response)}`)) throw rateLimited()
          response.json(await handler(request, response))
        } catch (error) {
          fail(response, error)
        }
      },
    )
  }

  route('post', base, async (request, response) => {
    const { mode, context } = parseStart(request.body)
    const resolved = await attempts.resolveRunContext(response.locals.authUser, context)
    return game.startRun({ mode, context: resolved }, playerOf(response))
  })
  route('get', `${base}/:runId`, (request, response) =>
    game.getRun(parseRunId(request.params.runId), playerOf(response)),
  )
  route('post', `${base}/:runId/hint`, (request, response) =>
    game.hintRun(parseRunId(request.params.runId), parseHintBody(request.body), playerOf(response)),
  )
  route('post', `${base}/:runId/pause`, (request, response) => {
    parseEmptyBody(request.body)
    return game.pauseRun(parseRunId(request.params.runId), playerOf(response))
  })
  route('post', `${base}/:runId/resume`, (request, response) => {
    parseEmptyBody(request.body)
    return game.resumeRun(parseRunId(request.params.runId), playerOf(response))
  })
  route('post', `${base}/:runId/commands`, (request, response) =>
    game.submitCommand(
      parseRunId(request.params.runId),
      parseCommandBody(request.body),
      playerOf(response),
    ),
  )
  route('post', `${base}/:runId/complete`, (request, response) =>
    game.completeAndRecord(
      parseRunId(request.params.runId),
      parseCompleteBody(request.body),
      playerOf(response),
      attempts,
    ),
  )

  // session and csrf failures arrive here from the guards
  // eslint-disable-next-line no-unused-vars
  router.use((error, _request, response, _next) => fail(response, error))

  return router
}
