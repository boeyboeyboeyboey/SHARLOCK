import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  COMMAND_TEMPLATES,
  completeRun,
  createActionId,
  errorCode,
  errorMessage,
  fetchRun,
  pauseRun,
  requestHint,
  resumeRun,
  startRun,
  submitCommand,
} from '../cliDefender.js'

const MAX_LINES = 200
const MAX_HISTORY = 50

// phase: briefing | starting | running | finishing | debrief; a timed run can also be paused
// onEvent receives 'alert', 'ok', 'fail' or 'miss' so the screen can add sound and effects
export function useCliDefender({ now = () => Date.now(), tickMs = 100, onEvent = () => {} } = {}) {
  const phase = ref('briefing')
  const mode = ref('timed')
  const snapshot = ref(null)
  const result = ref(null)
  const lines = ref([])
  const commandHistory = ref([])
  const draft = ref('')
  const pending = ref(false)
  const error = ref('')
  const clockNow = ref(now())
  const paused = ref(false)
  const resuming = ref(false)
  const frozenRemaining = ref(null)
  const lastReview = ref(null)
  const hinting = ref(false)
  const saving = ref(false)
  const runContext = ref({ kind: 'personal' })

  // server time minus local time, so deadlines are compared on the server's clock
  let offset = 0
  let lineId = 0
  let shownIncident = null
  let announced = new Set()
  let controller
  let timer
  let syncing = false
  let disposed = false

  const current = computed(() => snapshot.value?.current ?? null)
  const remainingMs = computed(() => {
    if (paused.value) return frozenRemaining.value
    const closesAt = current.value?.closesAt
    if (closesAt == null) return null
    return Math.max(0, closesAt - (clockNow.value + offset))
  })
  const canSubmit = computed(() => phase.value === 'running' && !pending.value && !paused.value)

  function print(kind, text) {
    lineId += 1
    lines.value = [...lines.value, { id: lineId, kind, text }].slice(-MAX_LINES)
  }

  function printAlert(incident, total) {
    const { alert } = incident
    print(
      'alert',
      `-- Challenge ${incident.index + 1} of ${total} | ${alert.severity.toUpperCase()} | ${alert.source} --`,
    )
    print('alert', alert.title)
    for (const line of alert.lines) print('detail', `  > ${line}`)
    if (incident.windowSeconds) print('info', `Window: ${incident.windowSeconds} seconds.`)
  }

  function apply(next, receivedAt = now()) {
    // a paused snapshot withholds the alert; keep the one already shown so the hidden layout keeps its size
    const previous = snapshot.value?.current
    if (next.current && !next.current.alert && previous?.incidentId === next.current.incidentId)
      next = { ...next, current: { ...next.current, alert: previous.alert } }
    offset = next.serverNow - receivedAt
    clockNow.value = receivedAt
    snapshot.value = next
    paused.value = Boolean(next.paused)
    for (const item of next.history) {
      if (announced.has(item.incidentId)) continue
      announced.add(item.incidentId)
      if (item.outcome === 'missed') {
        print('miss', `[MISS] Challenge ${item.index + 1} window closed. Streak reset.`)
        onEvent('miss')
      }
    }
    if (next.current?.alert && next.current.incidentId !== shownIncident) {
      shownIncident = next.current.incidentId
      printAlert(next.current, next.incidentCount)
      onEvent('alert')
    }
    if (!next.current && phase.value === 'running') finish()
  }

  function stopTimer() {
    clearInterval(timer)
    timer = undefined
  }

  function tick() {
    clockNow.value = now()
    if (phase.value === 'running' && !paused.value && remainingMs.value === 0 && !syncing) sync()
  }

  async function sync() {
    if (!snapshot.value || syncing) return
    syncing = true
    try {
      const data = await fetchRun(snapshot.value.runId, controller?.signal)
      if (!disposed && phase.value === 'running') apply(data)
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      error.value = errorMessage(requestError, 'Lost contact with the terminal. Retrying.')
    } finally {
      syncing = false
    }
  }

  function reset() {
    controller?.abort()
    stopTimer()
    snapshot.value = null
    result.value = null
    lines.value = []
    draft.value = ''
    error.value = ''
    pending.value = false
    paused.value = false
    resuming.value = false
    frozenRemaining.value = null
    lastReview.value = null
    hinting.value = false
    shownIncident = null
    announced = new Set()
  }

  async function start(selectedMode, selectedContext) {
    reset()
    if (selectedContext) runContext.value = selectedContext
    mode.value = selectedMode === 'practice' ? 'practice' : 'timed'
    controller = new AbortController()
    phase.value = 'starting'
    try {
      const data = await startRun(mode.value, runContext.value, controller.signal)
      if (disposed) return
      phase.value = 'running'
      print(
        'system',
        mode.value === 'timed'
          ? 'SHARLOCK SOC TERMINAL | timed game | 8 challenges'
          : 'SHARLOCK SOC TERMINAL | practice | 8 challenges',
      )
      print('system', 'Type "help" for commands. All systems here are fictional.')
      apply(data)
      timer = setInterval(tick, tickMs)
    } catch (requestError) {
      if (disposed || controller.signal.aborted) return
      phase.value = 'briefing'
      error.value = errorMessage(
        requestError,
        'The terminal could not start. Check your connection and try again.',
      )
    }
  }

  function runLocal(command) {
    if (command === 'clear') {
      lines.value = []
      return true
    }
    if (command === 'help') {
      print('info', 'Commands:')
      for (const item of COMMAND_TEMPLATES)
        print('info', `  ${item.template.trim()} <target>  ${item.hint}`)
      print('info', '  help | history | clear  (local, never sent)')
      return true
    }
    if (command === 'history') {
      if (!commandHistory.value.length) print('info', 'No commands yet.')
      commandHistory.value.forEach((entry, index) => print('info', `  ${index + 1}  ${entry}`))
      return true
    }
    return false
  }

  async function submit(raw) {
    const text = (raw ?? draft.value).trim()
    if (!text || pending.value) return
    draft.value = ''
    print('input', `$ ${text}`)
    commandHistory.value = [...commandHistory.value, text].slice(-MAX_HISTORY)
    if (runLocal(text.toLowerCase())) return
    const incident = current.value
    if (paused.value) {
      print('info', 'The game is paused. Resume it first.')
      return
    }
    if (phase.value !== 'running' || !incident) {
      print('info', 'No incident is open right now.')
      return
    }
    pending.value = true
    error.value = ''
    try {
      const data = await submitCommand(
        snapshot.value.runId,
        { actionId: createActionId(), incidentId: incident.incidentId, command: text },
        controller?.signal,
      )
      if (disposed) return
      if (data.outcome === 'correct') {
        announced.add(incident.incidentId)
        print(
          'ok',
          `[ OK ] ${data.command}: ${data.message} +${data.pointsAwarded} (streak ${data.streak})`,
        )
      } else if (data.outcome === 'wrong') {
        announced.add(incident.incidentId)
        print('fail', `[FAIL] ${data.command}: ${data.message} Streak reset.`)
      } else print('error', data.message)
      if (data.review) {
        printReview(data.outcome, data.review)
        lastReview.value = { outcome: data.outcome, command: data.command, ...data.review }
        onEvent(data.outcome === 'correct' ? 'ok' : 'fail')
      }
      apply(data)
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      if (errorCode(requestError) === 'CLI_INCIDENT_CLOSED') {
        print('miss', '[LATE] That incident had already closed.')
        await sync()
      } else if (errorCode(requestError) === 'CLI_RUN_PAUSED') {
        paused.value = true
        print('info', 'The game is paused. Resume it first.')
      } else print('error', errorMessage(requestError, 'The command could not be sent. Try again.'))
    } finally {
      if (!disposed) pending.value = false
    }
  }

  async function finish() {
    if (!snapshot.value || result.value) return
    stopTimer()
    phase.value = 'finishing'
    error.value = ''
    try {
      const data = await completeRun(snapshot.value.runId, createActionId(), controller?.signal)
      if (disposed) return
      result.value = data
      phase.value = 'debrief'
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      error.value = errorMessage(requestError, 'The debrief could not be loaded. Try again.')
    }
  }

  // a failed save keeps the debrief; completing again retries the same attempt
  async function retrySave() {
    if (!snapshot.value || saving.value || result.value?.saved) return
    saving.value = true
    try {
      const data = await completeRun(snapshot.value.runId, createActionId(), controller?.signal)
      if (!disposed) result.value = data
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      result.value = {
        ...result.value,
        saveError: {
          code: errorCode(requestError),
          message: errorMessage(requestError, 'The result could not be saved. Try again.'),
        },
      }
    } finally {
      if (!disposed) saving.value = false
    }
  }

  function printReview(outcome, review) {
    if (outcome !== 'correct') print('why', `  correct: ${review.expectedCommand}`)
    print('why', `  why: ${review.explanation}`)
    const { attack, cia, stage } = review.concepts
    print('tag', `  [${[attack, cia.join(' + '), stage].filter(Boolean).join(' | ')}]`)
  }

  async function hint() {
    const incident = current.value
    if (mode.value !== 'practice' || phase.value !== 'running' || !incident || hinting.value) return
    if (incident.hintLine != null) return
    hinting.value = true
    try {
      const data = await requestHint(snapshot.value.runId, incident.incidentId, controller?.signal)
      if (disposed) return
      apply(data)
      print('info', 'Hint: the highlighted line in the alert holds the key evidence.')
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      print('error', errorMessage(requestError, 'No hint is available right now.'))
    } finally {
      if (!disposed) hinting.value = false
    }
  }

  // switching away freezes the server clock; the player resumes explicitly when back
  async function pause(note = 'Game paused while you were away. The clock is stopped.') {
    if (mode.value !== 'timed' || phase.value !== 'running' || paused.value) return false
    frozenRemaining.value = remainingMs.value
    paused.value = true
    print('info', note)
    try {
      const data = await pauseRun(snapshot.value.runId, controller?.signal)
      if (!disposed && phase.value === 'running') apply(data)
    } catch {
      // the resume request resynchronises with the server either way
    }
    return true
  }

  async function resume() {
    if (!paused.value || resuming.value) return
    resuming.value = true
    error.value = ''
    try {
      const data = await resumeRun(snapshot.value.runId, controller?.signal)
      if (disposed) return
      apply(data)
      if (!paused.value) print('info', 'Game resumed.')
    } catch (requestError) {
      if (disposed || controller?.signal.aborted) return
      error.value = errorMessage(requestError, 'The game could not be resumed. Try again.')
    } finally {
      if (!disposed) resuming.value = false
    }
  }

  function endPractice() {
    if (mode.value === 'practice' && phase.value === 'running' && !pending.value) finish()
  }

  function replay() {
    reset()
    phase.value = 'briefing'
  }

  function onVisibility() {
    if (document.hidden) pause()
    else if (phase.value === 'running' && !paused.value) sync()
  }

  onMounted(() => document.addEventListener('visibilitychange', onVisibility))
  onBeforeUnmount(() => {
    disposed = true
    controller?.abort()
    stopTimer()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return {
    phase,
    mode,
    snapshot,
    result,
    lines,
    commandHistory,
    draft,
    pending,
    error,
    current,
    remainingMs,
    canSubmit,
    paused,
    resuming,
    lastReview,
    hinting,
    saving,
    runContext,
    start,
    hint,
    pause,
    resume,
    submit,
    finish,
    endPractice,
    replay,
    retrySave,
    sync,
  }
}
