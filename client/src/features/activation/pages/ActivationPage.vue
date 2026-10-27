<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../auth/store.js'
import PixelIcon from '../../../components/town/PixelIcon.vue'
import { parseNewPasswordInput } from '../../auth/validation.js'
import { activateAccount, ActivationApiError } from '../api.js'
import '../activation.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const token = ref('')
const state = ref('preparing')
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const showConfirmation = ref(false)
const pending = ref(false)
const pendingSignOut = ref(false)
const passwordError = ref('')
const confirmationError = ref('')
const formError = ref('')
const signOutError = ref('')
const summary = ref(null)
const controller = new AbortController()
let disposed = false

function focusSummary() {
  nextTick(() => summary.value?.focus())
}

function clearPasswordFields() {
  password.value = ''
  confirmation.value = ''
  showPassword.value = false
  showConfirmation.value = false
}

function queryWithoutToken() {
  const query = { ...route.query }
  delete query.token
  return query
}

async function prepareActivation() {
  const fragment = window.location.hash || route.hash || ''
  const tokenMatch = /^#token=([A-Za-z\d_-]{43})$/.exec(fragment)
  const query = queryWithoutToken()
  const hasQueryToken = Object.hasOwn(route.query, 'token')
  token.value = !hasQueryToken && tokenMatch ? tokenMatch[1] : ''

  if (fragment || hasQueryToken) {
    try {
      await router.replace({ path: route.path, query, hash: '' })
    } catch {
      token.value = ''
      state.value = 'invalid'
      return
    }
  }

  state.value = token.value ? 'ready' : 'invalid'
  try {
    await auth.restoreSession({ force: true })
  } catch {
    if (disposed) return
  }
}

watch(
  () => auth.user,
  () => {
    if (state.value === 'success') focusSummary()
  },
)

async function submit() {
  if (pending.value || state.value !== 'ready' || !token.value) return
  passwordError.value = ''
  confirmationError.value = ''
  formError.value = ''

  let validatedPassword
  try {
    validatedPassword = parseNewPasswordInput(password.value)
  } catch {
    passwordError.value = [
      'That password could not be accepted.',
      'Use at least 12 characters, including an uppercase letter and a special character.',
    ].join(' ')
    focusSummary()
    return
  }
  if (password.value !== confirmation.value) {
    confirmationError.value = 'Passwords must match.'
    focusSummary()
    return
  }

  pending.value = true
  try {
    await activateAccount({ token: token.value, password: validatedPassword }, controller.signal)
    if (disposed) return
    token.value = ''
    clearPasswordFields()
    state.value = 'success'
    focusSummary()
  } catch (error) {
    if (disposed) return
    if (error instanceof ActivationApiError && error.code === 'INVALID_ACTIVATION') {
      token.value = ''
      clearPasswordFields()
      state.value = 'invalid'
    } else if (error instanceof ActivationApiError && error.code === 'INVALID_INPUT') {
      passwordError.value = 'Check the password requirements and try again.'
    } else {
      formError.value =
        error instanceof ActivationApiError
          ? error.message
          : 'We could not complete activation. Check your connection and try again.'
    }
    focusSummary()
  } finally {
    pending.value = false
  }
}

async function signOutForLogin() {
  if (pendingSignOut.value) return
  pendingSignOut.value = true
  signOutError.value = ''
  try {
    await auth.logout()
    await router.replace('/login')
  } catch {
    signOutError.value =
      'Sign-out did not complete. Try again before signing in to the new account.'
  } finally {
    pendingSignOut.value = false
  }
}

onMounted(prepareActivation)

onBeforeUnmount(() => {
  disposed = true
  controller.abort()
  token.value = ''
  clearPasswordFields()
})
</script>

