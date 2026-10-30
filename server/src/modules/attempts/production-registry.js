import { createAttemptRegistry } from './registry.js'
import { cliLegacyRuleset } from '../games/cli-cyber-defender/legacy.js'
import { cliRuleset } from '../games/cli-cyber-defender/ruleset.js'
import { botnetTagRuleset } from '../games/botnet-tag/ruleset.js'
import { clearanceRuleset } from '../games/clearance-tower/ruleset.js'
import { phishingRuleset } from '../games/phishing-post-mortem/ruleset.js'
import { triageRuleset } from '../games/phishing-post-mortem/triage/ruleset.js'
import { socialEngineeringRuleset } from '../games/social-engineering-simulator/ruleset.js'
import { socialEngineeringShiftRuleset } from '../games/social-engineering-simulator/shiftRuleset.js'
import { sqlLegacyRuleset } from '../games/sql-injection-arcade/legacy.js'
import { sqlRuleset } from '../games/sql-injection-arcade/ruleset.js'

export function createProductionAttemptRegistry() {
  return createAttemptRegistry([
    sqlLegacyRuleset,
    sqlRuleset,
    clearanceRuleset,
    phishingRuleset,
    triageRuleset,
    cliLegacyRuleset,
    cliRuleset,
    socialEngineeringRuleset,
    botnetTagRuleset,
    socialEngineeringShiftRuleset,
  ])
}
