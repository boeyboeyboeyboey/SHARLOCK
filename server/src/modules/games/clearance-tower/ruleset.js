import { Schema } from 'mongoose'
import { AttemptError } from '../../attempts/policy.js'
import { HINT_COST, MAX_HINTS, hintTexts } from './hints.js'
import { LEVELS, findLevel, publicLevel } from './levels.js'
import { ClearanceError, GAME_ID, RULESET_VERSION, parseSubmission } from './policy.js'
import { MAX_SCORE, SCORING_RULES, scoreLevel } from './scoring.js'
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
const hintSchema = new Schema(
  {
    levelId: { type: String, required: true, enum: levelIds },
    count: { type: Number, required: true, min: 1, max: MAX_HINTS },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    levels: { type: [levelSchema], default: [] },
    hints: { type: [hintSchema], default: [], validate: (list) => list.length <= LEVELS.length },
  },
  { _id: false, strict: 'throw' },
)
// clear-2 attempts were saved before hints existed
const legacyStateSchema = new Schema(
  { levels: { type: [levelSchema], default: [] } },
  { _id: false, strict: 'throw' },
)

function invalid(code, message, status = 400) {
  throw new AttemptError(code, message, status)
}

// replays the stored submission; the day script and answers never leave the server before this
function playLevel(entry, hintsUsed, rules) {
  const level = findLevel(entry.levelId)
  const policy = JSON.parse(entry.policyJson)
  const predictions = Object.fromEntries(entry.predictions.map((item) => [item.id, item.verdict]))
  const events = simulateDay(level, policy)
  return {
    level,
    policy,
    events,
    scored: scoreLevel(level, policy, predictions, events, hintsUsed, rules),
  }
}

function submittedFor(state, levelId) {
  return state.levels.find((entry) => entry.levelId === levelId)
}

function hintsUsedFor(state, levelId) {
  return state.hints?.find((entry) => entry.levelId === levelId)?.count ?? 0
}

export function levelMastered(scored, rules) {
  if (!scored || scored.score < MASTERY_SCORE) return false
  return !rules.leakBlocksTopic || scored.meters.leaks === 0
}

// clear-2 has no hints; clear-3 adds them; clear-4 keeps hints and changes the scoring rules
export function createClearanceRuleset({ rulesetVersion, current, hints, rules }) {
  const usedFor = (state, levelId) => (hints ? hintsUsedFor(state, levelId) : 0)

  return {
    id: GAME_ID,
    rulesetVersion,
    current,
    learningObjective:
      'Compare discretionary, mandatory (Bell-LaPadula) and role-based access control by designing policies and predicting their effect.',
    topicTags: Object.values(TOPICS),
    maxScore: MAX_SCORE * LEVELS.length,
    maxActions: hints ? 24 : 8,
    competitive: false,
    stateSchema: hints ? stateSchema : legacyStateSchema,
    createState() {
      return {
        state: hints ? { levels: [], hints: [] } : { levels: [] },
        mode: 'practice',
        deadlineAt: null,
      }
    },
    validateAction(type, payload) {
      const supported = type === 'submit-level' || (hints && type === 'request-hint')
      if (!supported) invalid('CLEAR_INVALID_ACTION', 'Choose a supported tower action.')
      const level = payload && typeof payload === 'object' ? findLevel(payload.levelId) : undefined
      if (!level) invalid('CLEAR_INVALID_ACTION', 'Choose a level from the tower.')
      if (type === 'request-hint') {
        if (Object.keys(payload).length !== 1)
          invalid('CLEAR_INVALID_ACTION', 'That hint request could not be read. Reload the level.')
        return { levelId: level.id }
      }
      try {
        return parseSubmission(level, payload)
      } catch (error) {
        if (error instanceof ClearanceError)
          invalid('CLEAR_INVALID_ACTION', 'That submission could not be read. Reload the level.')
        throw error
      }
    },
    applyAction(state, action) {
      const { levelId } = action.payload
      if (action.type === 'request-hint') {
        if (submittedFor(state, levelId))
          invalid(
            'CLEAR_LEVEL_SUBMITTED',
            'This level already ran its day. Open another level.',
            409,
          )
        const used = hintsUsedFor(state, levelId)
        if (used >= MAX_HINTS)
          invalid('CLEAR_HINTS_EXHAUSTED', 'No more hints are left for this level.', 409)
        return {
          ...state,
          hints: [
            ...state.hints.filter((entry) => entry.levelId !== levelId),
            { levelId, count: used + 1 },
          ],
        }
      }
      const { policy, predictions } = action.payload
      if (submittedFor(state, levelId))
        invalid('CLEAR_LEVEL_SUBMITTED', 'This level already ran its day. Open another level.', 409)
      return {
        ...state,
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
          const used = usedFor(state, level.id)
          const base = {
            ...publicLevel(level),
            submitted: Boolean(entry),
            ...(hints && {
              hints: { used, max: MAX_HINTS, cost: HINT_COST, texts: hintTexts(level.id, used) },
            }),
          }
          if (!entry) return base
          const { policy, events, scored } = playLevel(entry, used, rules)
          return { ...base, result: { ...scored, policy, events, takeaways: level.takeaways } }
        }),
      }
    },
    summarize(state) {
      const results = new Map(
        state.levels.map((entry) => [
          entry.levelId,
          playLevel(entry, usedFor(state, entry.levelId), rules).scored,
        ]),
      )
      const score = [...results.values()].reduce((total, scored) => total + scored.score, 0)
      return {
        score,
        feedback: {
          levels: LEVELS.map((level) => ({
            levelId: level.id,
            submitted: results.has(level.id),
            score: results.get(level.id)?.score ?? 0,
            stars: results.get(level.id)?.stars ?? 0,
            ...(hints && { hintsUsed: results.get(level.id)?.hintsUsed ?? 0 }),
          })),
        },
        topicOutcomes: Object.entries(TOPICS).map(([model, topic]) => {
          const group = LEVELS.filter((level) => level.model === model)
          const achieved = group.every((level) => levelMastered(results.get(level.id), rules))
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
}

export const clearanceRuleset = createClearanceRuleset({
  rulesetVersion: RULESET_VERSION,
  current: true,
  hints: true,
  rules: SCORING_RULES,
})
