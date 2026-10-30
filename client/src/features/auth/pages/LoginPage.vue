<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PixelIcon from '../../../components/town/PixelIcon.vue'
import { useAuthStore } from '../store.js'
import LoginForm from '../components/LoginForm.vue'
import VerifyEmailPanel from '../components/VerifyEmailPanel.vue'
import SessionNotice from '../components/SessionNotice.vue'
import { resolveEnrollmentDestination } from '../../cohorts/journey.js'
import '../auth.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const form = ref(null)
const pending = ref(false)
// derived from the store, so nothing re-renders the form between the code screen and signing in
const signedIn = computed(() => auth.status === 'authenticated')
const continuing = ref(false)
const continuationError = ref('')
const controller = new AbortController()
onBeforeUnmount(() => controller.abort())
const introAvatar = '/images/town/capybara-mint.svg'
const expiredNotice = computed(() => route.query.reason === 'expired')
const elsewhereNotice = computed(() => route.query.reason === 'elsewhere')
const passwordResetNotice = computed(() => route.query.passwordReset === '1')
const fieldErrors = computed(() => auth.requestError?.fieldErrors || {})
const errorMessage = computed(() => auth.requestError?.message || '')
const verifying = computed(() => Boolean(auth.pendingVerification) && !signedIn.value)

async function continueAfterSignIn() {
  if (continuing.value) return
  continuing.value = true
  continuationError.value = ''
  try {
    const destination = await resolveEnrollmentDestination(auth.user, {
      signal: controller.signal,
      afterAccountAccess: true,
    })
    if (!controller.signal.aborted) await router.replace(destination)
  } catch {
    if (!controller.signal.aborted) {
      continuationError.value = 'You are signed in. Class setup is unavailable. Try Continue again.'
    }
  } finally {
    continuing.value = false
  }
}

async function signIn(payload) {
  if (pending.value) return
  pending.value = true
  try {
    // an account whose email is not confirmed yet resolves to the code screen instead of a user
    const user = await auth.login(payload)
    form.value?.clearSecrets()
    if (user) {
      await continueAfterSignIn()
    }
  } catch {
    // the store keeps only the safe message for the form
  } finally {
    pending.value = false
  }
}

async function confirmCode(code) {
  if (pending.value) return
  pending.value = true
  try {
    const user = await auth.verifyEmail(code)
    if (user) {
      await continueAfterSignIn()
    }
  } catch {
    // the store keeps only the safe message for the code screen
  } finally {
    pending.value = false
  }
}

async function resendCode() {
  if (pending.value) return
  pending.value = true
  try {
    await auth.resendVerification()
  } catch {
    // the store keeps only the safe message for the code screen
  } finally {
    pending.value = false
  }
}

async function checkSession() {
  try {
    await auth.restoreSession({ force: true })
  } catch {
    // the store exposes only a safe recovery message
  }
}
</script>

<template>
  <section class="auth-page" aria-labelledby="login-title">
    <div class="auth-page__art" aria-hidden="true">
      <img :src="introAvatar" width="180" height="135" alt="" />
      <span class="auth-page__spark"><PixelIcon name="key" :size="24" /></span>
    </div>
    <section class="auth-card">
      <h1 id="login-title" tabindex="-1">
        {{ verifying ? 'Confirm your email' : 'Sign in to Sharlock' }}
      </h1>

      <p v-if="passwordResetNotice" class="auth-field-hint" role="status">
        Your password was updated. Sign in with your new password.
      </p>

      <p v-if="elsewhereNotice" class="auth-field-hint" role="status">
        You were signed out because your account signed in somewhere else. If that wasn't you, reset your password.
      </p>

      <SessionNotice
        v-if="expiredNotice"
        message="Your session ended. Sign in again to continue. Your unfinished action was not repeated."
        :pending="pending"
        @retry="checkSession"
      />

      <!-- the signed-in view stays outside the transition: signing in navigates away at once, and
           an out-in transition holding a not-yet-mounted view crashes when its page is unmounted -->
      <div v-if="signedIn" aria-live="polite">
        <p>You are signed in.</p>
        <p v-if="continuationError" role="alert">{{ continuationError }}</p>
        <button class="btn btn-primary" type="button" :disabled="pending || continuing" @click="continueAfterSignIn">
          {{ continuing ? 'Opening Sharlock Town…' : 'Continue' }}
        </button>
      </div>

      <Transition v-else name="auth-step" mode="out-in">
        <VerifyEmailPanel
          v-if="verifying"
          key="verify"
          :verification="auth.pendingVerification"
          :pending="pending"
          :error="errorMessage"
          @submit="confirmCode"
          @resend="resendCode"
          @cancel="auth.cancelVerification()"
        />

        <LoginForm
          v-else
          key="form"
          ref="form"
          :pending="pending"
          :error="errorMessage"
          :field-errors="fieldErrors"
          @submit="signIn"
        />
      </Transition>

      <p v-if="!signedIn && !verifying" class="auth-switch">
        New to Sharlock?
        <RouterLink to="/register">Create a student account</RouterLink>
      </p>
      <p v-if="!signedIn && !verifying" class="auth-field-hint">
        Instructor? Ask your administrator for an activation link.
      </p>
    </section>
    <aside class="auth-aside">
      <PixelIcon name="lock" :size="30" aria-hidden="true" />
      <RouterLink to="/about" class="auth-aside__link">
        Meet Sharlock <PixelIcon name="arrow" :size="16" aria-hidden="true" />
      </RouterLink>
    </aside>
  </section>
</template>
