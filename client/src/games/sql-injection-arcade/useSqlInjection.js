import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAttempt } from '../../features/attempts/useAttempt.js'

const AUTO_FINISH_DELAY_MS = 800
const FINISH_TRIES = 5
const FINISH_RETRY_MS = 1000

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

  // server time minus device time, so a skewed device clock neither misstates the countdown nor
  // ends a run early
  let clockOffset = 0
  // one automatic finish run per snapshot; it retries with backoff, then hands over to the player
  let finishTriedOn = null
  let finishing = false
  let disposed = false
  let waitTimer = null
  const finishStalled = ref(false)
  const wait = (ms) =>
    new Promise((resolve) => {
      waitTimer = setTimeout(resolve, ms)
    })

  // a held save is resent as it was; a fresh finish would be ignored while one is pending
  const finishOnce = () => (retryable.value ? attempt.retry() : attempt.complete())

  async function autoFinish(forSnapshot) {
    finishing = true
    try {
      for (let tries = 0; tries < FINISH_TRIES; tries += 1) {
        const saved = await finishOnce()
        if (saved || disposed || snapshot.value !== forSnapshot) return
        if (tries < FINISH_TRIES - 1) await wait(FINISH_RETRY_MS * 2 ** tries)
        if (disposed) return
      }
      finishStalled.value = true
    } finally {
      finishing = false
    }
  }

  function tick() {
    const deadline = snapshot.value?.deadlineAt
    if (!deadline || snapshot.value.status !== 'active') {
      secondsLeft.value = null
      return
    }
    const left = new Date(deadline).getTime() - (Date.now() + clockOffset)
    secondsLeft.value = Math.max(0, Math.ceil(left / 1000))
    const due = -left - AUTO_FINISH_DELAY_MS
    if (due > 0 && !busy.value && !finishing && finishTriedOn !== snapshot.value) {
      finishTriedOn = snapshot.value
      autoFinish(snapshot.value)
    }
  }
  const timer = setInterval(tick, 250)
  watch(snapshot, (next, previous) => {
    finishStalled.value = false
    const serverNow = next?.publicState?.serverNow
    // a replayed retry carries the time of its first answer, which can only read low, so within one
    // run the highest offset seen is the true one
    const known = next?.attemptId === previous?.attemptId ? clockOffset : -Infinity
    if (Number.isFinite(serverNow)) clockOffset = Math.max(known, serverNow - Date.now())
    tick()
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(timer)
    clearTimeout(waitTimer)
  })

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
    finishStalled,
    finishNow: finishOnce,
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
