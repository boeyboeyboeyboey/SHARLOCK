import { createAttemptRegistry } from './registry.js'
import { cliRuleset } from '../games/cli-cyber-defender/ruleset.js'
import { clearanceRuleset } from '../games/clearance-tower/ruleset.js'
import { phishingRuleset } from '../games/phishing-post-mortem/ruleset.js'
import { sqlRuleset } from '../games/sql-injection-arcade/ruleset.js'

export function createProductionAttemptRegistry() {
  return createAttemptRegistry([sqlRuleset, clearanceRuleset, phishingRuleset, cliRuleset])
}
