import { computed, ref, watch } from 'vue'
import { useAttempt } from '../../../features/attempts/useAttempt.js'
import {
  clearAttemptDrafts,
  forgetLevelDraft,
  readLevelDraft,
  saveLevelDraft,
} from './clearanceDraft.js'

// phases inside an active climb: levels → brief → design → predict → day → debrief
export function useClearanceTower() {
  const attempt = useAttempt('clearance-tower')
  const { snapshot, busy, error, retryable } = attempt
  const phase = ref('levels')
  const levelId = ref(null)
  const policy = ref(null)
  const predictions = ref({})
  const draftRestored = ref(false)

  const state = computed(() => snapshot.value?.publicState ?? null)
  const levels = computed(() => state.value?.levels ?? [])
  const level = computed(() => levels.value.find((item) => item.id === levelId.value) ?? null)
  const result = computed(() => level.value?.result ?? null)

  const allPredicted = computed(() =>
    Boolean(level.value?.predictions.every((prompt) => predictions.value[prompt.id])),
  )

  const nextLevelId = computed(() => {
    const index = levels.value.findIndex((item) => item.id === levelId.value)
    return levels.value[index + 1]?.id ?? null
  })

  // a submitted case reopens as its stored day; a new one starts from its starting policy
  function openLevel(id) {
    const item = levels.value.find((entry) => entry.id === id)
    if (!item) return
    levelId.value = id
    predictions.value = {}
    draftRestored.value = false
    if (item.submitted) {
      policy.value = structuredClone(item.result.policy)
      phase.value = 'day'
      return
    }
    const draft = readLevelDraft(snapshot.value.attemptId, item)
    draftRestored.value = Boolean(draft)
    policy.value = draft?.policy ?? structuredClone(item.startPolicy)
    predictions.value = draft?.predictions ?? {}
    phase.value = 'brief'
  }

  // keeps unsubmitted work across a reload; the attempt snapshot stays the source of truth
  watch(
    [policy, predictions],
    () => {
      const item = level.value
      if (!item || item.submitted || !policy.value || snapshot.value?.status !== 'active') return
      saveLevelDraft(snapshot.value.attemptId, item, policy.value, predictions.value)
    },
    { deep: true },
  )

  watch(
    () => snapshot.value?.status,
    (status) => {
      if (status === 'completed') clearAttemptDrafts(snapshot.value.attemptId)
    },
  )

  // what a retry would resend: only a submit moves on to the day, and only for its own case
  let heldSubmitLevelId = null

  async function runDay() {
    heldSubmitLevelId = levelId.value
    const ok = await attempt.mutate('submit-level', {
      levelId: levelId.value,
      policy: policy.value,
      predictions: level.value.predictions.map((prompt) => ({
        id: prompt.id,
        verdict: predictions.value[prompt.id],
      })),
    })
    if (ok) {
      heldSubmitLevelId = null
      enterDay()
    }
    return ok
  }

  function enterDay() {
    forgetLevelDraft(snapshot.value.attemptId, levelId.value)
    phase.value = 'day'
  }

  async function takeHint() {
    heldSubmitLevelId = null
    return attempt.mutate('request-hint', { levelId: levelId.value })
  }

  async function retry() {
    const ok = await attempt.retry()
    if (!ok) return ok
    const submittedLevelId = heldSubmitLevelId
    heldSubmitLevelId = null
    if (submittedLevelId && submittedLevelId === levelId.value) enterDay()
    return ok
  }

  // after a stale tab or an expired session: a case that ran elsewhere cannot stay open as a draft
  async function reload() {
    const ok = await attempt.load(snapshot.value.attemptId)
    if (ok && level.value?.submitted && phase.value !== 'levels') phase.value = 'levels'
    return ok
  }

  function showPhase(nextPhase) {
    if (!retryable.value) error.value = ''
    phase.value = nextPhase
  }

  function reset() {
    snapshot.value = null
    levelId.value = null
    policy.value = null
    predictions.value = {}
    draftRestored.value = false
    phase.value = 'levels'
  }

  return {
    snapshot,
    busy,
    error,
    retryable,
    phase,
    levels,
    level,
    policy,
    predictions,
    result,
    allPredicted,
    nextLevelId,
    state,
    start: attempt.start,
    load: attempt.load,
    complete: attempt.complete,
    retry,
    reload,
    draftRestored,
    openLevel,
    runDay,
    takeHint,
    showPhase,
    reset,
  }
}
