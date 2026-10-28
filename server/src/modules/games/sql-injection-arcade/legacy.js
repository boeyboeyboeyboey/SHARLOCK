import { Schema } from 'mongoose'
import { AttemptError } from '../../attempts/policy.js'
import { evaluateLogin } from './parser.js'

const outcomes = ['BYPASS', 'FALSE_EQUALITY', 'NO_BREAKOUT', 'UNSUPPORTED']
const repairs = [
  { id: 'strip', label: 'Remove spaces from the input' },
  { id: 'bind', label: 'Bind input as parameters in a prepared query' },
  { id: 'hide', label: 'Hide the query from the login screen' },
]
const stateSchema = new Schema(
  {
    scenarioId: { type: String, required: true, enum: ['customs-ledger'] },
    testCount: { type: Number, required: true, min: 0, max: 5 },
    bypassAchieved: { type: Boolean, required: true },
    repairOptionId: {
      type: String,
      required: true,
      enum: ['none', ...repairs.map((item) => item.id)],
    },
    evaluations: [{ type: String, enum: outcomes }],
  },
  { _id: false, strict: 'throw' },
)

function invalid(message, status = 400) {
  throw new AttemptError('SQL_INVALID_ACTION', message, status)
}

// sql-1 (earlier ruleset) is kept registered but not current so saved results still read
export const sqlLegacyRuleset = {
  id: 'sql-injection-arcade',
  rulesetVersion: 'sql-1',
  learningObjective:
    'Explain how quote breakout changes a query and how bound parameters separate code from data.',
  topicTags: ['sql-injection', 'parameterized-queries'],
  maxScore: 100,
  maxActions: 6,
  current: false,
  competitive: false,
  stateSchema,
  createState() {
    return {
      state: {
        scenarioId: 'customs-ledger',
        testCount: 0,
        bypassAchieved: false,
        repairOptionId: 'none',
        evaluations: [],
      },
      mode: 'practice',
      deadlineAt: null,
    }
  },
  validateAction(type, payload) {
    if (type === 'test-payload') {
      if (
        Object.keys(payload).sort().join(',') !== 'password,username' ||
        !['username', 'password'].every(
          (key) => typeof payload[key] === 'string' && payload[key].length <= 120,
        )
      ) {
        invalid('Use only fictional username and password strings, up to 120 characters each.')
      }
      return payload
    }
    if (
      type === 'select-repair' &&
      Object.keys(payload).join(',') === 'optionId' &&
      repairs.some((item) => item.id === payload.optionId)
    )
      return payload
    invalid('Choose a supported puzzle action.')
  },
  applyAction(state, action) {
    if (state.repairOptionId !== 'none')
      invalid('The repair is already recorded. Finish this case.', 409)
    if (action.type === 'test-payload') {
      if (state.bypassAchieved || state.testCount >= 5)
        invalid('The testing phase has ended. Choose a repair.', 409)
      const outcome = evaluateLogin(action.payload.username, action.payload.password)
      return {
        ...state,
        testCount: state.testCount + 1,
        bypassAchieved: outcome === 'BYPASS',
        evaluations: [...state.evaluations, outcome],
      }
    }
    if (!state.bypassAchieved && state.testCount < 5)
      invalid('Finish testing before choosing a repair.', 409)
    return { ...state, repairOptionId: action.payload.optionId }
  },
  canComplete(state) {
    return state.repairOptionId !== 'none'
  },
  serializePublicState(state) {
    return {
      scenarioId: state.scenarioId,
      testCount: state.testCount,
      attemptsRemaining: 5 - state.testCount,
      bypassAchieved: state.bypassAchieved,
      evaluations: [...state.evaluations],
      repairOptions: repairs.map((item) => ({ ...item })),
      repairSelected: state.repairOptionId !== 'none',
      readyToComplete: state.repairOptionId !== 'none',
    }
  },
  summarize(state) {
    const repaired = state.repairOptionId === 'bind'
    return {
      score: (state.bypassAchieved ? 80 : 0) + (repaired ? 20 : 0),
      feedback: {
        bypassAchieved: state.bypassAchieved,
        repaired,
        correctRepairId: state.repairOptionId === 'none' ? null : 'bind',
      },
      topicOutcomes: [
        {
          topic: 'sql-injection',
          achieved: state.bypassAchieved,
          feedbackCode: state.bypassAchieved ? 'BYPASS_FOUND' : 'BYPASS_REVIEW',
        },
        {
          topic: 'parameterized-queries',
          achieved: repaired,
          feedbackCode: repaired ? 'REPAIR_CORRECT' : 'REPAIR_REVIEW',
        },
      ],
    }
  },
}
