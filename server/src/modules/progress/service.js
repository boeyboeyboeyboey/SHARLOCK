import { createAttemptService } from '../attempts/service.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { deriveAchievements } from './achievements.js'
import { POINTS_PER_GAME, summarizeGame, summarizeTopics } from './points.js'

export const PAGE_SIZE = 10
// progress is derived from at most this many of the newest completed attempts
export const MAX_PROGRESS_ATTEMPTS = 1000

function publicTime(value) {
  return value ? new Date(value).toISOString() : null
}

export function createProgressService(database, { registry = createAttemptRegistry(), now } = {}) {
  const attemptService = createAttemptService(database, { registry, now })
  const isCompetitive = (gameId, rulesetVersion) =>
    registry.get(gameId, rulesetVersion)?.competitive === true
  const savingGameIds = [...new Set(registry.entries.map((entry) => entry.id))].sort()

  async function getProgress(playerId) {
    const { attempts: newestFirst } = await attemptService.listCompletedAttempts(playerId, {
      limit: MAX_PROGRESS_ATTEMPTS,
    })
    const attempts = newestFirst.reverse().map((attempt) => ({
      id: attempt._id.toString(),
      gameId: attempt.gameId,
      rulesetVersion: attempt.rulesetVersion,
      score: attempt.score,
      maxScore: attempt.maxScore,
      mode: attempt.mode,
      completedAt: attempt.completedAt,
      topicOutcomes: attempt.topicOutcomes ?? [],
    }))
    const games = savingGameIds.map((gameId) => summarizeGame(gameId, attempts))
    return {
      games: games.map((game) => ({ ...game, lastCompletedAt: publicTime(game.lastCompletedAt) })),
      savingGameIds,
      totalPoints: games.reduce((sum, game) => sum + game.points, 0),
      maxPoints: POINTS_PER_GAME * savingGameIds.length,
      topicOutcomes: summarizeTopics(attempts),
      achievements: deriveAchievements(attempts, { isCompetitive }).map((item) => ({
        ...item,
        earnedAt: publicTime(item.earnedAt),
      })),
    }
  }

  async function listHistory(playerId, { gameId, page }) {
    const { attempts, total } = await attemptService.listCompletedAttempts(playerId, {
      gameId,
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
    return {
      attempts: attempts.map((attempt) => ({
        attemptId: attempt._id.toString(),
        gameId: attempt.gameId,
        rulesetVersion: attempt.rulesetVersion,
        contextKind: attempt.context.kind,
        score: attempt.score,
        maxScore: attempt.maxScore,
        completedAt: publicTime(attempt.completedAt),
      })),
      page,
      total,
    }
  }

  async function listAchievements(playerId) {
    const { achievements } = await getProgress(playerId)
    return achievements
  }

  return Object.freeze({ getProgress, listHistory, listAchievements, savingGameIds })
}
