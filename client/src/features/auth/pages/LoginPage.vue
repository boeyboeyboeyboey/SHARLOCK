<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PixelIcon from '../../../components/town/PixelIcon.vue'
import { useAuthStore } from '../store.js'
import LoginForm from '../components/LoginForm.vue'
import VerifyEmailPanel from '../components/VerifyEmailPanel.vue'
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
// the notice is shown from the link, so the store forgets the reason once this page is up
onMounted(() => auth.clearSessionEnd())
const introAvatar = '/images/town/capybara-mint.svg'
const expiredNotice = computed(() => route.query.reason === 'expired')
const elsewhereNotice = computed(() => route.query.reason === 'elsewhere')
// the town is simply the front door, so only another guarded page needs explaining
const guardedPageNotice = computed(
  () =>
    route.query.reason === 'required' &&
    Boolean(route.redirectedFrom) &&
    route.redirectedFrom.path !== '/',
)
const passwordResetNotice = computed(() => route.query.passwordReset === '1')
const fieldErrors = computed(() => auth.requestError?.fieldErrors || {})
const errorMessage = computed(() => auth.requestError?.message || '')
const verifying = computed(() => Boolean(auth.pendingVerification) && !signedIn.value)
// only a game's own page, so a crafted link cannot send someone elsewhere after signing in
const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' && /^\/games\/[a-z-]+(?:\?attempt=[\w-]+)?$/.test(value)
    ? value
    : null
})

async function continueAfterSignIn() {
  if (continuing.value) return
  continuing.value = true
  continuationError.value = ''
  try {
    const destination = await resolveEnrollmentDestination(auth.user, {
      signal: controller.signal,
      afterAccountAccess: true,
    })
    // a class invitation or onboarding still comes first
    const next = destination === '/' && returnTo.value ? returnTo.value : destination
    if (!controller.signal.aborted) await router.replace(next)
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

async function cancelCode() {
  if (pending.value) return
  pending.value = true
  try {
    await auth.cancelVerification()
  } catch {
    // the store keeps only the safe message for the code screen
  } finally {
    pending.value = false
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
        You were signed out because your account signed in somewhere else. If that wasn't you, ask
        your instructor or school administrator to send you a password reset link.
      </p>

      <p v-if="expiredNotice" class="auth-field-hint" role="status">
        Your session has ended. Sign in again to continue. Your unfinished action was not repeated.
      </p>

      <p v-if="guardedPageNotice" class="auth-field-hint" role="status">
        Sign in to open that page.
      </p>

      <!-- the signed-in view stays outside the transition: signing in navigates away at once, and
           an out-in transition holding a not-yet-mounted view crashes when its page is unmounted -->
      <div v-if="signedIn" aria-live="polite">
        <p>You are signed in.</p>
        <p v-if="continuationError" role="alert">{{ continuationError }}</p>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="pending || continuing"
          @click="continueAfterSignIn"
        >
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
          @cancel="cancelCode"
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

      <p v-if="!signedIn && !verifying" class="auth-field-hint">
        Forgot your password? Ask your instructor or school administrator to send you a reset link.
      </p>
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
        What is Sharlock? <PixelIcon name="arrow" :size="16" aria-hidden="true" />
      </RouterLink>
    </aside>
  </section>
</template>
