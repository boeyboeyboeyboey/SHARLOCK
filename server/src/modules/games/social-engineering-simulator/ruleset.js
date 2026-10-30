import { Schema } from 'mongoose'
import { DECISIONS, GAME_ID, MAX_SCORE, RULESET_VERSION } from './policy.js'
import { SCENARIOS } from './scenarios.js'
import { scoreOutcome } from './service.js'

const SCENARIO_IDS = SCENARIOS.map((scenario) => scenario.id)
const BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]))

// the scoring inputs only; legitimacy and the turn budget come from the scenario so they cannot be forged
const stateSchema = new Schema(
  {
    scenarioId: { type: String, required: true, enum: SCENARIO_IDS },
    decision: { type: String, required: true, enum: DECISIONS },
    leaked: { type: Boolean, required: true },
    turnsUsed: { type: Number, required: true, min: 0, max: 50, validate: Number.isInteger },
    verifierRequired: { type: Boolean, required: true },
    verifierContacted: { type: Boolean, required: true },
  },
  { _id: false, strict: 'throw' },
)

// recomputes from the stored inputs, so a stored total can never be trusted
function scoreState(state) {
  const scenario = BY_ID.get(state.scenarioId)
  return scoreOutcome({
    legitimate: Boolean(scenario.legitimate),
    leaked: state.leaked,
    decision: state.decision,
    turnsUsed: state.turnsUsed,
    turnBudget: scenario.turnBudget,
    verifierRequired: state.verifierRequired,
    verifierContacted: state.verifierContacted,
  })
}

const SUMMARIES = {
  resisted: 'You protected the code and checked the request before deciding.',
  partial: 'You protected the code, but the request was not checked the way it should be.',
  compromised: 'The reset code was exposed before the request was checked.',
}

export const socialEngineeringRuleset = {
  id: GAME_ID,
  rulesetVersion: RULESET_VERSION,
  // earlier single-call ruleset: kept registered so saved results still read
  current: false,
  learningObjective:
    'Recognise pressure tactics, protect a reset code and confirm unexpected requests through a separate channel before helping.',
  topicTags: ['protecting-secrets', 'out-of-band-verification', 'social-engineering'],
  maxScore: MAX_SCORE,
  maxActions: 1,
  competitive: false,
  serverRecorded: true,
  stateSchema,
  serializePublicState(state) {
    const { score, outcome } = scoreState(state)
    return { outcome, score, turnsUsed: state.turnsUsed }
  },
  summarize(state) {
    const { score, outcome, breakdown } = scoreState(state)
    const earned = (key) => breakdown.find((item) => item.key === key)?.points > 0
    return {
      score,
      feedback: { outcome, summary: SUMMARIES[outcome] },
      topicOutcomes: [
        {
          topic: 'protecting-secrets',
          achieved: earned('noLeak'),
          feedbackCode: `SOC_PROTECT_${earned('noLeak') ? 'ACHIEVED' : 'MISSED'}`,
        },
        {
          topic: 'out-of-band-verification',
          achieved: earned('verify'),
          feedbackCode: `SOC_VERIFY_${earned('verify') ? 'ACHIEVED' : 'MISSED'}`,
        },
      ],
    }
  },
}
