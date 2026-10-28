import { randomInt } from 'node:crypto'
import { Schema } from 'mongoose'
import { AttemptError } from '../../attempts/policy.js'
import { GAME_ID, MAX_SCORE, PhishingError, RULESET_VERSION, parseVerdict } from './policy.js'
import { CASE_IDS, caseDatasetVersion, caseEmailIds, publicCase, scoreVerdict } from './service.js'

const verdictSchema = new Schema(
  {
    selectedEmailId: { type: String, required: true, maxlength: 48 },
    evidenceIds: { type: [{ type: String, maxlength: 48 }], validate: (ids) => ids.length === 2 },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    caseId: { type: String, required: true, enum: CASE_IDS },
    datasetVersion: { type: String, required: true, maxlength: 10 },
    emailOrder: { type: [{ type: String, maxlength: 48 }], default: [] },
    verdict: { type: verdictSchema, default: null },
  },
  { _id: false, strict: 'throw' },
)

// fisher-yates with an injectable integer source so tests can fix the order
function shuffle(items, pick) {
  const ordered = [...items]
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const swap = pick(index + 1)
    ;[ordered[index], ordered[swap]] = [ordered[swap], ordered[index]]
  }
  return ordered
}

function fail(code, message, status = 400) {
  throw new AttemptError(code, message, status)
}

// maps scoring errors onto the attempt error shape
function score(state) {
  try {
    return scoreVerdict(state.caseId, state.verdict)
  } catch (error) {
    if (error instanceof PhishingError) fail(error.code, error.message, error.status)
    throw error
  }
}

export function createPhishingRuleset({ pick = randomInt } = {}) {
  return {
    id: GAME_ID,
    rulesetVersion: RULESET_VERSION,
    learningObjective:
      'Trace a credential theft back to the single phishing email that caused it and justify the verdict with evidence.',
    topicTags: ['phishing-analysis', 'incident-response', 'lookalike-domains'],
    maxScore: MAX_SCORE,
    maxActions: 2,
    current: false,
    competitive: false,
    stateSchema,
    createState() {
      const caseId = CASE_IDS[pick(CASE_IDS.length)]
      return {
        state: {
          caseId,
          datasetVersion: caseDatasetVersion(caseId),
          emailOrder: shuffle(caseEmailIds(caseId), pick),
          verdict: null,
        },
        mode: 'practice',
        deadlineAt: null,
      }
    },
    validateAction(type, payload) {
      if (type !== 'submit-verdict')
        fail('PHISH_INVALID_ACTION', 'Choose a supported investigation action.')
      try {
        return parseVerdict(payload)
      } catch (error) {
        if (error instanceof PhishingError) fail(error.code, error.message, error.status)
        throw error
      }
    },
    applyAction(state, action) {
      if (state.verdict) fail('PHISH_VERDICT_SUBMITTED', 'This case already has a verdict.', 409)
      const verdict = action.payload
      try {
        scoreVerdict(state.caseId, verdict)
      } catch (error) {
        if (error instanceof PhishingError) fail(error.code, error.message, error.status)
        throw error
      }
      return { ...state, verdict }
    },
    canComplete(state) {
      return Boolean(state.verdict)
    },
    serializePublicState(state) {
      const base = { case: publicCase(state.caseId, state.emailOrder), verdict: null }
      if (!state.verdict) return base
      const scored = score(state)
      return {
        ...base,
        verdict: {
          score: scored.score,
          result: scored.result,
          feedback: scored.feedback,
          debrief: scored.debrief,
        },
      }
    },
    summarize(state) {
      if (!state.verdict)
        return { score: 0, feedback: { verdictCode: 'PHISH_NO_VERDICT' }, topicOutcomes: [] }
      const scored = score(state)
      return {
        score: scored.score,
        feedback: scored.feedback,
        topicOutcomes: scored.topicOutcomes,
      }
    },
  }
}

export const phishingRuleset = createPhishingRuleset()
