import { Router } from 'express'
import { AuthError } from '../../auth/policy.js'
import { CohortError } from '../../cohorts/policy.js'
import { AttemptError } from '../../attempts/policy.js'
import { LlmError } from './llm/llmError.js'
import {
  SocialEngError,
  parseComplete,
  parseMessage,
  parseNudge,
  parseStart,
  rateLimited,
  unavailable,
} from './policy.js'
import { createSocialEngineeringService } from './service.js'
import { createShiftService } from './shiftService.js'
import {
  parseShiftDecision,
  parseShiftId,
  parseShiftMessage,
  parseShiftStart,
  parseShiftTool,
} from './shiftPolicy.js'

const WINDOW_MS = 60000
const MAX_REQUESTS_PER_WINDOW = 30
const MAX_TRACKED_CLIENTS = 500

// courtesy pacing per signed-in player, not a security boundary
function createPacer(now) {
  const seen = new Map()
  return function allow(key) {
    const cutoff = now() - WINDOW_MS
    const recent = (seen.get(key) ?? []).filter((stamp) => stamp > cutoff)
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
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

function fail(response, error) {
  if (error instanceof AuthError) {
    const [status, message] = authMessages[error.code] ?? [401, 'Sign in to continue.']
    return response.status(status).json({
      error: { code: error.code, message },
      requestId: response.locals.requestId,
    })
  }
  if (error instanceof AttemptError || error instanceof CohortError) {
    return response.status(error.status).json({
      error: { code: error.code, message: error.message },
      requestId: response.locals.requestId,
    })
  }
  const safe = error instanceof SocialEngError || error instanceof LlmError ? error : unavailable()
  response.status(safe.status).json({
    error: {
      code: safe.code,
      message: safe.message,
      ...(safe.fieldErrors && { fieldErrors: safe.fieldErrors }),
    },
    requestId: response.locals.requestId,
  })
}

export function createSocialEngineeringRouter({
  service,
  shift,
  attempts,
  requireSession = [],
  requireMutation = [],
  now = Date.now,
} = {}) {
  const game = service || createSocialEngineeringService()
  const shifts = shift || createShiftService()
  const allow = createPacer(now)
  const router = Router()
  const base = '/games/social-engineering-simulator'
  const playerOf = (response) => response.locals.authUser.id

  // session and csrf middleware run first; their errors reach the shared error handler below
  function route(path, action) {
    router.post(
      `${base}/${path}`,
      (_request, response, next) => {
        response.set('Cache-Control', 'no-store')
        next()
      },
      ...requireSession,
      ...requireMutation,
      async (request, response) => {
        try {
          if (!allow(`${request.ip || 'unknown'}:${playerOf(response)}`)) throw rateLimited()
          response.json(await action(request, response))
        } catch (error) {
          fail(response, error)
        }
      },
    )
  }

  route('session', async (request, response) => {
    const { context } = parseStart(request.body)
    const resolved = await attempts.resolveRunContext(response.locals.authUser, context)
    return game.startSession({ playerId: playerOf(response), context: resolved })
  })
  route('message', (request, response) => {
    const { sessionId, content } = parseMessage(request.body)
    return game.sendMessage(sessionId, content, playerOf(response))
  })
  route('verifier-message', (request, response) => {
    const { sessionId, content } = parseMessage(request.body)
    return game.sendVerifierMessage(sessionId, content, playerOf(response))
  })
  route('nudge', (request, response) => {
    const { sessionId } = parseNudge(request.body)
    return game.nudge(sessionId, playerOf(response))
  })
  route('complete', (request, response) => {
    const { sessionId, decision } = parseComplete(request.body)
    return game.completeAndRecord(sessionId, decision, playerOf(response), attempts)
  })

  route('shift/start', async (request, response) => {
    const { context } = parseShiftStart(request.body)
    const resolved = await attempts.resolveRunContext(response.locals.authUser, context)
    return shifts.startShift({ playerId: playerOf(response), context: resolved })
  })
  route('shift/message', (request, response) => {
    const { shiftId, content } = parseShiftMessage(request.body)
    return shifts.sendMessage(shiftId, content, playerOf(response))
  })
  route('shift/colleague', (request, response) => {
    const { shiftId, content } = parseShiftMessage(request.body)
    return shifts.askColleague(shiftId, content, playerOf(response))
  })
  route('shift/tool', (request, response) => {
    const { shiftId, tool } = parseShiftTool(request.body)
    return shifts.useTool(shiftId, tool, playerOf(response))
  })
  route('shift/hint', (request, response) => {
    const { shiftId } = parseShiftId(request.body)
    return shifts.hint(shiftId, playerOf(response))
  })
  route('shift/nudge', (request, response) => {
    const { shiftId } = parseShiftId(request.body)
    return shifts.nudge(shiftId, playerOf(response))
  })
  route('shift/decide', (request, response) => {
    const { shiftId, decision } = parseShiftDecision(request.body)
    return shifts.decide(shiftId, decision, playerOf(response))
  })
  route('shift/next', (request, response) => {
    const { shiftId } = parseShiftId(request.body)
    return shifts.nextCall(shiftId, playerOf(response))
  })
  route('shift/complete', (request, response) => {
    const { shiftId } = parseShiftId(request.body)
    return shifts.completeAndRecord(shiftId, playerOf(response), attempts)
  })

  // session and csrf failures arrive here from the guards
  // eslint-disable-next-line no-unused-vars
  router.use((error, _request, response, _next) => fail(response, error))

  return router
}
