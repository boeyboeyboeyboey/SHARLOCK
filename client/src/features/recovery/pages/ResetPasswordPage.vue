<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../auth/store.js'
import ResetPasswordForm from '../components/ResetPasswordForm.vue'
import { resetPassword, safeRecoveryError } from '../api.js'
import { clearResetLinkCapture, resetLinkCaptureState } from '../../../router/index.js'
import '../recovery.css'
import '../../auth/auth.css'

const router = useRouter()
const auth = useAuthStore()
const form = ref(null)
const token = ref('')
const captureStatus = ref('missing')
const sessionChecked = ref(false)
const checkingSession = ref(false)
const signingOut = ref(false)
const pending = ref(false)
const sessionError = ref('')
const error = ref('')
const success = ref(false)
let resetController = null
const authenticated = computed(() => auth.status === 'authenticated' && Boolean(auth.user))
const tokenReady = computed(() => captureStatus.value === 'ready' && Boolean(token.value))

watch(
  () => [resetLinkCaptureState.status, resetLinkCaptureState.token],
  ([status, nextToken], [previousStatus, previousToken] = []) => {
    if (previousStatus === 'ready' && (status !== 'ready' || nextToken !== previousToken)) {
      resetController?.abort()
      resetController = null
      pending.value = false
    }
    captureStatus.value = status
    token.value = status === 'ready' ? nextToken : ''
    error.value = ''
    if (status === 'ready') success.value = false
    form.value?.clearSecrets()
  },
  { immediate: true },
)

async function checkSession() {
  if (checkingSession.value || !tokenReady.value) return
  checkingSession.value = true
  sessionChecked.value = false
  sessionError.value = ''
  try {
    await auth.restoreSession({ force: true })
    sessionChecked.value = true
  } catch {
    sessionError.value =
      auth.requestError?.message || 'Your account could not be checked. Try again.'
  } finally {
    checkingSession.value = false
  }
}

async function signOutBeforeReset() {
  if (signingOut.value || !authenticated.value) return
  signingOut.value = true
  sessionError.value = ''
  try {
    await auth.logout()
    sessionChecked.value = auth.status === 'anonymous'
  } catch {
    sessionError.value = auth.requestError?.message || 'You could not be signed out. Try again.'
  } finally {
    signingOut.value = false
  }
}

async function submitReset({ password }) {
  if (pending.value || !tokenReady.value || auth.status !== 'anonymous' || auth.user) return
  const requestToken = token.value
  const controller = new AbortController()
  resetController?.abort()
  resetController = controller
  pending.value = true
  error.value = ''
  try {
    await resetPassword(requestToken, password, controller.signal)
    if (controller.signal.aborted) return
    token.value = ''
    captureStatus.value = 'missing'
    clearResetLinkCapture()
    form.value?.clearSecrets()
    success.value = true
    await router.replace({ path: '/login', query: { passwordReset: '1' } })
  } catch (cause) {
    if (!controller.signal.aborted) {
      const safe = safeRecoveryError(cause)
      error.value =
        safe.code === 'RECOVERY_UNAVAILABLE'
          ? 'This reset link is no longer available. Ask a staff member to prepare a new one.'
          : safe.message
    }
  } finally {
    if (resetController === controller) {
      resetController = null
      pending.value = false
    }
  }
}

onMounted(() => {
  void checkSession()
})
// a link pasted into this open tab only changes the hash, so nothing remounts the page
watch(tokenReady, (ready) => {
  if (ready) void checkSession()
})

onBeforeUnmount(() => {
  resetController?.abort()
  resetController = null
  token.value = ''
  form.value?.clearSecrets()
  clearResetLinkCapture()
})
</script>

<template>
  <section class="auth-page recovery-page" aria-labelledby="reset-page-title">
    <div class="auth-card">
      <h1 id="reset-page-title" tabindex="-1">Choose a new password</h1>

      <p
        v-if="!success && !tokenReady"
        id="reset-password-error"
        class="recovery-alert"
        role="alert"
      >
        Open the reset link from your message again. If it still does not work, ask a staff member
        to prepare a new one.
      </p>

      <template v-else-if="tokenReady">
        <p v-if="sessionError" class="recovery-alert" role="alert">{{ sessionError }}</p>
        <p v-if="checkingSession" class="recovery-muted" role="status">Checking your account…</p>
        <template v-else-if="authenticated">
          <p>Sign out before choosing a new password.</p>
          <button
            class="btn btn-primary recovery-button"
            type="button"
            :disabled="signingOut"
            @click="signOutBeforeReset"
          >
            {{ signingOut ? 'Signing out…' : 'Sign out before resetting password' }}
          </button>
        </template>
        <template v-else-if="sessionChecked && auth.status === 'anonymous'">
          <ResetPasswordForm ref="form" :pending="pending" :error="error" @submit="submitReset" />
        </template>
        <template v-else>
          <button
            class="btn btn-secondary recovery-button"
            type="button"
            :disabled="checkingSession"
            @click="checkSession"
          >
            Check account status
          </button>
        </template>
      </template>
      <p v-if="success" class="recovery-notice" role="status">
        Your password was updated. Sign in with your new password.
      </p>
    </div>
  </section>
</template>
