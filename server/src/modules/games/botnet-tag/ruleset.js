import { Schema } from 'mongoose'
import { MAX_SCORE, ROUND_MS, scoreFor } from './rules.js'

export const GAME_ID = 'botnet-tag'
export const RULESET_VERSION = '2'
export const LEGACY_RULESET_VERSION = '1'

const OUTCOMES = ['infected', 'survived']
const MAX_PATCHES = 60
const MAX_TAGS = 8
const ROUND_SECONDS = ROUND_MS / 1000
const LEGACY_MAX_SCORE = ROUND_SECONDS + 50 * MAX_PATCHES + 30 * MAX_TAGS + 100

const createStateSchema = () =>
  new Schema(
    {
      outcome: { type: String, required: true, enum: OUTCOMES },
      sideWon: { type: Boolean, required: true },
      survivalSeconds: { type: Number, required: true, min: 0, max: ROUND_SECONDS },
      patches: { type: Number, required: true, min: 0, max: MAX_PATCHES },
      tags: { type: Number, required: true, min: 0, max: MAX_TAGS },
      // optional so attempts saved before these existed still validate
      startedInfected: { type: Boolean },
      cleanAtEnd: { type: Number, min: 0, max: 64 },
    },
    { _id: false, strict: 'throw' },
  )

// the stored total is never trusted: the score is replayed from the stored counters
const scoreState = (state, maxScore) =>
  Math.min(
    maxScore,
    scoreFor(
      { survivalSeconds: state.survivalSeconds, patches: state.patches, tags: state.tags },
      { sideWon: state.sideWon },
    ),
  )

const createTagRuleset = ({ rulesetVersion, maxScore, current }) => ({
  id: GAME_ID,
  rulesetVersion,
  current,
  learningObjective:
    'See how a worm spreads through a botnet and how patching, isolating risky services and segmenting accounts slow it down.',
  topicTags: ['worms-and-botnets', 'patching', 'network-segmentation'],
  maxScore,
  maxActions: 1,
  competitive: false,
  serverRecorded: true,
  stateSchema: createStateSchema(),
  serializePublicState(state) {
    return {
      outcome: state.outcome,
      sideWon: state.sideWon,
      survivalSeconds: state.survivalSeconds,
      patches: state.patches,
      tags: state.tags,
      score: scoreState(state, maxScore),
    }
  },
  summarize(state) {
    return {
      score: scoreState(state, maxScore),
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
})

// @2 adds the grace period, does not save rounds under 20 s or abandoned ones, and has a reachable maximum
export const botnetTagRuleset = createTagRuleset({
  rulesetVersion: RULESET_VERSION,
  maxScore: MAX_SCORE,
  current: true,
})

// @1 stays registered so rounds saved under it keep their maximum of 3520
export const botnetTagLegacyRuleset = createTagRuleset({
  rulesetVersion: LEGACY_RULESET_VERSION,
  maxScore: LEGACY_MAX_SCORE,
  current: false,
})
