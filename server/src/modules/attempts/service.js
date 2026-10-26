import { Types } from 'mongoose'
import { createContextService } from '../../services/context.js'
import { createPermissionService } from '../../services/permissions.js'
import { attemptModel } from './model.js'
import { createAttemptRegistry } from './registry.js'
import {
  AttemptError,
  MAX_DOCUMENT_BYTES,
  MAX_PUBLIC_JSON_BYTES,
  MAX_STATE_BYTES,
  assertEmptyQuery,
  encodePublicJson,
  parseActionInput,
  parseAttemptId,
  parseCompleteInput,
  parseCreateInput,
  parseGameId,
  stableRequestHash,
} from './policy.js'

function failure(code, message, status = 409) {
  return new AttemptError(code, message, status)
}

function unavailable() {
  return failure('ATTEMPT_UNAVAILABLE', 'Saved play is unavailable. Please try again later.', 503)
}

function notFound() {
  return failure('ATTEMPT_NOT_FOUND', 'This saved activity is unavailable.', 404)
}

function synchronous(callback, ...args) {
  const value = callback(...args)
  if (value && typeof value.then === 'function') {
    // adapters must not start external work inside an action that may lose its revision race
    Promise.resolve(value).catch(() => {})
    throw unavailable()
  }
  return value
}

function cloneJson(value, maxBytes = MAX_STATE_BYTES) {
  return JSON.parse(encodePublicJson(value, maxBytes))
}

function clockDate(now) {
  const result = new Date(now())
  if (!Number.isFinite(result.getTime())) throw unavailable()
  return result
}

function metadata(attempt, now) {
  return {
    now: new Date(now),
    startedAt: new Date(attempt.startedAt),
    deadlineAt: attempt.deadlineAt ? new Date(attempt.deadlineAt) : null,
    mode: attempt.mode,
    status: attempt.status,
    context: {
      kind: attempt.context.kind,
      cohortId: attempt.context.cohortId?.toString() ?? null,
    },
  }
}

function stateObject(attempt) {
  const value = attempt.state?.toObject ? attempt.state.toObject() : attempt.state
  return cloneJson(value)
}

function validateSummary(summary, entry) {
  if (
    !summary ||
    typeof summary !== 'object' ||
    Array.isArray(summary) ||
    Reflect.ownKeys(summary).some((key) => !['score', 'feedback', 'topicOutcomes'].includes(key)) ||
    !Number.isFinite(summary.score) ||
    summary.score < 0 ||
    summary.score > entry.maxScore ||
    !summary.feedback ||
    typeof summary.feedback !== 'object' ||
    Array.isArray(summary.feedback) ||
    !Array.isArray(summary.topicOutcomes) ||
    summary.topicOutcomes.length > 64
  ) {
    throw unavailable()
  }
  const topicOutcomes = summary.topicOutcomes.map((outcome) => {
    if (
      !outcome ||
      typeof outcome !== 'object' ||
      Array.isArray(outcome) ||
      Reflect.ownKeys(outcome).some(
        (key) => !['topic', 'achieved', 'feedbackCode'].includes(key),
      ) ||
      typeof outcome.topic !== 'string' ||
      outcome.topic.length < 1 ||
      outcome.topic.length > 120 ||
      typeof outcome.achieved !== 'boolean' ||
      typeof outcome.feedbackCode !== 'string' ||
      outcome.feedbackCode.length < 1 ||
      outcome.feedbackCode.length > 120
    ) {
      throw unavailable()
    }
    return {
      topic: outcome.topic,
      achieved: outcome.achieved,
      feedbackCode: outcome.feedbackCode,
    }
  })
  return {
    score: summary.score,
    feedback: cloneJson(summary.feedback, 131072),
    topicOutcomes,
  }
}

