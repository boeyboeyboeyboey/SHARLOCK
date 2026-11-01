import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { readAttempt, safeAttemptError, writeAttempt } from './api.js'

const NOT_SENT_MESSAGE = 'Could not reach saved play. Check your connection, then try again.'

// resending can only help a lost response or a busy server; a refusal would just be refused again
function canResend({ status, code }) {
  if (status === 403) return code === 'CSRF_INVALID'
  return ![400, 401, 404, 409].includes(status)
}

export function useAttempt(gameId) {
  const snapshot = shallowRef(null)
  const busy = ref(false)
  const error = ref('')
  const retryable = ref(false)
  let pending = null
  const controller = new AbortController()

  async function execute(operation) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      const result = await operation()
      if (controller.signal.aborted) return false
      if (result.gameId !== gameId) throw new Error('Unexpected game')
      snapshot.value = result
      pending = null
      retryable.value = false
      return true
    } catch (failure) {
      if (!controller.signal.aborted) {
        const safe = safeAttemptError(failure)
        // a start or a read has no held request, so there is no same request to retry
        const unreached = safe.status === 0 || safe.status >= 500
        error.value = !pending && unreached ? NOT_SENT_MESSAGE : safe.message
        retryable.value = Boolean(pending) && canResend(safe)
        if (!retryable.value) pending = null
      }
      return false
    } finally {
      busy.value = false
    }
  }

  async function sendPending() {
    if (!pending) return false
    const request = pending
    return execute(() => writeAttempt(request.path, request.body, controller.signal))
  }

  function mutate(type, payload = {}) {
    if (busy.value || pending || !snapshot.value || snapshot.value.status !== 'active') return false
    pending = {
      path: `/attempts/${snapshot.value.attemptId}/actions`,
      body: {
        actionId: crypto.randomUUID(),
        expectedRevision: snapshot.value.revision,
        type,
        payload,
      },
    }
    return sendPending()
  }

  function complete() {
    if (busy.value || pending || !snapshot.value) return false
    pending = {
      path: `/attempts/${snapshot.value.attemptId}/complete`,
      body: { actionId: crypto.randomUUID(), expectedRevision: snapshot.value.revision },
    }
    return sendPending()
  }

  function start(context) {
    if (pending) return false
    return execute(() => writeAttempt(`/games/${gameId}/attempts`, { context }, controller.signal))
  }

  function load(id) {
    if (pending) return false
    return execute(() => readAttempt(id, controller.signal))
  }

  onBeforeUnmount(() => {
    controller.abort()
    pending = null
  })
  return { snapshot, busy, error, retryable, start, load, mutate, complete, retry: sendPending }
}
