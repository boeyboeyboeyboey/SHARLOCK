import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAttempt } from '../../features/attempts/useAttempt.js'

const AUTO_FINISH_DELAY_MS = 800
const AUTO_FINISH_RETRY_MS = 2000

export function useSqlInjection() {
  const attempt = useAttempt('sql-injection-arcade')
  const { snapshot, busy, retryable } = attempt
  const state = computed(() => snapshot.value?.publicState ?? null)
  const current = computed(() => state.value?.current ?? null)
  const last = computed(() => state.value?.last ?? null)
  const timed = computed(() => state.value?.mode === 'standard')
  const secondsLeft = ref(null)
  const acknowledged = ref('')

  // a closed case stays on screen until the player moves on; the server has already advanced
  const reviewing = computed(
    () =>
      Boolean(last.value?.closed) &&
      last.value.caseId !== current.value?.caseId &&
      acknowledged.value !== last.value.caseId,
  )
  const runOver = computed(() => snapshot.value?.status === 'active' && current.value === null)

  let lastFinishTry = 0
  function tick() {
    const deadline = snapshot.value?.deadlineAt
    if (!deadline || snapshot.value.status !== 'active') {
      secondsLeft.value = null
      return
    }
    const left = new Date(deadline).getTime() - Date.now()
    secondsLeft.value = Math.max(0, Math.ceil(left / 1000))
    const due = Date.now() - new Date(deadline).getTime() - AUTO_FINISH_DELAY_MS
    if (
      due > 0 &&
      !busy.value &&
      !retryable.value &&
      Date.now() - lastFinishTry > AUTO_FINISH_RETRY_MS
    ) {
      lastFinishTry = Date.now()
      attempt.complete()
    }
  }
  const timer = setInterval(tick, 250)
  watch(snapshot, tick)
  onBeforeUnmount(() => clearInterval(timer))

  function send(type, payload = {}) {
    if (!current.value) return false
    return attempt.mutate(type, { caseId: current.value.caseId, ...payload })
  }
  const submitInputs = (inputs) => send('attempt', { inputs })
  const register = (name) => send('register', { inputs: [name] })
  const changePassword = () => send('change-password')
  const answer = (value) => send('answer', { value })
  const chooseFix = (optionId) => send('choose-fix', { optionId })
  const requestHint = () => send('hint')
  const next = () => {
    if (last.value) acknowledged.value = last.value.caseId
  }

  return {
    ...attempt,
    state,
    current,
    last,
    timed,
    secondsLeft,
    reviewing,
    runOver,
    submitInputs,
    register,
    changePassword,
    answer,
    chooseFix,
    requestHint,
    next,
  }
}
