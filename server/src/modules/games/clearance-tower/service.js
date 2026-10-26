import { LEVELS, summarizeLevel } from './levels.js'
import { GAME_ID, RULESET_VERSION } from './policy.js'

// level summaries only; play and scoring go through the shared attempt service and ruleset.js
export function createClearanceService() {
  return {
    listLevels() {
      return {
        gameId: GAME_ID,
        rulesetVersion: RULESET_VERSION,
        levels: LEVELS.map(summarizeLevel),
      }
    },
  }
}
