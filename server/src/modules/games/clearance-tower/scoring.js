import { HINT_COST } from './hints.js'
import { checkStep, findDutyConflicts } from './models.js'

export const MAX_SCORE = 100
export const PRIVILEGE_PENALTY = 5

// clear-4: any leak empties the row, and a policy that stops most of the work cannot bank
// security points for it; below the threshold both security rows shrink with the work share
export const SCORING_RULES = Object.freeze({
  leakPenalty: 40,
  fullSecurityAtWorkShare: 0.75,
  countsUnavoidableWorkLoss: true,
  leakBlocksTopic: true,
})

// clear-2 and clear-3 keep the rules they were saved under
export const LEGACY_SCORING_RULES = Object.freeze({
  leakPenalty: 20,
  fullSecurityAtWorkShare: 0,
  countsUnavoidableWorkLoss: false,
  leakBlocksTopic: false,
})

// mandatory labels decide every flow, so those levels move the privilege points to predictions
export const WEIGHTS = {
  dac: { leaks: 40, work: 30, privilege: 15, predictions: 15 },
  blp: { leaks: 40, work: 30, privilege: 0, predictions: 30 },
  rbac: { leaks: 40, work: 30, privilege: 15, predictions: 15 },
}

export const STAR_THRESHOLDS = [
  { stars: 3, minimum: 95 },
  { stars: 2, minimum: 75 },
  { stars: 1, minimum: 50 },
]

const ACTIONS = ['read', 'write']

function rightKey(agent, action, file) {
  return `${agent}:${action}:${file}`
}

function neededRights(level) {
  const needed = new Set()
  for (const event of level.day) {
    if (event.kind !== 'work') continue
    for (const step of event.steps) needed.add(rightKey(step.agent, step.action, step.file))
  }
  return needed
}

// every right the policy allows, written as "agent:action:file"
export function effectiveRights(level, policy) {
  const rights = new Set()
  for (const agent of level.agents) {
    for (const file of level.files) {
      for (const action of ACTIONS) {
        const step = { agent: agent.id, action, file: file.id }
        if (checkStep(level, policy, step).allowed) rights.add(rightKey(agent.id, action, file.id))
      }
    }
  }
  return rights
}

export function countExcessRights(level, policy) {
  const needed = neededRights(level)
  let excess = 0
  for (const right of effectiveRights(level, policy)) if (!needed.has(right)) excess += 1
  return excess
}

function countDifferences(before, after) {
  let changes = 0
  for (const item of before) if (!after.has(item)) changes += 1
  for (const item of after) if (!before.has(item)) changes += 1
  return changes
}

function badgeSet(policy) {
  const pairs = new Set()
  for (const assignment of policy.assignments)
    for (const roleId of assignment.roleIds) pairs.add(`${assignment.agent}:${roleId}`)
  for (const role of policy.roles)
    for (const permission of role.permissions) pairs.add(`${role.id}:${permission}`)
  return pairs
}

// compares the role edits the player made with the matrix cells that changed underneath
export function countEdits(level, policy) {
  return {
    badgeEdits: countDifferences(badgeSet(level.startPolicy), badgeSet(policy)),
    matrixEdits: countDifferences(
      effectiveRights(level, level.startPolicy),
      effectiveRights(level, policy),
    ),
  }
}

export function starsFor(score) {
  return STAR_THRESHOLDS.find((threshold) => score >= threshold.minimum)?.stars ?? 0
}

export function reviewPredictions(level, predictions) {
  return level.predictions.map((prompt) => ({
    id: prompt.id,
    context: prompt.context,
    request: prompt.request,
    verdict: predictions[prompt.id],
    answer: prompt.answer,
    correct: predictions[prompt.id] === prompt.answer,
    explanation: prompt.explanation,
  }))
}

// each hint takes points off the level, never below zero
export function hintPenaltyFor(rawScore, hintsUsed) {
  return Math.min(rawScore, hintsUsed * HINT_COST)
}

function securityShareFor(workShare, rules) {
  if (!rules.fullSecurityAtWorkShare) return 1
  return Math.min(1, workShare / rules.fullSecurityAtWorkShare)
}

export function scoreLevel(
  level,
  policy,
  predictions,
  events,
  hintsUsed = 0,
  rules = SCORING_RULES,
) {
  const weights = WEIGHTS[level.model]
  const workEvents = events.filter((event) => event.kind === 'work')
  const workDone = workEvents.filter((event) => event.outcome === 'done').length
  const workAllowance = rules.countsUnavoidableWorkLoss ? (level.unavoidableWorkLoss ?? 0) : 0
  const workShare = Math.min(1, workDone / (workEvents.length - workAllowance))
  const securityShare = securityShareFor(workShare, rules)
  const leaks = events.filter((event) => event.outcome === 'leaked').length
  const tampering = events.filter((event) => event.outcome === 'tampered').length
  const excessRights = weights.privilege > 0 ? countExcessRights(level, policy) : 0
  const dutyConflicts = findDutyConflicts(level, policy)
  const review = reviewPredictions(level, predictions)
  const correctPredictions = review.filter((item) => item.correct).length

  const privilegeMisses = excessRights + dutyConflicts.length
  const breakdown = [
    {
      key: 'leaks',
      label: 'No leaks',
      max: weights.leaks,
      points: Math.round(Math.max(0, weights.leaks - rules.leakPenalty * leaks) * securityShare),
    },
    {
      key: 'work',
      label: 'Work completed',
      max: weights.work,
      points: Math.round(weights.work * workShare),
    },
    {
      key: 'privilege',
      label: 'Least privilege',
      max: weights.privilege,
      points: Math.round(
        Math.max(0, weights.privilege - PRIVILEGE_PENALTY * privilegeMisses) * securityShare,
      ),
    },
    {
      key: 'predictions',
      label: 'Predictions',
      max: weights.predictions,
      points: Math.round((weights.predictions * correctPredictions) / review.length),
    },
  ].filter((row) => row.max > 0)

  const rawScore = breakdown.reduce((total, row) => total + row.points, 0)
  const hintPenalty = hintPenaltyFor(rawScore, hintsUsed)
  const score = rawScore - hintPenalty
  return {
    score,
    hintsUsed,
    hintPenalty,
    maxScore: MAX_SCORE,
    stars: starsFor(score),
    breakdown,
    meters: {
      leaks,
      tampering,
      workDone,
      workTotal: workEvents.length,
      excessRights,
      dutyConflicts,
      correctPredictions,
      predictionTotal: review.length,
      ...(rules.leakBlocksTopic && {
        workAllowance,
        securityShare,
        topicBlockedByLeak: leaks > 0,
      }),
    },
    predictionReview: review,
    ...(level.compareEdits && { edits: countEdits(level, policy) }),
  }
}
