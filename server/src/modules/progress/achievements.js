// each criterion receives completed attempts oldest first and returns the attempt that first satisfied it
// game ids as registered in the attempts registry
const firstCloseGames = Object.freeze([
  ['sql-injection-arcade', 'Customs cleared', 'SQL Injection Arcade'],
  ['clearance-tower', 'Tower cleared', 'Clearance Tower'],
  ['phishing-post-mortem', 'Post sorted', 'Phishing Post-Mortem'],
  ['cli-cyber-defender', 'Wire held', 'CLI Cyber Defender'],
  ['social-engineering-simulator', 'Talked down', 'Social Engineering Simulator'],
])

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
  ...firstCloseGames.map(([gameId, name, title]) => ({
    key: `first-close-${gameId}`,
    name,
    description: `Finish a case in ${title}.`,
    find: (attempts) => attempts.find((attempt) => attempt.gameId === gameId),
  })),
  {
    key: 'timed-run',
    name: 'Against the clock',
    description: 'Finish a timed run in a ranked game.',
    find: (attempts, isCompetitive) =>
      attempts.find(
        (attempt) =>
          attempt.mode === 'standard' && isCompetitive(attempt.gameId, attempt.rulesetVersion),
      ),
  },
])

export const achievementKeys = Object.freeze(achievementDefinitions.map(({ key }) => key))
export const achievementNames = Object.freeze(
  Object.fromEntries(achievementDefinitions.map(({ key, name }) => [key, name])),
)

// player-facing list for locked badges; carries no criteria
export const achievementCatalogue = Object.freeze(
  achievementDefinitions.map(({ key, name, description }) =>
    Object.freeze({ key, name, description }),
  ),
)

// isCompetitive(gameId, rulesetVersion) comes from the server attempts registry, never the client
export function deriveAchievements(attemptsOldestFirst, { isCompetitive = () => false } = {}) {
  const earned = []
  for (const definition of achievementDefinitions) {
    const source = definition.find(attemptsOldestFirst, isCompetitive)
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
