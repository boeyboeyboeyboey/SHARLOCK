<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import PixelIcon from '../../../components/town/PixelIcon.vue'
import { useAuthStore } from '../store.js'
import RegisterForm from '../components/RegisterForm.vue'
import VerifyEmailPanel from '../components/VerifyEmailPanel.vue'
import AuthSteps from '../components/AuthSteps.vue'
import { resolveEnrollmentDestination } from '../../cohorts/journey.js'
import '../auth.css'

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
const fieldErrors = computed(() => auth.requestError?.fieldErrors || {})
const errorMessage = computed(() => auth.requestError?.message || '')
const verifying = computed(() => Boolean(auth.pendingVerification) && !signedIn.value)
const step = computed(() => (signedIn.value ? 3 : verifying.value ? 2 : 1))

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
      continuationError.value = 'Your account is ready. Class setup is unavailable. Try Continue again.'
    }
  } finally {
    continuing.value = false
  }
}

async function createAccount(payload) {
  if (pending.value) return
  pending.value = true
  try {
    // registration ends in the code screen; the account only signs in once the code is confirmed
    await auth.register(payload)
    form.value?.clearSecrets()
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
</script>

<template>
  <section class="auth-page auth-page--register" aria-labelledby="register-title">
    <div class="auth-page__art" aria-hidden="true">
      <img :src="introAvatar" width="180" height="135" alt="" />
      <span class="auth-page__spark"><PixelIcon name="star" :size="24" /></span>
    </div>
    <section class="auth-card">
      <AuthSteps :current="step" />
      <p class="auth-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
      <h1 id="register-title" tabindex="-1">
        {{ verifying ? 'Check your email' : 'Create a student account' }}
      </h1>
      <p v-if="!verifying" class="auth-intro">
        Choose a name and capybara portrait for your detective desk.
      </p>

      <!-- the signed-in view stays outside the transition: signing in navigates away at once, and
           an out-in transition holding a not-yet-mounted view crashes when its page is unmounted -->
      <div v-if="signedIn" aria-live="polite">
        <p>Your account is ready and you are signed in.</p>
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

        <RegisterForm
          v-else
          key="form"
          ref="form"
          :pending="pending"
          :error="errorMessage"
          :field-errors="fieldErrors"
          @submit="createAccount"
        />
      </Transition>

      <p v-if="!signedIn && !verifying" class="auth-switch">
        Already have an account?
        <RouterLink to="/login">Sign in</RouterLink>
      </p>
    </section>
    <aside class="auth-aside">
      <PixelIcon name="shield" :size="30" aria-hidden="true" />
      <h2>Start with your own detective</h2>
      <p>Registration signs you in automatically. Join a class or skip ahead to personal play. Some activities already save results to your learning progress.</p>
      <RouterLink to="/about" class="auth-aside__link">
        About Sharlock <PixelIcon name="arrow" :size="16" aria-hidden="true" />
      </RouterLink>
    </aside>
  </section>
</template>
