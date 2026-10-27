<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { AdminApiError, deleteAdminUser } from '../api.js'

const props = defineProps({
  account: { type: Object, required: true },
})
const emit = defineEmits(['deleted', 'close'])

const REASONS = [
  ['wrong-name', 'Wrong name'],
  ['duplicate', 'Duplicate account'],
  ['student-request', 'Student request'],
  ['left-school', 'Left school'],
  ['other', 'Other'],
]
const NOTE_MIN = 10
const NOTE_MAX = 500

const dialog = ref(null)
const confirmUsername = ref('')
const reasonCategory = ref('')
const reasonNote = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref({})
let controller
let completed = false

const needsNote = computed(() => reasonCategory.value === 'other')
const trimmedNote = computed(() => reasonNote.value.trim())
const usernameMatches = computed(
  () => confirmUsername.value.trim().toLowerCase() === props.account.username.toLowerCase(),
)
const noteValid = computed(
  () =>
    !needsNote.value ||
    (trimmedNote.value.length >= NOTE_MIN && trimmedNote.value.length <= NOTE_MAX),
)
const canSubmit = computed(
  () =>
    usernameMatches.value &&
    Boolean(reasonCategory.value) &&
    noteValid.value &&
    password.value.length > 0 &&
    !submitting.value,
)

function closeDialog() {
  if (submitting.value) return
  if (dialog.value?.open && typeof dialog.value.close === 'function') dialog.value.close()
  else emit('close')
}

function handleClose() {
  if (completed) return
  emit('close')
}

function handleCancel(event) {
  if (submitting.value) event.preventDefault()
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = ''
  fieldErrors.value = {}
  controller = new AbortController()
  const body = {
    confirmUsername: confirmUsername.value.trim(),
    password: password.value,
    reasonCategory: reasonCategory.value,
    ...(needsNote.value ? { reasonNote: trimmedNote.value } : {}),
    expectedRevision: props.account.revision,
  }
  try {
    const result = await deleteAdminUser(props.account.id, body, controller.signal)
    completed = true
    password.value = ''
    emit('deleted', result?.outcome === 'anonymised' ? 'anonymised' : 'deleted')
  } catch (error) {
    if (controller.signal.aborted) return
    password.value = ''
    if (error instanceof AdminApiError) {
      fieldErrors.value = error.fieldErrors || {}
      errorMessage.value = error.message
    } else {
      errorMessage.value = 'The account could not be deleted. Try again.'
    }
    await nextTick()
    dialog.value?.querySelector('#delete-account-password')?.focus()
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await nextTick()
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
  dialog.value?.querySelector('#delete-account-confirm')?.focus()
})

onBeforeUnmount(() => {
  controller?.abort()
  password.value = ''
  if (dialog.value?.open && typeof dialog.value.close === 'function') dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="admin-workspace__dialog"
    aria-labelledby="delete-account-title"
    @close="handleClose"
    @cancel="handleCancel"
  >
    <form class="admin-workspace__dialog-card" @submit.prevent="submit">
      <p class="admin-workspace__eyebrow">PERMANENT ACTION</p>
      <h2 id="delete-account-title">Delete {{ account.username }}?</h2>
      <p class="admin-workspace__alert" role="note">
        This cannot be undone. The student is signed out and can no longer sign in.
      </p>
      <p>
        A student with saved results is anonymised: the results are kept but never shown on
        leaderboards. A student with no saved results is removed completely.
      </p>

      <label for="delete-account-confirm">Type {{ account.username }} to confirm</label>
      <input
        id="delete-account-confirm"
        v-model="confirmUsername"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="submitting"
        :aria-invalid="Boolean(fieldErrors.confirmUsername)"
      />
      <p v-if="fieldErrors.confirmUsername" class="admin-workspace__alert" role="alert">
        {{ fieldErrors.confirmUsername }}
      </p>

      <label for="delete-account-reason">Reason</label>
      <select
        id="delete-account-reason"
        v-model="reasonCategory"
        :disabled="submitting"
        :aria-invalid="Boolean(fieldErrors.reasonCategory)"
      >
        <option value="" disabled>Choose a reason</option>
        <option v-for="[value, label] in REASONS" :key="value" :value="value">{{ label }}</option>
      </select>
      <p v-if="fieldErrors.reasonCategory" class="admin-workspace__alert" role="alert">
        {{ fieldErrors.reasonCategory }}
      </p>

      <template v-if="needsNote">
        <label for="delete-account-note">Note</label>
        <textarea
          id="delete-account-note"
          v-model="reasonNote"
          rows="3"
          :maxlength="NOTE_MAX"
          :disabled="submitting"
          aria-describedby="delete-account-note-help"
          :aria-invalid="Boolean(fieldErrors.reasonNote)"
        ></textarea>
        <small id="delete-account-note-help">
          Don't include names or emails. {{ trimmedNote.length }}/{{ NOTE_MAX }} (at least
          {{ NOTE_MIN }} characters)
        </small>
        <p v-if="fieldErrors.reasonNote" class="admin-workspace__alert" role="alert">
          {{ fieldErrors.reasonNote }}
        </p>
      </template>

      <label for="delete-account-password">Your administrator password</label>
      <input
        id="delete-account-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        :disabled="submitting"
        :aria-invalid="Boolean(fieldErrors.password)"
      />
      <p v-if="fieldErrors.password" class="admin-workspace__alert" role="alert">
        {{ fieldErrors.password }}
      </p>

      <p v-if="errorMessage" class="admin-workspace__alert" role="alert">{{ errorMessage }}</p>

      <div class="admin-workspace__actions">
        <button
          class="admin-workspace__text-button admin-workspace__text-button--danger"
          type="submit"
          :disabled="!canSubmit"
        >
          {{ submitting ? 'Deleting…' : 'Delete account' }}
        </button>
        <button
          class="admin-workspace__text-button"
          type="button"
          :disabled="submitting"
          @click="closeDialog"
        >
          Cancel
        </button>
      </div>
    </form>
  </dialog>
</template>
