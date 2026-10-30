import { Schema } from 'mongoose'
import { ROUND_MS, scoreFor } from './rules.js'

export const GAME_ID = 'botnet-tag'
export const RULESET_VERSION = '1'

const OUTCOMES = ['infected', 'survived']
const MAX_PATCHES = 60
const MAX_TAGS = 8
const ROUND_SECONDS = ROUND_MS / 1000
const MAX_SCORE = ROUND_SECONDS + 50 * MAX_PATCHES + 30 * MAX_TAGS + 100

const stateSchema = new Schema(
  {
    outcome: { type: String, required: true, enum: OUTCOMES },
    sideWon: { type: Boolean, required: true },
    survivalSeconds: { type: Number, required: true, min: 0, max: ROUND_SECONDS },
    patches: { type: Number, required: true, min: 0, max: MAX_PATCHES },
    tags: { type: Number, required: true, min: 0, max: MAX_TAGS },
  },
  { _id: false, strict: 'throw' },
)

// the stored total is never trusted: the score is replayed from the stored counters
const scoreState = (state) =>
  scoreFor(
    { survivalSeconds: state.survivalSeconds, patches: state.patches, tags: state.tags },
    { sideWon: state.sideWon },
  )

export const botnetTagRuleset = {
  id: GAME_ID,
  rulesetVersion: RULESET_VERSION,
  learningObjective:
    'See how a worm spreads through a botnet and how patching, isolating risky services and segmenting accounts slow it down.',
  topicTags: ['worms-and-botnets', 'patching', 'network-segmentation'],
  maxScore: MAX_SCORE,
  maxActions: 1,
  competitive: false,
  serverRecorded: true,
  stateSchema,
  serializePublicState(state) {
    return {
      outcome: state.outcome,
      sideWon: state.sideWon,
      survivalSeconds: state.survivalSeconds,
      patches: state.patches,
      tags: state.tags,
      score: scoreState(state),
    }
  },
  summarize(state) {
    return {
      score: scoreState(state),
      feedback: {
        summary:
          state.outcome === 'survived'
            ? `You stayed clean for the whole round and patched ${state.patches} stations.`
            : `You were infected after ${state.survivalSeconds} seconds and patched ${state.patches} stations.`,
      },
      topicOutcomes: [
        {
          topic: 'patching',
          achieved: state.patches > 0,
          feedbackCode: `TAG_PATCHING_${state.patches > 0 ? 'ACHIEVED' : 'MISSED'}`,
        },
        {
          topic: 'worms-and-botnets',
          achieved: state.outcome === 'survived',
          feedbackCode: `TAG_SPREAD_${state.outcome === 'survived' ? 'CONTAINED' : 'INFECTED'}`,
        },
      ],
    }
  },
}