<template>
  <div class="activation-workspace">
    <section class="activation-workspace__card" aria-labelledby="activation-title">
      <div class="activation-workspace__icon" aria-hidden="true">
        <PixelIcon name="key" :size="32" />
      </div>
      <p class="activation-workspace__eyebrow">STAFF ACCOUNT</p>
      <h1 id="activation-title">Activate your account</h1>
      <p class="activation-workspace__intro">
        Choose a password to finish setting up your staff account.
      </p>

      <div
        v-if="state === 'success'"
        ref="summary"
        class="activation-workspace__message"
        role="status"
        tabindex="-1"
        aria-labelledby="activation-success-title"
      >
        <h2 id="activation-success-title">Your account is ready</h2>
        <p>Your password is set. Sign in normally to continue.</p>
        <template v-if="auth.user">
          <p>
            You are currently signed in to another account. Sign out before using the new account.
          </p>
          <p v-if="signOutError" class="activation-workspace__error" role="alert">
            {{ signOutError }}
          </p>
          <button
            class="activation-workspace__button"
            type="button"
            :disabled="pendingSignOut"
            @click="signOutForLogin"
          >
            {{ pendingSignOut ? 'Signing out…' : 'Sign out and go to sign in' }}
          </button>
        </template>
        <RouterLink v-else class="activation-workspace__button" to="/login">
          Continue to sign in
        </RouterLink>
      </div>

      <div
        v-else-if="state === 'invalid'"
        ref="summary"
        class="activation-workspace__message"
        role="alert"
        tabindex="-1"
      >
        <h2>This activation link is unavailable</h2>
        <p>
          It may be invalid, expired, or already used. Ask your administrator for a new activation
          link.
        </p>
        <RouterLink class="activation-workspace__text-link" to="/login">Go to sign in</RouterLink>
      </div>

      <form
        v-else-if="state === 'ready'"
        class="activation-workspace__form"
        @submit.prevent="submit"
      >
        <div
          v-if="formError || passwordError || confirmationError"
          ref="summary"
          class="activation-workspace__error-summary"
          role="alert"
          tabindex="-1"
          aria-labelledby="activation-error-title"
        >
          <strong id="activation-error-title">We could not finish activation yet.</strong>
          <p v-if="formError">{{ formError }}</p>
          <p v-else-if="passwordError">{{ passwordError }}</p>
          <p v-else>{{ confirmationError }}</p>
        </div>

        <div class="activation-workspace__field">
          <label for="activation-password">New password</label>
          <div class="activation-workspace__password-control">
            <input
              id="activation-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              name="new-password"
              autocomplete="new-password"
              required
              :disabled="pending"
              :aria-invalid="Boolean(passwordError)"
              :aria-describedby="
                passwordError
                  ? 'activation-password-hint activation-password-error'
                  : 'activation-password-hint'
              "
            />
            <button
              class="activation-workspace__toggle"
              type="button"
              :aria-pressed="showPassword"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :disabled="pending"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <small id="activation-password-hint">
            Use at least 12 characters, including an uppercase letter and a special character.
            Spaces are allowed.
          </small>
          <p
            v-if="passwordError"
            id="activation-password-error"
            class="activation-workspace__field-error"
          >
            {{ passwordError }}
          </p>
        </div>

        <div class="activation-workspace__field">
          <label for="activation-confirmation">Confirm password</label>
          <div class="activation-workspace__password-control">
            <input
              id="activation-confirmation"
              v-model="confirmation"
              :type="showConfirmation ? 'text' : 'password'"
              name="password-confirmation"
              autocomplete="new-password"
              required
              :disabled="pending"
              :aria-invalid="Boolean(confirmationError)"
              :aria-describedby="
                confirmationError
                  ? 'activation-confirmation-hint activation-confirmation-error'
                  : 'activation-confirmation-hint'
              "
            />
            <button
              class="activation-workspace__toggle"
              type="button"
              :aria-pressed="showConfirmation"
              :aria-label="showConfirmation ? 'Hide confirmation' : 'Show confirmation'"
              :disabled="pending"
              @click="showConfirmation = !showConfirmation"
            >
              {{ showConfirmation ? 'Hide' : 'Show' }}
            </button>
          </div>
          <small id="activation-confirmation-hint">Enter the same password again.</small>
          <p
            v-if="confirmationError"
            id="activation-confirmation-error"
            class="activation-workspace__field-error"
          >
            {{ confirmationError }}
          </p>
        </div>

        <button class="activation-workspace__button" type="submit" :disabled="pending">
          {{ pending ? 'Activating…' : 'Set password and activate account' }}
        </button>
      </form>

      <p v-else class="activation-workspace__loading" role="status">Checking activation link…</p>
    </section>
  </div>
</template>