function publicSnapshot(attempt, entry, now) {
  const publicState = synchronous(
    entry.serializePublicState,
    stateObject(attempt),
    metadata(attempt, now),
  )
  if (!publicState || typeof publicState !== 'object' || Array.isArray(publicState)) {
    throw unavailable()
  }
  const result = {
    attemptId: attempt._id.toString(),
    gameId: attempt.gameId,
    rulesetVersion: attempt.rulesetVersion,
    context: {
      kind: attempt.context.kind,
      cohortId: attempt.context.cohortId?.toString() ?? null,
    },
    mode: attempt.mode,
    status: attempt.status,
    revision: attempt.revision,
    startedAt: new Date(attempt.startedAt).toISOString(),
    deadlineAt: attempt.deadlineAt ? new Date(attempt.deadlineAt).toISOString() : null,
    completedAt: attempt.completedAt ? new Date(attempt.completedAt).toISOString() : null,
    score: attempt.score,
    maxScore: attempt.maxScore,
    persisted: true,
    publicState,
  }
  if (attempt.status === 'completed') {
    result.feedback = JSON.parse(attempt.feedbackJson)
    result.topicOutcomes = attempt.topicOutcomes.map(({ topic, achieved, feedbackCode }) => ({
      topic,
      achieved,
      feedbackCode,
    }))
  }
  return cloneJson(result, 131072)
}

function recordedOutcome(attempt, actionId, requestHash) {
  const receipt = attempt.processedActions.find((action) => action.actionId === actionId)
  if (!receipt) return null
  if (receipt.requestHash !== requestHash) {
    throw failure('ATTEMPT_ACTION_CONFLICT', 'This action ID was already used for another request.')
  }
  return JSON.parse(receipt.outcomeJson)
}

function requireRevision(attempt, expectedRevision) {
  if (attempt.revision !== expectedRevision || attempt.revision >= Number.MAX_SAFE_INTEGER - 1) {
    throw failure('ATTEMPT_STALE_REVISION', 'This activity changed. Refresh it before continuing.')
  }
}

function validateDocumentBudget(candidate) {
  const value = candidate.toObject({ depopulate: true })
  // reserve space for the terminal receipt, frozen result and feedback before accepting more play
  const terminalReserve = candidate.status === 'active' ? MAX_PUBLIC_JSON_BYTES * 8 : 0
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_DOCUMENT_BYTES - terminalReserve) {
    throw failure('ATTEMPT_ACTION_LIMIT', 'This activity has reached its saved-data limit.')
  }
  stateObject(candidate)
}

