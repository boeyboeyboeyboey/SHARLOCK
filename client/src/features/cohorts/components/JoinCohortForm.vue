<script setup>
import { ref } from 'vue'
import { normalizeInvitationCode } from '../journey.js'

defineProps({ pending: { type: Boolean, default: false }, error: { type: String, default: '' } })
const emit = defineEmits(['submit'])
const code = ref('')
const fieldError = ref('')

function submit() {
  const normalized = normalizeInvitationCode(code.value)
  fieldError.value = normalized ? '' : 'Enter the 16-character class code.'
  if (normalized) emit('submit', normalized)
}
</script>

<template>
  <form class="cohort-form" novalidate @submit.prevent="submit">
    <div v-if="error || fieldError" class="cohort-alert" role="alert">
      {{ fieldError || error }}
    </div>
    <label for="cohort-code">Class invitation code</label>
    <input
      id="cohort-code"
      v-model="code"
      autocomplete="off"
      autocapitalize="characters"
      maxlength="19"
      :disabled="pending"
      :aria-invalid="Boolean(fieldError || error)"
      aria-describedby="cohort-code-help"
    />
    <small id="cohort-code-help"
      >Enter the code from your instructor. Dashes and spaces are optional.</small
    >
    <button class="btn btn-primary cohort-action" type="submit" :disabled="pending">
      {{ pending ? 'Sending request…' : 'Join class' }}
    </button>
  </form>
</template>
