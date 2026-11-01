export const POINTS_PER_GAME = 100

function ratio(attempt) {
  return attempt.maxScore > 0 ? attempt.score / attempt.maxScore : 0
}

// the registry's current ruleset once it has an attempt, so one late finish of an old run cannot
// flip the choice back; otherwise the ruleset of the newest attempt. rulesets are never mixed
export function preferredRuleset(attemptsNewestFirst, currentRulesetVersion) {
  if (attemptsNewestFirst.some((attempt) => attempt.rulesetVersion === currentRulesetVersion)) {
    return currentRulesetVersion
  }
  return attemptsNewestFirst[0]?.rulesetVersion ?? null
}

// best attempt is compared only within the preferred ruleset of what the player completed
export function summarizeGame(gameId, attemptsOldestFirst, currentRulesetVersion = null) {
  const attempts = attemptsOldestFirst.filter((attempt) => attempt.gameId === gameId)
  if (attempts.length === 0) {
    return {
      gameId,
      saves: true,
      completedCount: 0,
      bestScore: 0,
      maxScore: 0,
      points: 0,
      lastCompletedAt: null,
    }
  }
  const latest = attempts[attempts.length - 1]
  const rulesetVersion = preferredRuleset(attempts.toReversed(), currentRulesetVersion)
  const inRuleset = attempts.filter((attempt) => attempt.rulesetVersion === rulesetVersion)
  let best = inRuleset[inRuleset.length - 1]
  for (const attempt of inRuleset) {
    if (ratio(attempt) > ratio(best)) best = attempt
  }
  return {
    gameId,
    saves: true,
    completedCount: attempts.length,
    bestScore: best.score,
    maxScore: best.maxScore,
    points: Math.round(POINTS_PER_GAME * ratio(best)),
    lastCompletedAt: latest.completedAt,
  }
}

// shape: [{ topic, attempted, passed }] counted per topic outcome entry, sorted by topic
export function summarizeTopics(attempts) {
  const totals = new Map()
  for (const attempt of attempts) {
    for (const outcome of attempt.topicOutcomes) {
      const entry = totals.get(outcome.topic) ?? { topic: outcome.topic, attempted: 0, passed: 0 }
      entry.attempted += 1
      if (outcome.achieved === true) entry.passed += 1
      totals.set(outcome.topic, entry)
    }
  }
  return [...totals.values()].sort((a, b) => a.topic.localeCompare(b.topic, 'en'))
}
