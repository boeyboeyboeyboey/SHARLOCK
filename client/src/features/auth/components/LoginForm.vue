<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { parseLoginInput } from '../validation.js'

const props = defineProps({
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  fieldErrors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['submit'])

const identifier = ref('')
const password = ref('')
const showPassword = ref(false)
const localErrors = ref(Object.create(null))
const summary = ref(null)
const identifierError = computed(
  () => localErrors.value.identifier || props.fieldErrors.identifier || '',
)
const passwordError = computed(() => localErrors.value.password || props.fieldErrors.password || '')
const hasFieldErrors = computed(() => Boolean(identifierError.value || passwordError.value))

function focusSummary() {
  nextTick(() => summary.value?.focus())
}

function submit() {
  localErrors.value = Object.create(null)
  try {
    const input = parseLoginInput({ identifier: identifier.value, password: password.value })
    emit('submit', { identifier: input.identifier.normalized, password: input.password })
  } catch (error) {
    localErrors.value = error.fieldErrors || Object.create(null)
    focusSummary()
  }
}

function clearSecrets() {
  password.value = ''
  showPassword.value = false
}

watch(
  () => props.error,
  (error) => {
    if (error) focusSummary()
  },
)
onBeforeUnmount(clearSecrets)
defineExpose({ clearSecrets })
</script>

<template>
  <form class="auth-form" novalidate @submit.prevent="submit">
    <div
      v-if="error || hasFieldErrors"
      ref="summary"
      class="auth-error-summary"
      role="alert"
      tabindex="-1"
      aria-labelledby="login-error-title"
    >
      <strong id="login-error-title">We couldn't sign you in yet.</strong>
      <p v-if="error">{{ error }}</p>
      <p v-else>Check the highlighted fields and try again.</p>
    </div>

    <div class="auth-field">
      <label for="login-identifier">Email or username</label>
      <input
        id="login-identifier"
        v-model="identifier"
        type="text"
        name="username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
        :disabled="pending"
        :aria-invalid="Boolean(identifierError)"
        :aria-describedby="identifierError ? 'login-identifier-error' : undefined"
      />
      <p v-if="identifierError" id="login-identifier-error" class="auth-field-error">
        {{ identifierError }}
      </p>
    </div>

    <div class="auth-field">
      <label for="login-password">Password</label>
      <div class="auth-password-control">
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          autocomplete="current-password"
          aria-keyshortcuts="Alt+S"
          required
          :disabled="pending"
          :aria-invalid="Boolean(passwordError)"
          :aria-describedby="passwordError ? 'login-password-error' : undefined"
          @keydown.alt.s.prevent="showPassword = !showPassword"
        />
        <button
          class="auth-password-toggle"
          type="button"
          tabindex="-1"
          :aria-pressed="showPassword"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          title="Show or hide (Alt+S in the field)"
          :disabled="pending"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Hide' : 'Show' }}
        </button>
      </div>
      <p v-if="passwordError" id="login-password-error" class="auth-field-error">
        {{ passwordError }}
      </p>
    </div>

    <button class="btn btn-primary auth-submit" type="submit" :disabled="pending">
      {{ pending ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
