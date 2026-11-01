<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  eligibleStudent: { type: Object, default: null },
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['issue'])
const identityVerified = ref(false)
const submitButton = ref(null)

watch(
  () => props.eligibleStudent?.id,
  () => {
    identityVerified.value = false
  },
)

function submit() {
  if (!props.eligibleStudent || !identityVerified.value || props.pending) return
  emit('issue', { identityVerified: true })
}

function focusSubmitButton() {
  submitButton.value?.focus()
}

defineExpose({ focusSubmitButton })
</script>

<template>
  <form class="recovery-issue-form" @submit.prevent="submit">
    <p class="recovery-issue-form__target">
      Prepare a private reset link for <strong>{{ eligibleStudent?.username }}</strong
      >{{ ' ' }}<span v-if="eligibleStudent?.email">({{ eligibleStudent.email }})</span>.
    </p>
    <label class="recovery-issue-form__check">
      <input v-model="identityVerified" type="checkbox" :disabled="pending" />
      <span>I confirmed this student's identity through an off-app school channel.</span>
    </label>
    <p v-if="error" class="recovery-alert" role="alert">{{ error }}</p>
    <button
      ref="submitButton"
      class="btn btn-primary recovery-button admin-workspace__button"
      type="submit"
      :disabled="pending || !eligibleStudent || !identityVerified"
    >
      {{ pending ? 'Preparing link…' : 'Prepare password reset link' }}
    </button>
  </form>
</template>
