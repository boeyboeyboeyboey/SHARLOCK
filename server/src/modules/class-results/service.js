import { Types } from 'mongoose'
import { attemptModel } from '../attempts/model.js'
import { createAttemptRegistry } from '../attempts/registry.js'
import { membershipModel } from '../../models/Membership.js'
import { userModel } from '../../models/User.js'
import { cohortModel } from '../../models/Cohort.js'
import { createPermissionService } from '../../services/permissions.js'
import { summarizeGame, summarizeTopics } from '../progress/points.js'
import { classUnavailable, parseRouteId } from './policy.js'

export const STUDENT_PAGE_SIZE = 50
export const ATTEMPT_PAGE_SIZE = 10
// the summary reads at most this many of the newest counted attempts in a class
export const MAX_SUMMARY_ATTEMPTS = 5000
// roster bound for one class
export const MAX_CLASS_STUDENTS = 2000

function publicTime(value) {
  return value ? new Date(value).toISOString() : null
}

function byUsername(a, b) {
  return (
    a.username.localeCompare(b.username, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
  )
}

// pure aggregation: attempts are newest first, already limited to counted students and this class
export function summarizeClass({ gameIds, students, attemptsNewestFirst }) {
  const perStudent = new Map(students.map((student) => [student.id, []]))
  for (const attempt of attemptsNewestFirst) perStudent.get(attempt.playerId)?.push(attempt)

  const games = gameIds.map((gameId) => {
    const ofGame = attemptsNewestFirst.filter((attempt) => attempt.gameId === gameId)
    if (ofGame.length === 0) {
      return {
        gameId,
        rulesetVersion: null,
        studentsAttempted: 0,
        averageBestPercent: null,
        topics: [],
        bestByStudent: new Map(),
      }
    }
    const rulesetVersion = ofGame[0].rulesetVersion
    const bestByStudent = new Map()
    const topicTotals = new Map()
    for (const [studentId, attempts] of perStudent) {
      const inVersion = attempts
        .filter((attempt) => attempt.gameId === gameId && attempt.rulesetVersion === rulesetVersion)
        .reverse()
      if (inVersion.length === 0) continue
      const summary = summarizeGame(gameId, inVersion)
      bestByStudent.set(studentId, summary.maxScore > 0 ? summary.points : null)
      for (const topic of summarizeTopics(inVersion)) {
        const entry = topicTotals.get(topic.topic) ?? {
          topic: topic.topic,
          studentsAttempted: 0,
          studentsPassed: 0,
        }
        entry.studentsAttempted += 1
        if (topic.passed > 0) entry.studentsPassed += 1
        topicTotals.set(topic.topic, entry)
      }
    }
    const computable = [...bestByStudent.values()].filter((value) => value !== null)
    return {
      gameId,
      rulesetVersion,
      studentsAttempted: bestByStudent.size,
      averageBestPercent:
        computable.length > 0
          ? Math.round(computable.reduce((sum, value) => sum + value, 0) / computable.length)
          : null,
      topics: [...topicTotals.values()].sort((a, b) => a.topic.localeCompare(b.topic, 'en')),
      bestByStudent,
    }
  })

  const rows = students.map((student) => {
    const attempts = perStudent.get(student.id)
    return {
      id: student.id,
      username: student.username,
      avatarId: student.avatarId,
      completedAttempts: attempts.length,
      lastCompletedAt: publicTime(attempts[0]?.completedAt),
      games: games
        .filter((game) => game.bestByStudent.has(student.id))
        .map((game) => ({ gameId: game.gameId, bestPercent: game.bestByStudent.get(student.id) })),
    }
  })
  return {
    games: games.map((game) => ({
      gameId: game.gameId,
      rulesetVersion: game.rulesetVersion,
      studentsAttempted: game.studentsAttempted,
      averageBestPercent: game.averageBestPercent,
      topics: game.topics,
    })),
    students: rows,
  }
}

export function createClassResultsService(database, { registry = createAttemptRegistry() } = {}) {
  const permissions = createPermissionService(database)
  const Attempt = attemptModel(database, registry)
  const Membership = membershipModel(database)
  const User = userModel(database)
  const Cohort = cohortModel(database)
  const gameIds = [...new Set(registry.entries.map((entry) => entry.id))].sort()

  async function authorize(actor, cohortIdInput) {
    const cohortId = parseRouteId(cohortIdInput)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId })
    return cohortId
  }

  // active members whose account is active and whose only role is student
  async function loadStudents(cohortId, onlyId) {
    const filter = { cohortId: new Types.ObjectId(cohortId), status: 'active' }
    if (onlyId) filter.userId = new Types.ObjectId(onlyId)
    const memberships = await Membership.find(filter, { userId: 1 })
      .limit(MAX_CLASS_STUDENTS)
      .lean()
    if (memberships.length === 0) return []
    const users = await User.find(
      {
        _id: { $in: memberships.map((item) => item.userId) },
        accountStatus: 'active',
        $and: [{ globalRoles: 'student' }, { globalRoles: { $nin: ['instructor', 'admin'] } }],
      },
      { username: 1, avatarId: 1 },
    ).lean()
    return users
      .map((user) => ({
        id: user._id.toString(),
        username: user.username,
        avatarId: user.avatarId,
      }))
      .sort(byUsername)
  }

  async function getSummary(actor, cohortIdInput, { page }) {
    const cohortId = await authorize(actor, cohortIdInput)
    const [cohort, students] = await Promise.all([
      Cohort.findById(cohortId, { name: 1, term: 1 }).lean(),
      loadStudents(cohortId),
    ])
    if (!cohort) throw classUnavailable()
    const attempts =
      students.length === 0
        ? []
        : await Attempt.find(
            {
              status: 'completed',
              'context.cohortId': new Types.ObjectId(cohortId),
              playerId: { $in: students.map((student) => new Types.ObjectId(student.id)) },
              gameId: { $in: gameIds },
            },
            {
              playerId: 1,
              gameId: 1,
              rulesetVersion: 1,
              score: 1,
              maxScore: 1,
              completedAt: 1,
              topicOutcomes: 1,
            },
          )
            .sort({ completedAt: -1, _id: -1 })
            .limit(MAX_SUMMARY_ATTEMPTS)
            .lean()
    const summary = summarizeClass({
      gameIds,
      students,
      attemptsNewestFirst: attempts.map((attempt) => ({
        playerId: attempt.playerId.toString(),
        gameId: attempt.gameId,
        rulesetVersion: attempt.rulesetVersion,
        score: attempt.score,
        maxScore: attempt.maxScore,
        completedAt: attempt.completedAt,
        topicOutcomes: attempt.topicOutcomes ?? [],
      })),
    })
    const start = (page - 1) * STUDENT_PAGE_SIZE
    return {
      cohort: { id: cohortId, name: cohort.name, term: cohort.term },
      activeStudents: students.length,
      games: summary.games,
      students: summary.students.slice(start, start + STUDENT_PAGE_SIZE),
      page,
      pageSize: STUDENT_PAGE_SIZE,
      total: students.length,
    }
  }

  async function listStudentAttempts(actor, cohortIdInput, studentIdInput, { gameId, page }) {
    const cohortId = await authorize(actor, cohortIdInput)
    const studentId = parseRouteId(studentIdInput)
    const [student] = await loadStudents(cohortId, studentId)
    if (!student) throw classUnavailable()
    const filter = {
      status: 'completed',
      'context.cohortId': new Types.ObjectId(cohortId),
      playerId: new Types.ObjectId(studentId),
      gameId: gameId ?? { $in: gameIds },
    }
    const [attempts, total] = await Promise.all([
      Attempt.find(filter, {
        gameId: 1,
        rulesetVersion: 1,
        score: 1,
        maxScore: 1,
        completedAt: 1,
        topicOutcomes: 1,
      })
        .sort({ completedAt: -1, _id: -1 })
        .skip((page - 1) * ATTEMPT_PAGE_SIZE)
        .limit(ATTEMPT_PAGE_SIZE)
        .lean(),
      Attempt.countDocuments(filter),
    ])
    return {
      student,
      attempts: attempts.map((attempt) => ({
        id: attempt._id.toString(),
        gameId: attempt.gameId,
        rulesetVersion: attempt.rulesetVersion,
        score: attempt.score,
        maxScore: attempt.maxScore,
        completedAt: publicTime(attempt.completedAt),
        topicOutcomes: (attempt.topicOutcomes ?? []).map((outcome) => ({
          topic: outcome.topic,
          achieved: outcome.achieved,
          feedbackCode: outcome.feedbackCode,
        })),
      })),
      page,
      pageSize: ATTEMPT_PAGE_SIZE,
      total,
    }
  }

  return Object.freeze({ getSummary, listStudentAttempts, gameIds })
}
