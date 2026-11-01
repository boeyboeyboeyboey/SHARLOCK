<script setup>
import { nextTick, ref } from 'vue'
import { parseNewPasswordInput } from '../../auth/validation.js'

defineProps({
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['submit'])
const password = ref('')
const confirmation = ref('')
const localError = ref('')
const showPassword = ref(false)
const summary = ref(null)

function focusSummary() {
  nextTick(() => summary.value?.focus())
}

function clearSecrets() {
  password.value = ''
  confirmation.value = ''
  localError.value = ''
  showPassword.value = false
}

function submit() {
  localError.value = ''
  try {
    parseNewPasswordInput(password.value)
  } catch (cause) {
    // the shared rule names each requirement that is still missing
    localError.value = cause.fieldErrors?.password || 'That password could not be accepted.'
  }
  if (!localError.value && password.value !== confirmation.value) {
    localError.value = 'Passwords must match.'
  }
  if (localError.value) {
    focusSummary()
    return
  }
  emit('submit', { password: password.value, confirmation: confirmation.value })
}

defineExpose({ clearSecrets })
</script>

<template>
  <form class="auth-form recovery-reset-form" @submit.prevent="submit">
    <div class="auth-field">
      <label for="reset-password">New password</label>
      <div class="auth-password-control">
        <input
          id="reset-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="new-password"
          autocomplete="new-password"
          required
          :disabled="pending"
          :aria-invalid="Boolean(localError || error)"
          aria-describedby="reset-password-hint reset-password-error"
        />
        <button
          class="auth-password-toggle"
          type="button"
          :aria-pressed="showPassword"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          :disabled="pending"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Hide' : 'Show' }}
        </button>
      </div>
      <small id="reset-password-hint">
        Use at least 12 characters, including an uppercase letter and a special character.
      </small>
    </div>
    <div class="auth-field">
      <label for="reset-password-confirmation">Confirm password</label>
      <input
        id="reset-password-confirmation"
        v-model="confirmation"
        :type="showPassword ? 'text' : 'password'"
        name="new-password-confirmation"
        autocomplete="new-password"
        required
        :disabled="pending"
        :aria-invalid="Boolean(localError || error)"
        aria-describedby="reset-password-error"
      />
    </div>
    <p
      v-if="localError || error"
      id="reset-password-error"
      ref="summary"
      class="recovery-alert"
      role="alert"
      tabindex="-1"
    >
      {{ localError || error }}
    </p>
    <button class="btn btn-primary recovery-button" type="submit" :disabled="pending">
      {{ pending ? 'Updating password…' : 'Set password' }}
    </button>
  </form>
</template>
