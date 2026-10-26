import { Schema } from 'mongoose'
import { AttemptError } from '../../attempts/policy.js'
import { LEVELS, findLevel, publicLevel } from './levels.js'
import { ClearanceError, GAME_ID, RULESET_VERSION, parseSubmission } from './policy.js'
import { MAX_SCORE, scoreLevel } from './scoring.js'
import { simulateDay } from './simulate.js'

const TOPICS = {
  dac: 'discretionary-access-control',
  blp: 'bell-lapadula',
  rbac: 'role-based-access-control',
}
const MASTERY_SCORE = 75
const levelIds = LEVELS.map((level) => level.id)

// the policy is stored as bounded json text because its shape differs by model and state forbids mixed paths
const levelSchema = new Schema(
  {
    levelId: { type: String, required: true, enum: levelIds },
    policyJson: { type: String, required: true, maxlength: 16000 },
    predictions: [
      new Schema(
        {
          id: { type: String, required: true, maxlength: 40 },
          verdict: { type: String, required: true, enum: ['allow', 'deny'] },
        },
        { _id: false, strict: 'throw' },
      ),
    ],
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  { levels: { type: [levelSchema], default: [] } },
  { _id: false, strict: 'throw' },
)

function invalid(code, message, status = 400) {
  throw new AttemptError(code, message, status)
}

// replays the stored submission; the day script and answers never leave the server before this
function playLevel(entry) {
  const level = findLevel(entry.levelId)
  const policy = JSON.parse(entry.policyJson)
  const predictions = Object.fromEntries(entry.predictions.map((item) => [item.id, item.verdict]))
  const events = simulateDay(level, policy)
  return { level, policy, events, scored: scoreLevel(level, policy, predictions, events) }
}

function submittedFor(state, levelId) {
  return state.levels.find((entry) => entry.levelId === levelId)
}

export const clearanceRuleset = {
  id: GAME_ID,
  rulesetVersion: RULESET_VERSION,
  learningObjective:
    'Compare discretionary, mandatory (Bell-LaPadula) and role-based access control by designing policies and predicting their effect.',
  topicTags: Object.values(TOPICS),
  maxScore: MAX_SCORE * LEVELS.length,
  maxActions: 8,
  competitive: false,
  stateSchema,
  createState() {
    return { state: { levels: [] }, mode: 'practice', deadlineAt: null }
  },
  validateAction(type, payload) {
    if (type !== 'submit-level') invalid('CLEAR_INVALID_ACTION', 'Choose a supported tower action.')
    const level = payload && typeof payload === 'object' ? findLevel(payload.levelId) : undefined
    if (!level) invalid('CLEAR_INVALID_ACTION', 'Choose a level from the tower.')
    try {
      return parseSubmission(level, payload)
    } catch (error) {
      if (error instanceof ClearanceError)
        invalid('CLEAR_INVALID_ACTION', 'That submission could not be read. Reload the level.')
      throw error
    }
  },
  applyAction(state, action) {
    const { levelId, policy, predictions } = action.payload
    if (submittedFor(state, levelId))
      invalid('CLEAR_LEVEL_SUBMITTED', 'This level already ran its day. Open another level.', 409)
    return {
      levels: [
        ...state.levels,
        {
          levelId,
          policyJson: JSON.stringify(policy),
          predictions: Object.entries(predictions).map(([id, verdict]) => ({ id, verdict })),
        },
      ],
    }
  },
  canComplete(state) {
    return state.levels.length >= 1
  },
  serializePublicState(state) {
    return {
      totalLevels: LEVELS.length,
      submittedCount: state.levels.length,
      readyToComplete: state.levels.length >= 1,
      levels: LEVELS.map((level) => {
        const entry = submittedFor(state, level.id)
        const base = { ...publicLevel(level), submitted: Boolean(entry) }
        if (!entry) return base
        const { policy, events, scored } = playLevel(entry)
        return { ...base, result: { ...scored, policy, events, takeaways: level.takeaways } }
      }),
    }
  },
  summarize(state) {
    const results = new Map(state.levels.map((entry) => [entry.levelId, playLevel(entry).scored]))
    const score = [...results.values()].reduce((total, scored) => total + scored.score, 0)
    return {
      score,
      feedback: {
        levels: LEVELS.map((level) => ({
          levelId: level.id,
          submitted: results.has(level.id),
          score: results.get(level.id)?.score ?? 0,
          stars: results.get(level.id)?.stars ?? 0,
        })),
      },
      topicOutcomes: Object.entries(TOPICS).map(([model, topic]) => {
        const group = LEVELS.filter((level) => level.model === model)
        const achieved = group.every((level) => results.get(level.id)?.score >= MASTERY_SCORE)
        return {
          topic,
          achieved,
          feedbackCode: achieved
            ? `${model.toUpperCase()}_SECURED`
            : `${model.toUpperCase()}_REVIEW`,
        }
      }),
    }
  },
}
