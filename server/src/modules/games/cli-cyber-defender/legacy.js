import { Schema } from 'mongoose'
import { GAME_ID } from './policy.js'
import { pointsFor } from './schedule.js'

// cli-2 (earlier ruleset) is kept registered but not current so saved results still read
const TOPIC_OF = new Map([
  ['ssh-brute-force', 'firewall-blocking'],
  ['web-scanner', 'firewall-blocking'],
  ['password-spray', 'firewall-blocking'],
  ['sqli-probe', 'firewall-blocking'],
  ['port-scan', 'firewall-blocking'],
  ['smtp-relay-abuse', 'firewall-blocking'],
  ['impossible-travel', 'account-security'],
  ['credential-stuffing-success', 'account-security'],
  ['mail-forwarding-rule', 'account-security'],
  ['dormant-admin', 'account-security'],
  ['password-posted', 'account-security'],
  ['c2-beacon', 'incident-containment'],
  ['ransomware-encryption', 'incident-containment'],
  ['lateral-movement', 'incident-containment'],
  ['cryptominer', 'incident-containment'],
  ['usb-autorun', 'incident-containment'],
])
const LEGACY_COUNT = 8
const LEGACY_MAX_SCORE = 2100

const incidentSchema = new Schema(
  {
    scenarioId: { type: String, required: true, enum: [...TOPIC_OF.keys()] },
    outcome: { type: String, required: true, enum: ['correct', 'wrong', 'missed', 'skipped'] },
    hintUsed: { type: Boolean, required: true },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    mode: { type: String, required: true, enum: ['timed', 'practice'] },
    incidents: {
      type: [incidentSchema],
      validate: (list) =>
        list.length === LEGACY_COUNT &&
        new Set(list.map((item) => item.scenarioId)).size === list.length,
    },
  },
  { _id: false, strict: 'throw' },
)

function scoreLegacy(incidents) {
  let streak = 0
  let score = 0
  for (const { outcome } of incidents) {
    if (outcome === 'correct') {
      streak += 1
      score += pointsFor(streak)
    } else streak = 0
  }
  return score
}

export const cliLegacyRuleset = {
  id: GAME_ID,
  rulesetVersion: 'cli-2',
  learningObjective:
    'Read a security alert, pick the right containment action and apply it to the right target under time pressure.',
  topicTags: ['firewall-blocking', 'account-security', 'incident-containment'],
  maxScore: LEGACY_MAX_SCORE,
  maxActions: 255,
  current: false,
  competitive: true,
  serverRecorded: true,
  stateSchema,
  serializePublicState(state) {
    return {
      mode: state.mode,
      correct: state.incidents.filter((item) => item.outcome === 'correct').length,
      incidentCount: state.incidents.length,
      hintsUsed: state.incidents.filter((item) => item.hintUsed).length,
      score: scoreLegacy(state.incidents),
    }
  },
  summarize(state) {
    const correct = state.incidents.filter((item) => item.outcome === 'correct').length
    const topics = [...new Set(TOPIC_OF.values())].filter((topic) =>
      state.incidents.some((item) => TOPIC_OF.get(item.scenarioId) === topic),
    )
    return {
      score: scoreLegacy(state.incidents),
      feedback: { summary: `You contained ${correct} of ${state.incidents.length} incidents.` },
      topicOutcomes: topics.map((topic) => {
        const achieved = state.incidents
          .filter((item) => TOPIC_OF.get(item.scenarioId) === topic)
          .every((item) => item.outcome === 'correct')
        return {
          topic,
          achieved,
          feedbackCode: `CLI_${topic.toUpperCase().replace(/-/g, '_')}_${achieved ? 'ACHIEVED' : 'MISSED'}`,
        }
      }),
    }
  },
}
