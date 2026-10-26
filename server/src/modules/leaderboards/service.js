import { Types } from 'mongoose'
import { attemptModel } from '../attempts/model.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { membershipModel } from '../../models/Membership.js'
import { userModel } from '../../models/User.js'
import { createPermissionService } from '../../services/permissions.js'
import { invalidRequest, parseRouteId } from './policy.js'
import { BOARD_PAGE_SIZE, buildBoard } from './rank.js'

// roster bound for one class
export const MAX_CLASS_STUDENTS = 2000
// a board reads at most this many completed attempts
export const MAX_BOARD_ATTEMPTS = 20000

export function createLeaderboardService(database, { registry = createAttemptRegistry() } = {}) {
  const permissions = createPermissionService(database)
  const Attempt = attemptModel(database, registry)
  const Membership = membershipModel(database)
  const User = userModel(database)
  const registeredGameIds = new Set(registry.entries.map((entry) => entry.id))
  const isCompetitive = (gameId, rulesetVersion) =>
    registry.get(gameId, rulesetVersion)?.competitive === true

  async function authorize(actor, cohortIdInput) {
    const cohortId = parseRouteId(cohortIdInput)
    await permissions.requireCapability(actor, 'cohort:play', { cohortId })
    return cohortId
  }

  // active members whose account is active and whose only role is student
  async function loadStudents(cohortId) {
    const memberships = await Membership.find(
      { cohortId: new Types.ObjectId(cohortId), status: 'active' },
      { userId: 1 },
    )
      .limit(MAX_CLASS_STUDENTS)
      .lean()
    const students = new Map()
    if (memberships.length === 0) return students
    const users = await User.find(
      {
        _id: { $in: memberships.map((item) => item.userId) },
        accountStatus: 'active',
        $and: [{ globalRoles: 'student' }, { globalRoles: { $nin: ['instructor', 'admin'] } }],
      },
      { username: 1, avatarId: 1 },
    ).lean()
    for (const user of users) {
      students.set(user._id.toString(), { username: user.username, avatarId: user.avatarId })
    }
    return students
  }

  const classFilter = (cohortId, students) => ({
    status: 'completed',
    'context.kind': 'cohort',
    'context.cohortId': new Types.ObjectId(cohortId),
    playerId: { $in: [...students.keys()].map((id) => new Types.ObjectId(id)) },
  })

  async function latestRuleset(cohortId, students, gameId) {
    if (students.size === 0) return null
    const newest = await Attempt.findOne(
      { ...classFilter(cohortId, students), gameId },
      { rulesetVersion: 1 },
    )
      .sort({ completedAt: -1 })
      .lean()
    return newest?.rulesetVersion ?? null
  }

  async function listGames(actor, cohortIdInput) {
    const cohortId = await authorize(actor, cohortIdInput)
    const students = await loadStudents(cohortId)
    if (students.size === 0) return { games: [] }
    const attempts = await Attempt.find(classFilter(cohortId, students), {
      gameId: 1,
      rulesetVersion: 1,
    })
      .sort({ completedAt: -1 })
      .limit(MAX_BOARD_ATTEMPTS)
      .lean()
    const latest = new Map()
    for (const attempt of attempts) {
      if (!latest.has(attempt.gameId)) latest.set(attempt.gameId, attempt.rulesetVersion)
    }
    const games = [...latest]
      .map(([gameId, rulesetVersion]) => ({
        gameId,
        rulesetVersion,
        competitive: isCompetitive(gameId, rulesetVersion),
      }))
      .sort((a, b) => a.gameId.localeCompare(b.gameId))
    return { games }
  }

  async function getBoard(actor, cohortIdInput, options) {
    const cohortId = await authorize(actor, cohortIdInput)
    const { gameId, view, page } = options
    const students = await loadStudents(cohortId)
    const latest = await latestRuleset(cohortId, students, gameId)
    if (!registeredGameIds.has(gameId) && latest === null) throw invalidRequest()
    const rulesetVersion = options.rulesetVersion ?? latest
    const competitive = rulesetVersion === null ? false : isCompetitive(gameId, rulesetVersion)
    const empty = { rows: [], total: 0, me: null }
    let board = empty
    if (rulesetVersion !== null && students.size > 0) {
      const attempts = await Attempt.find(
        { ...classFilter(cohortId, students), gameId, rulesetVersion },
        { playerId: 1, score: 1, maxScore: 1, completedAt: 1, competitiveEligible: 1 },
      )
        .sort({ completedAt: 1 })
        .limit(MAX_BOARD_ATTEMPTS)
        .lean()
      board = buildBoard({
        attempts,
        students,
        view,
        competitiveOnly: view === 'best' && competitive,
        callerId: actor.id,
        page,
      })
    }
    return {
      gameId,
      rulesetVersion,
      competitive,
      view,
      rows: board.rows,
      page,
      pageSize: BOARD_PAGE_SIZE,
      total: board.total,
      me: board.me,
    }
  }

  return { listGames, getBoard }
}
