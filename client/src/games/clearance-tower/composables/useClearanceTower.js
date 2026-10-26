import { computed, ref } from 'vue'
import { useAttempt } from '../../../features/attempts/useAttempt.js'

// phases inside an active climb: levels → brief → design → predict → day → debrief
export function useClearanceTower() {
  const attempt = useAttempt('clearance-tower')
  const { snapshot, busy, error, retryable } = attempt
  const phase = ref('levels')
  const levelId = ref(null)
  const policy = ref(null)
  const predictions = ref({})

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
    if (item.submitted) {
      policy.value = structuredClone(item.result.policy)
      phase.value = 'day'
    } else {
      policy.value = structuredClone(item.startPolicy)
      phase.value = 'brief'
    }
  }

  async function runDay() {
    const ok = await attempt.mutate('submit-level', {
      levelId: levelId.value,
      policy: policy.value,
      predictions: level.value.predictions.map((prompt) => ({
        id: prompt.id,
        verdict: predictions.value[prompt.id],
      })),
    })
    if (ok) phase.value = 'day'
    return ok
  }

  async function retry() {
    const ok = await attempt.retry()
    if (ok && phase.value === 'predict') phase.value = 'day'
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
    openLevel,
    runDay,
    showPhase,
    reset,
  }
}
