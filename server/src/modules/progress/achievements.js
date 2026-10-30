// each criterion receives completed attempts oldest first and returns the attempt that first satisfied it
// game ids as registered in the attempts registry
const firstCloseGames = Object.freeze([
  ['sql-injection-arcade', 'Customs cleared', 'SQL Injection Arcade'],
  ['clearance-tower', 'Tower cleared', 'Clearance Tower'],
  ['phishing-post-mortem', 'Post sorted', 'Phishing Post-Mortem'],
  ['cli-cyber-defender', 'Wire held', 'CLI Cyber Defender'],
  ['social-engineering-simulator', 'Talked down', 'Social Engineering Simulator'],
])

// botnet tag rounds: fields come from the server-recorded attempt state, never the browser
const tagRound = (attempt) => (attempt.gameId === 'botnet-tag' ? (attempt.state ?? {}) : null)
const tagAchievements = [
  [
    'tag-untouchable',
    'Untouchable',
    'Stay clean for a whole Botnet Tag round.',
    (state) => state.outcome === 'survived',
  ],
  [
    'tag-last-one-clean',
    'Last One Clean',
    'Be the only clean player left when survivors win.',
    (state) => state.outcome === 'survived' && state.sideWon === true && state.cleanAtEnd === 1,
  ],
  [
    'tag-super-spreader',
    'Super-spreader',
    'Tag three or more players in one round.',
    (state) => state.tags >= 3,
  ],
  [
    'tag-firewall',
    'Firewall',
    'Patch four or more stations in one round.',
    (state) => state.patches >= 4,
  ],
  [
    'tag-patient-zero-wins',
    'Patient Zero Wins',
    'Start infected and see the botnet win.',
    (state) => state.startedInfected === true && state.sideWon === true,
  ],
].map(([key, name, description, test]) => ({
  key,
  name,
  description,
  find: (attempts) =>
    attempts.find((attempt) => {
      const state = tagRound(attempt)
      return state !== null && test(state)
    }),
}))

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
  ...tagAchievements,
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
