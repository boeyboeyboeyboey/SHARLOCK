import { randomBytes } from 'node:crypto'
import { Schema } from 'mongoose'
import { AttemptError } from '../../../attempts/policy.js'
import { GENERATOR_VERSION } from './generator/index.js'
import {
  GAME_ID,
  MAX_MISTAKES,
  PRACTICE_ROUNDS,
  RULESET_VERSION,
  TIMED_ROUND_CAP,
  TIMED_SECONDS,
  TriageError,
  maxTimedScore,
  parseAction,
} from './policy.js'
import {
  PHISH_TYPE_TOPICS,
  judgeCall,
  mistakeLimitReached,
  roundFor,
  tally,
  typeBreakdown,
} from './scoring.js'

const roundSchema = new Schema(
  {
    roundId: { type: String, required: true, maxlength: 8 },
    tier: { type: Number, required: true, min: 1, max: 3 },
    call: { type: String, required: true, enum: ['report', 'trust'] },
    partId: { type: String, default: null, maxlength: 8 },
    correct: { type: Boolean, required: true },
    tellHit: { type: Boolean, required: true },
    points: { type: Number, required: true, min: 0 },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    seed: { type: String, required: true, match: /^[0-9a-f]{32}$/ },
    generatorVersion: { type: String, required: true, maxlength: 16 },
    rounds: {
      type: [roundSchema],
      default: [],
      validate: (rounds) => rounds.length <= TIMED_ROUND_CAP,
    },
  },
  { _id: false, strict: 'throw' },
)

function fail(code, message, status = 400) {
  throw new AttemptError(code, message, status)
}

function isOver(state, metadata) {
  const { mistakes } = tally(state.rounds)
  if (metadata.mode === 'practice') return state.rounds.length >= PRACTICE_ROUNDS
  const timeUp = metadata.deadlineAt !== null && metadata.now >= metadata.deadlineAt
  return timeUp || mistakes >= MAX_MISTAKES || state.rounds.length >= TIMED_ROUND_CAP
}

function lastOutcome(state) {
  const index = state.rounds.length - 1
  if (index < 0) return null
  const round = state.rounds[index]
  const { answer } = roundFor(state, index)
  return {
    roundId: round.roundId,
    call: round.call,
    partId: round.partId ?? null,
    correct: round.correct,
    tellHit: round.tellHit,
    points: round.points,
    verdict: answer.verdict,
    type: answer.type,
    tellPartIds: [...answer.tellPartIds],
    explanation: answer.explanation,
  }
}

function buildReview(state) {
  return state.rounds.map((round, index) => {
    const { email, answer } = roundFor(state, index)
    return {
      tier: round.tier,
      verdict: answer.verdict,
      type: answer.type,
      senderAddress: email.senderAddress,
      subject: email.subject,
      call: round.call,
      correct: round.correct,
      tellHit: round.tellHit,
      points: round.points,
      explanation: answer.explanation,
    }
  })
}

// randomSeed is a test-only seam, never reachable from a request
export function createTriageRuleset({ randomSeed = () => randomBytes(16).toString('hex') } = {}) {
  return {
    id: GAME_ID,
    rulesetVersion: RULESET_VERSION,
    learningObjective:
      'Triage single emails under time pressure: spot lookalike and spoofed senders, mismatched reply-to and links, payment-change requests, risky attachments and QR codes, and trust genuine email.',
    topicTags: Object.values(PHISH_TYPE_TOPICS),
    maxScore: maxTimedScore(),
    maxActions: TIMED_ROUND_CAP,
    current: true,
    competitive: true,
    serverRecorded: false,
    stateSchema,
    createState({ now, context }) {
      const timed = context.kind === 'cohort'
      return {
        state: { seed: randomSeed(), generatorVersion: GENERATOR_VERSION, rounds: [] },
        mode: timed ? 'standard' : 'practice',
        deadlineAt: timed ? new Date(new Date(now).getTime() + TIMED_SECONDS * 1000) : null,
      }
    },
    validateAction(type, payload) {
      try {
        return parseAction(type, payload)
      } catch (error) {
        if (error instanceof TriageError) fail(error.code, error.message, error.status)
        throw error
      }
    },
    applyAction(state, action, metadata) {
      if (isOver(state, metadata)) fail('PHISH_RUN_OVER', 'This run has already ended.', 409)
      const current = roundFor(state, state.rounds.length)
      const { roundId, call, partId } = action.payload
      if (roundId !== current.email.roundId)
        fail('PHISH_STALE_ROUND', 'That email is no longer the current one.', 409)
      if (call === 'report' && !current.email.parts.some((part) => part.id === partId))
        fail('PHISH_UNKNOWN_SELECTION', 'That part does not belong to this email.')
      const outcome = judgeCall(current, call, partId ?? null, tally(state.rounds).streak)
      const round = {
        roundId,
        tier: current.email.tier,
        call,
        partId: partId ?? null,
        ...outcome,
      }
      return { ...state, rounds: [...state.rounds, round] }
    },
    canComplete(state, metadata) {
      return isOver(state, metadata)
    },
    serializePublicState(state, metadata) {
      const timed = metadata.mode === 'standard'
      const totals = tally(state.rounds)
      const completed = metadata.status === 'completed'
      const playable = metadata.status === 'active' && !isOver(state, metadata)
      const view = {
        mode: metadata.mode,
        totalRounds: timed ? null : PRACTICE_ROUNDS,
        maxMistakes: timed ? MAX_MISTAKES : null,
        roundsPlayed: state.rounds.length,
        score: totals.score,
        streak: totals.streak,
        mistakes: totals.mistakes,
        current: playable ? roundFor(state, state.rounds.length).email : null,
        last: lastOutcome(state),
      }
      if (completed) view.review = buildReview(state)
      return view
    },
    summarize(state) {
      const totals = tally(state.rounds)
      const breakdown = typeBreakdown(state)
      return {
        score: Math.min(totals.score, maxTimedScore()),
        feedback: {
          verdictCode: mistakeLimitReached(state.rounds)
            ? 'PHISH_TRIAGE_MISTAKE_LIMIT'
            : 'PHISH_TRIAGE_FINISHED',
          roundsPlayed: state.rounds.length,
          correctCalls: state.rounds.filter((round) => round.correct).length,
          mistakes: totals.mistakes,
        },
        topicOutcomes: [...breakdown].map(([type, { correct, total }]) => ({
          topic: PHISH_TYPE_TOPICS[type],
          achieved: correct === total,
          feedbackCode: correct === total ? 'PHISH_TRIAGE_TOPIC_MET' : 'PHISH_TRIAGE_TOPIC_MISSED',
        })),
      }
    },
  }
}

export const triageRuleset = createTriageRuleset()
