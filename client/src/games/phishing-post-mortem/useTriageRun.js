import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAttempt } from '../../features/attempts/useAttempt.js'

const TICK_MS = 250
const COMPLETE_RETRY_MS = 1000
const COMPLETE_TRIES = 6

export function useTriageRun({ now = Date.now } = {}) {
  const attempt = useAttempt('phishing-post-mortem')
  const { snapshot, busy, error, retryable } = attempt
  const secondsLeft = ref(null)
  const previousEmail = ref(null)
  const finishing = ref(false)
  let ticker = null
  let waitTimer = null
  let disposed = false

  const publicState = computed(() => snapshot.value?.publicState ?? null)
  const status = computed(() => snapshot.value?.status ?? null)
  const mode = computed(() => publicState.value?.mode ?? snapshot.value?.mode ?? null)
  const timed = computed(() => mode.value === 'standard')
  const current = computed(() => publicState.value?.current ?? null)
  const last = computed(() => publicState.value?.last ?? null)
  const review = computed(() => publicState.value?.review ?? null)
  const score = computed(() => publicState.value?.score ?? snapshot.value?.score ?? 0)
  const streak = computed(() => publicState.value?.streak ?? 0)
  const mistakes = computed(() => publicState.value?.mistakes ?? 0)
  const roundsPlayed = computed(() => publicState.value?.roundsPlayed ?? 0)
  const totalRounds = computed(() => publicState.value?.totalRounds ?? null)
  const maxMistakes = computed(() => publicState.value?.maxMistakes ?? null)
  const completed = computed(() => status.value === 'completed')
  // attempts saved under an earlier ruleset have no triage state and are only summarised
  const legacy = computed(() => {
    const version = snapshot.value?.rulesetVersion
    return Boolean(version) && version !== 'phish-3'
  })
  // the run has ended on the server or on the clock but the result is not saved yet
  const needsCompletion = computed(
    () =>
      status.value === 'active' &&
      !legacy.value &&
      (current.value === null || (timed.value && secondsLeft.value === 0)),
  )
  const canAct = computed(
    () => status.value === 'active' && Boolean(current.value) && !needsCompletion.value,
  )

  function readClock() {
    const deadline = snapshot.value?.deadlineAt
    if (!timed.value || !deadline) {
      secondsLeft.value = null
      return
    }
    const remaining = Math.ceil((new Date(deadline).getTime() - now()) / 1000)
    secondsLeft.value = Math.max(0, remaining)
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  function syncTicker() {
    readClock()
    const running = status.value === 'active' && secondsLeft.value !== null
    if (!running) return stopTicker()
    if (ticker) return
    ticker = setInterval(readClock, TICK_MS)
  }

  // sync flush so a replaced snapshot never skips the round that was on screen
  watch(
    snapshot,
    (next, prev) => {
      const sameAttempt = prev && next && prev.attemptId === next.attemptId
      const before = prev?.publicState?.current
      const after = next?.publicState?.current
      if (!sameAttempt) previousEmail.value = null
      else if (before && (!after || after.roundId !== before.roundId)) previousEmail.value = before
      syncTicker()
    },
    { flush: 'sync' },
  )

  function wait(ms) {
    return new Promise((resolve) => {
      waitTimer = setTimeout(resolve, ms)
    })
  }

  // the browser's clock may run ahead of the server, so a refused save is retried briefly
  async function finish() {
    if (finishing.value || disposed) return false
    finishing.value = true
    try {
      for (let tries = 0; tries < COMPLETE_TRIES; tries += 1) {
        const saved = retryable.value ? await attempt.retry() : await attempt.complete()
        if (saved || disposed || status.value !== 'active') return saved
        await wait(COMPLETE_RETRY_MS)
        if (disposed) return false
      }
      return false
    } finally {
      finishing.value = false
    }
  }

  watch(needsCompletion, (due) => {
    if (due) finish()
  })

  async function start(context) {
    const started = await attempt.start(context)
    if (started && needsCompletion.value) finish()
    return started
  }

  async function resume(attemptId) {
    const loaded = await attempt.load(attemptId)
    if (loaded && needsCompletion.value) finish()
    return loaded
  }

  async function call(payload) {
    const round = current.value
    if (!round || !canAct.value || busy.value || finishing.value) return false
    const sent = await attempt.mutate('triage-call', { roundId: round.roundId, ...payload })
    if (sent) return true
    // a conflict or bad request means the screen is out of date, so read the attempt again
    if (!retryable.value && snapshot.value) {
      const reread = await attempt.load(snapshot.value.attemptId)
      if (reread && needsCompletion.value) finish()
    }
    return false
  }

  const report = (partId) => call({ call: 'report', partId })
  const trust = () => call({ call: 'trust' })

  async function retry() {
    if (needsCompletion.value) return finish()
    return attempt.retry()
  }

  function resetGame() {
    stopTicker()
    snapshot.value = null
    error.value = ''
  }

  onBeforeUnmount(() => {
    disposed = true
    stopTicker()
    if (waitTimer) clearTimeout(waitTimer)
  })

  return {
    snapshot,
    busy,
    error,
    retryable,
    finishing,
    mode,
    timed,
    status,
    completed,
    legacy,
    current,
    last,
    previousEmail,
    review,
    score,
    streak,
    mistakes,
    roundsPlayed,
    totalRounds,
    maxMistakes,
    secondsLeft,
    needsCompletion,
    canAct,
    start,
    resume,
    report,
    trust,
    retry,
    resetGame,
  }
}
