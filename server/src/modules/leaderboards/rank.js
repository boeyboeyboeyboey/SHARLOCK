export const BOARD_PAGE_SIZE = 25

function byUsername(a, b) {
  return a.username.localeCompare(b.username, 'en', { sensitivity: 'base' })
}

// competition ranking: equal values share a rank and the next rank skips (1, 1, 3)
function assignRanks(sorted, valueOf) {
  return sorted.map((row, index) => {
    const tied = index > 0 && valueOf(sorted[index - 1]) === valueOf(row)
    row.rank = tied ? sorted[index - 1].rank : index + 1
    return row
  })
}

function percentOf(attempt) {
  return attempt.maxScore > 0 ? Math.round((100 * attempt.score) / attempt.maxScore) : 0
}

function groupByPlayer(attempts, students) {
  const groups = new Map()
  for (const attempt of attempts) {
    const key = String(attempt.playerId)
    if (!students.has(key)) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(attempt)
  }
  return groups
}

// best attempt: highest score, then the earliest completion
function pickBest(attempts) {
  return attempts.reduce((best, attempt) => {
    if (attempt.score !== best.score) return attempt.score > best.score ? attempt : best
    return new Date(attempt.completedAt) < new Date(best.completedAt) ? attempt : best
  })
}

// attempts are already limited to one class, game and ruleset
export function rankBest({ attempts, students, competitiveOnly }) {
  const counted = competitiveOnly
    ? attempts.filter((attempt) => attempt.competitiveEligible === true)
    : attempts
  const rows = []
  for (const [playerId, own] of groupByPlayer(counted, students)) {
    const best = pickBest(own)
    const student = students.get(playerId)
    rows.push({
      playerId,
      username: student.username,
      avatarId: student.avatarId,
      score: best.score,
      maxScore: best.maxScore,
      completedAt: new Date(best.completedAt).getTime(),
    })
  }
  rows.sort((a, b) => b.score - a.score || a.completedAt - b.completedAt || byUsername(a, b))
  return assignRanks(rows, (row) => row.score)
}

export function rankAllTime({ attempts, students }) {
  const rows = []
  for (const [playerId, own] of groupByPlayer(attempts, students)) {
    const best = pickBest(own)
    const student = students.get(playerId)
    rows.push({
      playerId,
      username: student.username,
      avatarId: student.avatarId,
      points: own.reduce((sum, attempt) => sum + percentOf(attempt), 0),
      plays: own.length,
      bestScore: best.score,
      maxScore: best.maxScore,
    })
  }
  rows.sort((a, b) => b.points - a.points || byUsername(a, b))
  return assignRanks(rows, (row) => row.points)
}

// explicit construction so no internal field can leak
function publicRow(row, view, callerId) {
  const isSelf = row.playerId === callerId
  if (view === 'all-time') {
    return {
      rank: row.rank,
      username: row.username,
      avatarId: row.avatarId,
      points: row.points,
      plays: row.plays,
      bestScore: row.bestScore,
      maxScore: row.maxScore,
      isSelf,
    }
  }
  return {
    rank: row.rank,
    username: row.username,
    avatarId: row.avatarId,
    score: row.score,
    maxScore: row.maxScore,
    isSelf,
  }
}

// paging happens after ranking the whole board; me is the caller's row wherever it falls
export function buildBoard({
  attempts,
  students,
  view,
  competitiveOnly,
  callerId,
  page,
  pageSize = BOARD_PAGE_SIZE,
}) {
  const ranked =
    view === 'all-time'
      ? rankAllTime({ attempts, students })
      : rankBest({ attempts, students, competitiveOnly })
  const start = (page - 1) * pageSize
  const mine = ranked.find((row) => row.playerId === callerId)
  return {
    rows: ranked.slice(start, start + pageSize).map((row) => publicRow(row, view, callerId)),
    total: ranked.length,
    me: mine ? publicRow(mine, view, callerId) : null,
  }
}
