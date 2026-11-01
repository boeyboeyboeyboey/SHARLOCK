// per-tab drafts of a case's unsubmitted policy and calls; nothing here is scored or sensitive
const keyFor = (attemptId) => `sharlock.clearance.draft.${attemptId}`

function readAll(attemptId) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(keyFor(attemptId)))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(attemptId, drafts) {
  try {
    if (Object.keys(drafts).length)
      sessionStorage.setItem(keyFor(attemptId), JSON.stringify(drafts))
    else sessionStorage.removeItem(keyFor(attemptId))
  } catch {
    // storage may be full or blocked; the draft is a convenience, so play carries on without it
  }
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function policyFits(level, policy) {
  if (!isRecord(policy)) return false
  if (level.model === 'dac') return Array.isArray(policy.grants)
  if (level.model === 'blp')
    return (
      isRecord(policy.objectLabels) &&
      level.files.every((file) => Array.isArray(policy.objectLabels[file.id]?.categories))
    )
  return (
    Array.isArray(policy.assignments) &&
    Array.isArray(policy.roles) &&
    policy.roles.every((role) => typeof role.name === 'string' && Array.isArray(role.permissions))
  )
}

export function readLevelDraft(attemptId, level) {
  const draft = readAll(attemptId)[level.id]
  if (!isRecord(draft) || !policyFits(level, draft.policy) || !isRecord(draft.predictions))
    return null
  return draft
}

export function forgetLevelDraft(attemptId, levelId) {
  const drafts = readAll(attemptId)
  delete drafts[levelId]
  writeAll(attemptId, drafts)
}

// a case left at its starting policy with no calls has nothing worth restoring
export function saveLevelDraft(attemptId, level, policy, predictions) {
  const untouched =
    JSON.stringify(policy) === JSON.stringify(level.startPolicy) &&
    Object.keys(predictions).length === 0
  if (untouched) {
    forgetLevelDraft(attemptId, level.id)
    return
  }
  writeAll(attemptId, { ...readAll(attemptId), [level.id]: { policy, predictions } })
}

export function clearAttemptDrafts(attemptId) {
  writeAll(attemptId, {})
}
