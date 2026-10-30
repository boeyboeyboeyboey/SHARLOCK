import { computed, ref } from 'vue'
import { playSfx } from '../../../composables/playSfx.js'
import { playRing } from '../ring.js'
import {
  askColleague,
  completeShift,
  decide as postDecision,
  isShiftGone,
  nextCall,
  requestHint,
  sendMessage,
  simulatorErrorMessage,
  startShift,
  useDeskTool,
} from '../simulator.js'

// status: choosing | loading | call | debrief | summary | error
export function useHelpDeskShift() {
  const status = ref('choosing')
  const pending = ref(false)
  const error = ref('')
  const shiftId = ref('')
  const mode = ref('scripted')
  const call = ref(null)
  const callIndex = ref(0)
  const callsTotal = ref(4)
  const strikes = ref(0)
  const maxStrikes = ref(3)
  const streak = ref(0)
  const messages = ref([])
  const colleagueMessages = ref([])
  const tools = ref({})
  const hints = ref([])
  const messagesLeft = ref(0)
  const asksLeft = ref(0)
  const debrief = ref(null)
  const result = ref(null)
  const retrying = ref(false)
  const saveRetryError = ref('')
  let runContext = null

  const trust = computed(() =>
    Math.round(((maxStrikes.value - strikes.value) / maxStrikes.value) * 100),
  )
  const canAct = computed(() => status.value === 'call' && !pending.value)
  const hintsLeft = computed(() => (call.value ? call.value.limits.hints - hints.value.length : 0))

  function applyStatus(data) {
    if (typeof data.callIndex === 'number') callIndex.value = data.callIndex
    if (typeof data.callsTotal === 'number') callsTotal.value = data.callsTotal
    if (typeof data.strikes === 'number') strikes.value = data.strikes
    if (typeof data.maxStrikes === 'number') maxStrikes.value = data.maxStrikes
  }

  function loadCall(next) {
    call.value = next
    messages.value = [{ role: 'caller', content: next.openingMessage }]
    colleagueMessages.value = []
    tools.value = {}
    hints.value = []
    messagesLeft.value = next.limits.messages
    asksLeft.value = next.limits.colleagueAsks
    debrief.value = null
    status.value = 'call'
    playRing()
  }

  function fail(caught, fallback) {
    error.value = simulatorErrorMessage(caught, fallback)
    if (isShiftGone(caught)) status.value = 'error'
  }

  // run an action with the pending flag and one shared error path
  async function guarded(action, fallback) {
    if (pending.value) return
    pending.value = true
    error.value = ''
    try {
      await action()
    } catch (caught) {
      fail(caught, fallback)
    } finally {
      pending.value = false
    }
  }

  function showDebrief(data) {
    debrief.value = data
    streak.value = data.streak ?? 0
    applyStatus(data)
    status.value = 'debrief'
    playSfx(data.correct ? 'correct' : 'wrong')
  }

  async function start(context) {
    runContext = context ?? runContext
    status.value = 'loading'
    pending.value = true
    error.value = ''
    try {
      const data = await startShift(runContext)
      shiftId.value = data.shiftId
      mode.value = data.mode
      streak.value = 0
      result.value = null
      applyStatus(data)
      loadCall(data.call)
    } catch (caught) {
      status.value = 'error'
      error.value = simulatorErrorMessage(caught, 'Could not start.')
    } finally {
      pending.value = false
    }
  }

  const send = (text) =>
    guarded(async () => {
      messages.value.push({ role: 'you', content: text })
      const data = await sendMessage(shiftId.value, text)
      if (data.resolved) return showDebrief(data)
      messages.value.push({
        role: 'caller',
        content: data.reply,
        scripted: data.replyMode === 'scripted',
      })
      messagesLeft.value = data.messagesLeft
    }, 'Message failed.')

  const ask = (text) =>
    guarded(async () => {
      colleagueMessages.value.push({ role: 'you', content: text })
      const data = await askColleague(shiftId.value, text)
      if (data.resolved) return showDebrief(data)
      colleagueMessages.value.push({
        role: 'caller',
        content: data.reply,
        scripted: data.replyMode === 'scripted',
      })
      asksLeft.value = data.asksLeft
    }, 'Colleague unavailable.')

  const useTool = (tool) =>
    guarded(async () => {
      const data = await useDeskTool(shiftId.value, tool)
      tools.value = { ...tools.value, [tool]: data }
    }, 'Tool failed.')

  const hint = () =>
    guarded(async () => {
      const data = await requestHint(shiftId.value)
      hints.value = [...hints.value, data.hint]
    }, 'Hint failed.')

  const decide = (decision) =>
    guarded(
      async () => showDebrief(await postDecision(shiftId.value, decision)),
      'Decision failed.',
    )

  const next = () =>
    guarded(async () => {
      const data = await nextCall(shiftId.value)
      applyStatus(data)
      loadCall(data.call)
    }, 'Could not continue.')

  async function collect() {
    const data = await completeShift(shiftId.value)
    result.value = data
    status.value = 'summary'
    playSfx(data.outcome === 'resisted' ? 'win' : 'lose')
    return data
  }

  const finish = () => guarded(collect, 'Could not collect the result.')

  async function retrySave() {
    retrying.value = true
    saveRetryError.value = ''
    try {
      const data = await completeShift(shiftId.value)
      result.value = data
      if (!data.saved) saveRetryError.value = 'Still not saved.'
    } catch (caught) {
      saveRetryError.value = simulatorErrorMessage(caught, 'Still not saved.')
    } finally {
      retrying.value = false
    }
  }

  function reset() {
    status.value = 'choosing'
    error.value = ''
    call.value = null
    result.value = null
    debrief.value = null
    shiftId.value = ''
  }

  return {
    status,
    pending,
    error,
    mode,
    call,
    callIndex,
    callsTotal,
    strikes,
    maxStrikes,
    streak,
    trust,
    messages,
    colleagueMessages,
    tools,
    hints,
    hintsLeft,
    messagesLeft,
    asksLeft,
    debrief,
    result,
    retrying,
    saveRetryError,
    canAct,
    start,
    send,
    ask,
    useTool,
    hint,
    decide,
    next,
    finish,
    retrySave,
    reset,
  }
}
