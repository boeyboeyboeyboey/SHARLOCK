import { Schema } from 'mongoose'
import { GAME_ID } from './policy.js'
import { CALLS_PER_SHIFT } from './callGenerator.js'
import { SHIFT_DECISIONS, SHIFT_RULESET_VERSION } from './shiftPolicy.js'
import { SHIFT_MAX_SCORE, scoreShift } from './shiftScoring.js'

// the scoring inputs per played call; everything else is recomputed, so a stored total is never trusted
const callSchema = new Schema(
  {
    genuine: { type: Boolean, required: true },
    callbackViable: { type: Boolean, required: true },
    decision: { type: String, required: true, enum: [...SHIFT_DECISIONS, 'none'] },
    leaked: { type: Boolean, required: true },
    verified: { type: Boolean, required: true },
    messagesUsed: { type: Number, required: true, min: 0, max: 60, validate: Number.isInteger },
    hints: { type: Number, required: true, min: 0, max: 3, validate: Number.isInteger },
  },
  { _id: false, strict: 'throw' },
)

const stateSchema = new Schema(
  {
    calls: {
      type: [callSchema],
      validate: (calls) => calls.length >= 1 && calls.length <= CALLS_PER_SHIFT,
    },
  },
  { _id: false, strict: 'throw' },
)

const SUMMARIES = {
  resisted: 'You protected every secret and checked callers before deciding.',
  partial:
    'You finished the shift, but at least one secret was given up or handled without checks.',
  compromised: 'Three secrets were exposed and the shift ended early.',
}

function plain(state) {
  return scoreShift(state.calls.map((call) => ({ ...call })))
}

export const socialEngineeringShiftRuleset = {
  id: GAME_ID,
  rulesetVersion: SHIFT_RULESET_VERSION,
  learningObjective:
    'Tell genuine requests from social-engineering calls by checking the caller through independent records and a call back before handing over a secret.',
  topicTags: ['protecting-secrets', 'out-of-band-verification', 'social-engineering'],
  maxScore: SHIFT_MAX_SCORE,
  maxActions: 1,
  competitive: false,
  serverRecorded: true,
  stateSchema,
  serializePublicState(state) {
    const { score, outcome, strikes } = plain(state)
    return { outcome, score, strikes, callsPlayed: state.calls.length }
  },
  summarize(state) {
    const { score, outcome, strikes, calls } = plain(state)
    const checked = calls.filter((call) => call.breakdown[1].points > 0).length
    const protectedSecrets = strikes === 0
    const verifiedMost = checked * 2 >= calls.length
    return {
      score,
      feedback: { outcome, summary: SUMMARIES[outcome] },
      topicOutcomes: [
        {
          topic: 'protecting-secrets',
          achieved: protectedSecrets,
          feedbackCode: `SOC_PROTECT_${protectedSecrets ? 'ACHIEVED' : 'MISSED'}`,
        },
        {
          topic: 'out-of-band-verification',
          achieved: verifiedMost,
          feedbackCode: `SOC_VERIFY_${verifiedMost ? 'ACHIEVED' : 'MISSED'}`,
        },
      ],
    }
  },
}
