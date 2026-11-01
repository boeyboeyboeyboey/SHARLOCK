import { createAttemptRegistry } from './registry.js'
import { cliLegacyRuleset } from '../games/cli-cyber-defender/legacy.js'
import { cliRuleset } from '../games/cli-cyber-defender/ruleset.js'
import { botnetTagLegacyRuleset, botnetTagRuleset } from '../games/botnet-tag/ruleset.js'
import { clearanceHintsRuleset, clearanceLegacyRuleset } from '../games/clearance-tower/legacy.js'
import { clearanceRuleset } from '../games/clearance-tower/ruleset.js'
import { phishingRuleset } from '../games/phishing-post-mortem/ruleset.js'
import { triageLegacyRuleset, triageRuleset } from '../games/phishing-post-mortem/triage/ruleset.js'
import { socialEngineeringRuleset } from '../games/social-engineering-simulator/ruleset.js'
import { socialEngineeringShiftRuleset } from '../games/social-engineering-simulator/shiftRuleset.js'
import { sqlLegacyRuleset } from '../games/sql-injection-arcade/legacy.js'
import { sqlPreviousRuleset, sqlRuleset } from '../games/sql-injection-arcade/ruleset.js'

export function createProductionAttemptRegistry() {
  return createAttemptRegistry([
    sqlLegacyRuleset,
    sqlPreviousRuleset,
    sqlRuleset,
    clearanceLegacyRuleset,
    clearanceHintsRuleset,
    clearanceRuleset,
    phishingRuleset,
    triageLegacyRuleset,
    triageRuleset,
    cliLegacyRuleset,
    cliRuleset,
    socialEngineeringRuleset,
    botnetTagLegacyRuleset,
    botnetTagRuleset,
    socialEngineeringShiftRuleset,
  ])
}
