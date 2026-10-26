// each criterion receives completed attempts oldest first and returns the attempt that first satisfied it
const achievementDefinitions = Object.freeze([
  {
    key: 'first-clue',
    name: 'First clue',
    description: 'Complete any saved activity.',
    find: (attempts) => attempts[0],
  },
  {
    key: 'perfect-case',
    name: 'Perfect case',
    description: 'Earn the maximum score on a saved activity.',
    find: (attempts) =>
      attempts.find((attempt) => attempt.maxScore > 0 && attempt.score === attempt.maxScore),
  },
  {
    key: 'well-rounded',
    name: 'Well rounded',
    description: 'Complete three different saved activities.',
    find(attempts) {
      const seen = new Set()
      return attempts.find((attempt) => {
        seen.add(attempt.gameId)
        return seen.size === 3
      })
    },
  },
  {
    key: 'persistent-detective',
    name: 'Persistent detective',
    description: 'Complete five saved activity attempts.',
    find: (attempts) => attempts[4],
  },
  {
    key: 'topic-expert',
    name: 'Topic expert',
    description: 'Achieve every topic outcome in a single attempt.',
    find: (attempts) =>
      attempts.find(
        (attempt) =>
          attempt.topicOutcomes.length > 0 &&
          attempt.topicOutcomes.every((outcome) => outcome.achieved === true),
      ),
  },
])

export function deriveAchievements(attemptsOldestFirst) {
  const earned = []
  for (const definition of achievementDefinitions) {
    const source = definition.find(attemptsOldestFirst)
    if (!source) continue
    earned.push({
      key: definition.key,
      name: definition.name,
      description: definition.description,
      earnedAt: source.completedAt,
    })
  }
  return earned
}
