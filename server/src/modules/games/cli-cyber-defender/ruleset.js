import { Schema } from 'mongoose'
import {
  GAME_ID,
  INCIDENT_COUNT,
  MAX_MISTAKES_PER_INCIDENT,
  MAX_SCORE,
  MODES,
  RULESET_VERSION,
} from './policy.js'
import { SCENARIOS, TOPICS } from './scenarios.js'
import { pointsFor } from './schedule.js'

const TRAIL_STEPS = ['ok', 'bad']
const OUTCOMES = ['correct', 'wrong', 'missed', 'skipped']
const SCENARIO_IDS = SCENARIOS.map((scenario) => scenario.id)
const TOPIC_OF = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario.topic]))

const incidentSchema = new Schema(
  {
    scenarioId: { type: String, required: true, enum: SCENARIO_IDS },
    outcome: { type: String, required: true, enum: OUTCOMES },
    hintUsed: { type: Boolean, required: true },
    // ordered containment results for this incident: ok steps score, bad steps reset the streak
    trail: {
      type: [{ type: String, enum: TRAIL_STEPS }],
      validate: (list) => list.length <= 2 + MAX_MISTAKES_PER_INCIDENT,
    },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    mode: { type: String, required: true, enum: MODES },
    incidents: {
      type: [incidentSchema],
      validate: (list) =>
        list.length === INCIDENT_COUNT &&
        new Set(list.map((item) => item.scenarioId)).size === list.length,
    },
  },
  { _id: false, strict: 'throw' },
)

// replays the streak rule over stored outcomes, so a stored total can never be trusted
export function scoreIncidents(incidents) {
  let streak = 0
  let score = 0
  for (const { outcome, trail } of incidents) {
    for (const step of trail) {
      if (step === 'ok') {
        streak += 1
        score += pointsFor(streak)
      } else streak = 0
    }
    if (outcome === 'missed' || outcome === 'skipped') streak = 0
  }
  return score
}

export function topicOutcomesFor(incidents) {
  return Object.keys(TOPICS)
    .filter((topic) => incidents.some((item) => TOPIC_OF.get(item.scenarioId) === topic))
    .map((topic) => {
      const achieved = incidents
        .filter((item) => TOPIC_OF.get(item.scenarioId) === topic)
        .every((item) => item.outcome === 'correct')
      const code = topic.toUpperCase().replace(/-/g, '_')
      return { topic, achieved, feedbackCode: `CLI_${code}_${achieved ? 'ACHIEVED' : 'MISSED'}` }
    })
}

export const cliRuleset = {
  id: GAME_ID,
  rulesetVersion: RULESET_VERSION,
  learningObjective:
    'Read a security alert, pick the right containment action and apply it to the right target under time pressure.',
  topicTags: ['firewall-blocking', 'account-security', 'incident-containment'],
  maxScore: MAX_SCORE,
  maxActions: 255,
  competitive: true,
  serverRecorded: true,
  stateSchema,
  serializePublicState(state) {
    return {
      mode: state.mode,
      correct: state.incidents.filter((item) => item.outcome === 'correct').length,
      incidentCount: state.incidents.length,
      hintsUsed: state.incidents.filter((item) => item.hintUsed).length,
      score: scoreIncidents(state.incidents),
    }
  },
  summarize(state) {
    const correct = state.incidents.filter((item) => item.outcome === 'correct').length
    return {
      score: scoreIncidents(state.incidents),
      feedback: { summary: `You contained ${correct} of ${state.incidents.length} incidents.` },
      topicOutcomes: topicOutcomesFor(state.incidents),
    }
  },
}
