import { computed, ref, watch } from 'vue'
import { useAttempt } from '../../../features/attempts/useAttempt.js'

export const REQUIRED_EVIDENCE = 2

export function usePhishingCase() {
  const attempt = useAttempt('phishing-post-mortem')
  const { snapshot, busy, error, retryable } = attempt
  const selectedEmailId = ref('')
  const accusedEmailId = ref('')
  const readEmailIds = ref([])
  const inspectedLinkIds = ref([])
  const selectedEvidenceIds = ref([])
  const pane = ref('message')
  const reviewing = ref(false)

  const caseFile = computed(() => snapshot.value?.publicState?.case ?? null)
  // the debrief component reads one object: the server verdict plus the attempt's max score
  const result = computed(() => {
    const verdict = snapshot.value?.publicState?.verdict
    return verdict ? { ...verdict, maxScore: snapshot.value.maxScore } : null
  })
  const completed = computed(() => snapshot.value?.status === 'completed')
  // a verdict exists but the attempt is not saved yet
  const unsaved = computed(() => Boolean(result.value) && !completed.value)

  const findEmail = (id) => caseFile.value?.emails.find((email) => email.id === id) ?? null
  const selectedEmail = computed(() => findEmail(selectedEmailId.value))
  const accusedEmail = computed(() => findEmail(accusedEmailId.value))
  const emails = computed(
    () =>
      caseFile.value?.emails.map((email) => ({
        ...email,
        read: readEmailIds.value.includes(email.id),
      })) ?? [],
  )
  const canSubmit = computed(
    () =>
      Boolean(accusedEmailId.value) &&
      selectedEvidenceIds.value.length === REQUIRED_EVIDENCE &&
      !busy.value &&
      !retryable.value &&
      !result.value,
  )

  function reset() {
    selectedEmailId.value = ''
    accusedEmailId.value = ''
    readEmailIds.value = []
    inspectedLinkIds.value = []
    selectedEvidenceIds.value = []
    reviewing.value = false
    pane.value = 'message'
  }

  // a different attempt means a different case, so the inbox starts clean
  watch(() => snapshot.value?.attemptId, reset)

  function selectEmail(id) {
    selectedEmailId.value = id
    if (!readEmailIds.value.includes(id)) readEmailIds.value = [...readEmailIds.value, id]
    pane.value = 'message'
    // after the verdict a message opens read-only, with a way back to the debrief
    if (result.value) reviewing.value = true
  }

  function backToDebrief() {
    reviewing.value = false
    pane.value = 'message'
  }

  function accuse(id) {
    accusedEmailId.value = id
  }

  function inspectLink(linkId) {
    if (!inspectedLinkIds.value.includes(linkId))
      inspectedLinkIds.value = [...inspectedLinkIds.value, linkId]
  }

  function setEvidence(ids) {
    selectedEvidenceIds.value = ids.slice(0, REQUIRED_EVIDENCE)
  }

  function showInbox() {
    pane.value = 'inbox'
  }

  // saving follows the verdict straight away; a failed save stays retryable
  async function save() {
    if (retryable.value) return attempt.retry()
    return attempt.complete()
  }

  async function submit() {
    if (!canSubmit.value) return false
    const sent = await attempt.mutate('submit-verdict', {
      selectedEmailId: accusedEmailId.value,
      evidenceIds: [...selectedEvidenceIds.value],
    })
    if (!sent) return false
    reviewing.value = false
    pane.value = 'message'
    return attempt.complete()
  }

  // a failed verdict retries the same request; after a verdict the retry is the save
  async function retry() {
    const ok = await attempt.retry()
    if (!ok) return false
    if (snapshot.value?.status === 'active' && result.value) {
      reviewing.value = false
      pane.value = 'message'
      return attempt.complete()
    }
    return true
  }

  function resetGame() {
    snapshot.value = null
    error.value = ''
  }

  return {
    snapshot,
    caseFile,
    emails,
    busy,
    error,
    retryable,
    result,
    completed,
    unsaved,
    selectedEmailId,
    selectedEmail,
    accusedEmailId,
    accusedEmail,
    selectedEvidenceIds,
    inspectedLinkIds,
    pane,
    reviewing,
    canSubmit,
    start: attempt.start,
    load: attempt.load,
    submit,
    save,
    retry,
    selectEmail,
    accuse,
    inspectLink,
    setEvidence,
    showInbox,
    backToDebrief,
    resetGame,
  }
}
