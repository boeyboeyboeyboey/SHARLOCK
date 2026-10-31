import { createClearanceRuleset } from './ruleset.js'

// clear-2 (before hints) is kept registered but not current so saved results still read
export const clearanceLegacyRuleset = createClearanceRuleset({
  rulesetVersion: 'clear-2',
  current: false,
  hints: false,
})