export function createAttemptService(
  database,
  { registry = createAttemptRegistry(), now = Date.now } = {},
) {
  const Attempt = attemptModel(database, registry)
  const permissions = createPermissionService(database)
  const contexts = createContextService(database)

  function ruleset(attempt) {
    const entry = registry.get(attempt.gameId, attempt.rulesetVersion)
    if (!entry) throw unavailable()
    return entry
  }

  function rulesetModel(entry) {
    const Model = Attempt.discriminators?.[`GameAttempt:${entry.storageKey}`]
    if (!Model) throw unavailable()
    return Model
  }

  async function ownedAttempt(actor, attemptId) {
    const currentActor = await permissions.resolveActor(actor)
    const attempt = await Attempt.findOne({
      _id: parseAttemptId(attemptId),
      playerId: currentActor.id,
    }).lean()
    if (!attempt) throw notFound()
    return { currentActor, attempt }
  }

  async function requireActiveContext(actor, attempt) {
    await contexts.resolveAttemptContext(actor, {
      kind: attempt.context.kind,
      ...(attempt.context.kind === 'cohort' && {
        cohortId: attempt.context.cohortId.toString(),
      }),
    })
  }

  function summarize(attempt, entry, receivedAt) {
    return validateSummary(
      synchronous(entry.summarize, stateObject(attempt), metadata(attempt, receivedAt)),
      entry,
    )
  }

  async function startAttempt(actor, gameId, input, query = {}) {
    const receivedAt = clockDate(now)
    assertEmptyQuery(query)
    const id = parseGameId(gameId)
    const { context: requestedContext } = parseCreateInput(input)
    const currentActor = await permissions.resolveActor(actor)
    const context = await contexts.resolveAttemptContext(currentActor, requestedContext)
    const entry = registry.getCurrent(id)
    if (!entry) throw notFound()
    const created = synchronous(entry.createState, {
      now: new Date(receivedAt),
      context: { ...context },
    })
    if (
      !created ||
      typeof created !== 'object' ||
      Reflect.ownKeys(created).some((key) => !['state', 'mode', 'deadlineAt'].includes(key)) ||
      !['standard', 'practice'].includes(created.mode)
    ) {
      throw unavailable()
    }
    const deadlineAt = created.deadlineAt === null ? null : new Date(created.deadlineAt)
    if (
      deadlineAt &&
      (!Number.isFinite(deadlineAt.getTime()) || deadlineAt.getTime() <= receivedAt.getTime())
    ) {
      throw unavailable()
    }
    if (created.mode === 'practice' && deadlineAt !== null) throw unavailable()
    const roles = currentActor.globalRoles
    const Model = rulesetModel(entry)
    const candidate = new Model({
      playerId: new Types.ObjectId(currentActor.id),
      gameId: entry.id,
      rulesetVersion: entry.rulesetVersion,
      rulesetKey: entry.storageKey,
      context,
      mode: created.mode,
      competitiveEligible:
        entry.competitive &&
        context.kind === 'cohort' &&
        created.mode === 'standard' &&
        roles.includes('student') &&
        !roles.some((role) => ['instructor', 'admin'].includes(role)),
      status: 'active',
      startedAt: receivedAt,
      deadlineAt,
      completedAt: null,
      revision: 0,
      score: 0,
      maxScore: entry.maxScore,
      state: cloneJson(created.state),
      processedActions: [],
      topicOutcomes: [],
      feedbackJson: null,
      finalSnapshotJson: null,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    })
    await candidate.validate()
    candidate.score = summarize(candidate, entry, receivedAt).score
    const snapshot = publicSnapshot(candidate, entry, receivedAt)
    validateDocumentBudget(candidate)
    await candidate.save({ timestamps: false })
    return snapshot
  }

  async function getAttempt(actor, attemptId, query = {}) {
    const receivedAt = clockDate(now)
    assertEmptyQuery(query)
    const { currentActor, attempt } = await ownedAttempt(actor, attemptId)
    if (attempt.status === 'completed') return JSON.parse(attempt.finalSnapshotJson)
    await requireActiveContext(currentActor, attempt)
    return publicSnapshot(attempt, ruleset(attempt), receivedAt)
  }

  async function commit(actor, original, candidate, action, requestHash, operation, receivedAt) {
    const entry = ruleset(original)
    const snapshot = publicSnapshot(candidate, entry, receivedAt)
    candidate.processedActions.push({
      actionId: action.actionId,
      requestHash,
      outcomeJson: encodePublicJson(snapshot, 131072),
    })
    if (candidate.status === 'completed') {
      candidate.finalSnapshotJson = encodePublicJson(snapshot, 131072)
    }
    await candidate.validate()
    validateDocumentBudget(candidate)
    const updated = await rulesetModel(entry).findOneAndUpdate(
      {
        _id: original._id,
        playerId: actor.id,
        status: 'active',
        revision: original.revision,
      },
      {
        $set: {
          state: stateObject(candidate),
          status: candidate.status,
          revision: candidate.revision,
          score: candidate.score,
          completedAt: candidate.completedAt,
          processedActions: candidate.processedActions.map((item) => item.toObject()),
          feedbackJson: candidate.feedbackJson,
          topicOutcomes: candidate.topicOutcomes.map((item) => item.toObject()),
          finalSnapshotJson: candidate.finalSnapshotJson,
          updatedAt: receivedAt,
        },
      },
      { returnDocument: 'after', runValidators: true, timestamps: false },
    )
    if (updated) return snapshot
    const { currentActor, attempt: latest } = await ownedAttempt(actor, original._id.toString())
    if (latest.status !== 'completed') await requireActiveContext(currentActor, latest)
    const replay = recordedOutcome(latest, action.actionId, requestHash)
    if (replay) return replay
    if (operation === 'complete' && latest.status === 'completed') {
      return JSON.parse(latest.finalSnapshotJson)
    }
    throw failure('ATTEMPT_STALE_REVISION', 'This activity changed. Refresh it before continuing.')
  }

  async function applyAction(actor, attemptId, input, query = {}) {
    const receivedAt = clockDate(now)
    assertEmptyQuery(query)
    const action = parseActionInput(input)
    const requestHash = stableRequestHash({
      operation: 'action',
      type: action.type,
      payload: action.payload,
    })
    const { currentActor, attempt } = await ownedAttempt(actor, attemptId)
    if (attempt.status !== 'completed') await requireActiveContext(currentActor, attempt)
    const replay = recordedOutcome(attempt, action.actionId, requestHash)
    if (replay) return replay
    if (attempt.status !== 'active') {
      throw failure('ATTEMPT_CLOSED', 'This activity has already ended.')
    }
    requireRevision(attempt, action.expectedRevision)
    const entry = ruleset(attempt)
    const candidate = new (rulesetModel(entry))(attempt)
    if (action.type === 'abandon') {
      if (Reflect.ownKeys(action.payload).length !== 0) {
        throw failure('ATTEMPT_INVALID_REQUEST', 'Check the request fields and try again.', 400)
      }
      candidate.status = 'abandoned'
    } else {
      if (attempt.processedActions.length >= entry.maxActions) {
        throw failure('ATTEMPT_ACTION_LIMIT', 'This activity has reached its action limit.')
      }
      if (attempt.deadlineAt && receivedAt.getTime() >= new Date(attempt.deadlineAt).getTime()) {
        throw failure(
          'ATTEMPT_DEADLINE_PASSED',
          'The activity deadline has passed. Finish or leave it.',
        )
      }
      const payload = synchronous(entry.validateAction, action.type, cloneJson(action.payload))
      candidate.state = cloneJson(
        synchronous(
          entry.applyAction,
          stateObject(attempt),
          { type: action.type, payload: cloneJson(payload) },
          metadata(attempt, receivedAt),
        ),
      )
      await candidate.validate()
      candidate.score = summarize(candidate, entry, receivedAt).score
    }
    candidate.revision = attempt.revision + 1
    return commit(currentActor, attempt, candidate, action, requestHash, 'action', receivedAt)
  }

  async function completeAttempt(actor, attemptId, input, query = {}) {
    const receivedAt = clockDate(now)
    assertEmptyQuery(query)
    const action = parseCompleteInput(input)
    const requestHash = stableRequestHash({ operation: 'complete' })
    const { currentActor, attempt } = await ownedAttempt(actor, attemptId)
    if (attempt.status !== 'completed') await requireActiveContext(currentActor, attempt)
    const replay = recordedOutcome(attempt, action.actionId, requestHash)
    if (replay) return replay
    if (attempt.status === 'completed') return JSON.parse(attempt.finalSnapshotJson)
    if (attempt.status !== 'active') {
      throw failure('ATTEMPT_CLOSED', 'This activity has already ended.')
    }
    requireRevision(attempt, action.expectedRevision)
    const entry = ruleset(attempt)
    if (
      synchronous(entry.canComplete, stateObject(attempt), metadata(attempt, receivedAt)) !== true
    ) {
      throw failure('ATTEMPT_NOT_FINISHED', 'Finish the activity before saving its result.')
    }
    const summary = summarize(attempt, entry, receivedAt)
    const candidate = new (rulesetModel(entry))(attempt)
    candidate.score = summary.score
    candidate.feedbackJson = encodePublicJson(summary.feedback, 131072)
    candidate.topicOutcomes = summary.topicOutcomes
    candidate.status = 'completed'
    candidate.completedAt = receivedAt
    candidate.revision = attempt.revision + 1
    return commit(currentActor, attempt, candidate, action, requestHash, 'complete', receivedAt)
  }

  // read-only history for one player: completed attempts only, no membership check by design
  async function listCompletedAttempts(playerId, { gameId, skip = 0, limit = 10 } = {}) {
    const filter = { playerId: new Types.ObjectId(playerId), status: 'completed' }
    if (gameId !== undefined) filter.gameId = parseGameId(gameId)
    const [attempts, total] = await Promise.all([
      Attempt.find(filter, {
        gameId: 1,
        rulesetVersion: 1,
        'context.kind': 1,
        score: 1,
        maxScore: 1,
        completedAt: 1,
        topicOutcomes: 1,
      })
        .sort({ completedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attempt.countDocuments(filter),
    ])
    return { attempts, total }
  }

  return Object.freeze({
    startAttempt,
    getAttempt,
    applyAction,
    completeAttempt,
    listCompletedAttempts,
  })
}
