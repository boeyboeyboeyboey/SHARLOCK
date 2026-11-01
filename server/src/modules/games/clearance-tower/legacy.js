import { createClearanceRuleset } from './ruleset.js'
import { LEGACY_SCORING_RULES } from './scoring.js'

// older rulesets stay registered but not current so saved climbs still score and read
export const clearanceLegacyRuleset = createClearanceRuleset({
  rulesetVersion: 'clear-2',
  current: false,
  hints: false,
  rules: LEGACY_SCORING_RULES,
})

export const clearanceHintsRuleset = createClearanceRuleset({
  rulesetVersion: 'clear-3',
  current: false,
  hints: true,
  rules: LEGACY_SCORING_RULES,
})
