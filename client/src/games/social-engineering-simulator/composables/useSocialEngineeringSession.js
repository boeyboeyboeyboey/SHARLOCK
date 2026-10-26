import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useVerifierChat } from './useVerifierChat.js'
import {
  completeSession,
  isSessionGone,
  NUDGE_IDLE_MS,
  requestNudge,
  sendMessage,
  simulatorErrorMessage,
  startSession,
} from '../simulator.js'

const SESSION_GONE_MESSAGE = 'This simulation has ended or expired. Start a new one.'

// status: choosing (pick where to save) | idle (loading) | briefing (brief shown) | chatting | awaiting (reply in flight)
//         | ended (debrief shown) | error (fatal load failure)
export function useSocialEngineeringSession() {
  const status = ref('choosing')
  const pending = ref(false)
  const persona = ref(null)
  const brief = ref(null)
  const messages = ref([])
  const turnsUsed = ref(0)
  const turnBudget = ref(0)
  const leaked = ref(false)
  const closed = ref(false)
  const result = ref(null)
  const error = ref('')
  const sessionId = ref('')
  const resetCode = ref('')
  const saveRetryError = ref('')
  const retrying = ref(false)
  let runContext = null
  let lastDecision = ''

  const activeChat = ref('attacker')
  const unread = reactive({ attacker: 0, verifier: 0 })

  let controller
  let nudgeTimer = null
  let nudgesLeft = 3
  let generation = 0
  const completing = ref(false)
  let disposed = false

  function goneState() {
    clearNudgeTimer()
    status.value = 'error'
    error.value = SESSION_GONE_MESSAGE
  }

  const verifierChat = useVerifierChat({
    sessionId,
    getSignal: () => controller?.signal,
    onLeaked: () => {
      if (disposed || result.value) return
      leaked.value = true
      closed.value = true
      clearNudgeTimer()
    },
    onSessionGone: () => {
      if (!disposed && !result.value) goneState()
    },
  })
  const verifier = verifierChat.info
  const verifierMessages = verifierChat.messages
  const verifierPending = verifierChat.pending
  const verifierTurnsUsed = verifierChat.turnsUsed
  const verifierTurnBudget = verifierChat.turnBudget
  const verifierContacted = verifierChat.contacted
  const verifierError = verifierChat.error
  const verifierEnded = verifierChat.ended
  const verifierFailedText = verifierChat.failedText

  const canSendVerifier = computed(
    () =>
      ['chatting', 'awaiting'].includes(status.value) &&
      !completing.value &&
      !leaked.value &&
      !result.value &&
      verifierChat.canSend.value,
  )

  function clearNudgeTimer() {
    if (nudgeTimer !== null) clearTimeout(nudgeTimer)
    nudgeTimer = null
  }

  function scheduleNudge() {
    clearNudgeTimer()
    if (disposed || !verifier.value || closed.value || result.value || nudgesLeft <= 0) return
    nudgeTimer = setTimeout(fireNudge, NUDGE_IDLE_MS)
  }

  async function fireNudge() {
    nudgeTimer = null
    if (disposed || pending.value || closed.value || result.value || nudgesLeft <= 0) return
    const request = generation
    try {
      const data = await requestNudge(sessionId.value, controller?.signal)
      if (disposed || request !== generation) return
      if (closed.value || result.value) return
      if (typeof data?.nudgesLeft === 'number') nudgesLeft = data.nudgesLeft
      if (!data?.message) return
      messages.value = [...messages.value, { role: 'colleague', content: data.message }]
      if (activeChat.value !== 'attacker') unread.attacker += 1
      scheduleNudge()
    } catch {
      // nudges are optional; stay quiet and let the next send restart the timer
    }
  }

  const canSend = computed(
    () => status.value === 'chatting' && !closed.value && !pending.value && !result.value,
  )
  const canDecide = computed(
    () => ['briefing', 'chatting'].includes(status.value) && !pending.value && !result.value,
  )

  function clearState() {
    persona.value = null
    brief.value = null
    messages.value = []
    turnsUsed.value = 0
    turnBudget.value = 0
    leaked.value = false
    closed.value = false
    result.value = null
    error.value = ''
    sessionId.value = ''
    resetCode.value = ''
    saveRetryError.value = ''
    retrying.value = false
    completing.value = false
    clearNudgeTimer()
    nudgesLeft = 3
    verifierChat.clear()
    activeChat.value = 'attacker'
    unread.attacker = 0
    unread.verifier = 0
  }

  function selectChat(id) {
    if (id !== 'attacker' && id !== 'verifier') return
    activeChat.value = id
    unread[id] = 0
  }

  async function sendVerifier(content) {
    if (!canSendVerifier.value) return
    const request = generation
    const replyText = await verifierChat.send(content)
    if (disposed || request !== generation) return
    if (replyText && activeChat.value !== 'verifier') unread.verifier += 1
  }

  async function start(context) {
    if (context) runContext = context
    if (!runContext) return
    controller?.abort()
    controller = new AbortController()
    const request = (generation += 1)
    clearState()
    status.value = 'idle'
    pending.value = true
    try {
      const data = await startSession(runContext, controller.signal)
      if (disposed || request !== generation) return
      sessionId.value = data.sessionId
      resetCode.value = data.resetCode ?? ''
      persona.value = data.persona
      brief.value = data.brief
      turnBudget.value = data.brief?.turnBudget ?? 0
      messages.value = [{ role: 'colleague', content: data.openingMessage }]
      verifierChat.init(data.verifier)
      status.value = 'briefing'
    } catch (requestError) {
      if (disposed || request !== generation) return
      status.value = 'error'
      error.value = simulatorErrorMessage(
        requestError,
        'The simulation could not be started. Check your connection and try again.',
      )
    } finally {
      if (!disposed && request === generation) pending.value = false
    }
  }

  // reveal the chat once the player has read the brief
  function begin() {
    if (status.value !== 'briefing') return
    status.value = 'chatting'
    scheduleNudge()
  }

  async function send(content) {
    const text = content?.trim()
    if (!text || !canSend.value) return
    const request = generation
    messages.value = [...messages.value, { role: 'you', content: text }]
    clearNudgeTimer()
    status.value = 'awaiting'
    pending.value = true
    error.value = ''
    try {
      const data = await sendMessage(sessionId.value, text, controller?.signal)
      if (disposed || request !== generation) return
      turnsUsed.value = data.turnsUsed
      turnBudget.value = data.turnBudget
      if (data.leaked) leaked.value = true
      if (data.ended) closed.value = true
      if (data.reply)
        messages.value = [...messages.value, { role: 'colleague', content: data.reply }]
      if (data.reply && activeChat.value !== 'attacker') unread.attacker += 1
      status.value = 'chatting'
      scheduleNudge()
    } catch (requestError) {
      if (disposed || request !== generation) return
      if (isSessionGone(requestError)) {
        goneState()
        return
      }
      status.value = 'chatting'
      scheduleNudge()
      error.value = simulatorErrorMessage(
        requestError,
        'That message could not be delivered. Try again in a moment.',
      )
    } finally {
      if (!disposed && request === generation) pending.value = false
    }
  }

  async function complete(decision) {
    if (!canDecide.value && !closed.value) return
    if (result.value) return
    const request = generation
    clearNudgeTimer()
    completing.value = true
    status.value = 'awaiting'
    pending.value = true
    error.value = ''
    try {
      lastDecision = decision
      const data = await completeSession(sessionId.value, decision, controller?.signal)
      if (disposed || request !== generation) return
      result.value = data
      clearNudgeTimer()
      status.value = 'ended'
    } catch (requestError) {
      if (disposed || request !== generation) return
      if (isSessionGone(requestError)) {
        goneState()
        return
      }
      status.value = 'chatting'
      scheduleNudge()
      error.value = simulatorErrorMessage(
        requestError,
        'The debrief could not be loaded. Try again in a moment.',
      )
    } finally {
      if (!disposed && request === generation) {
        pending.value = false
        completing.value = false
      }
    }
  }

  // the server keeps a finished run for a few minutes, so asking again retries the save
  async function retrySave() {
    if (!result.value || result.value.saved || retrying.value) return
    const request = generation
    retrying.value = true
    saveRetryError.value = ''
    try {
      const data = await completeSession(sessionId.value, lastDecision, controller?.signal)
      if (disposed || request !== generation) return
      result.value = data
    } catch (requestError) {
      if (disposed || request !== generation) return
      saveRetryError.value = simulatorErrorMessage(
        requestError,
        'The result could not be saved. Try again in a moment.',
      )
    } finally {
      if (!disposed && request === generation) retrying.value = false
    }
  }

  // back to the save-location chooser for a fresh run
  function reset() {
    controller?.abort()
    generation += 1
    clearState()
    pending.value = false
    status.value = 'choosing'
  }

  onBeforeUnmount(() => {
    disposed = true
    clearNudgeTimer()
    verifierChat.clear()
    controller?.abort()
  })

  return {
    status,
    pending,
    persona,
    brief,
    messages,
    turnsUsed,
    turnBudget,
    leaked,
    closed,
    result,
    error,
    resetCode,
    saveRetryError,
    retrying,
    verifier,
    verifierMessages,
    verifierPending,
    verifierTurnsUsed,
    verifierTurnBudget,
    verifierContacted,
    verifierError,
    verifierEnded,
    verifierFailedText,
    activeChat,
    unread,
    canSendVerifier,
    selectChat,
    sendVerifier,
    canSend,
    canDecide,
    start,
    begin,
    send,
    complete,
    retrySave,
    reset,
  }
}
