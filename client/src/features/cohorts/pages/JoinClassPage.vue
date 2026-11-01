<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../auth/store.js'
import JoinCohortForm from '../components/JoinCohortForm.vue'
import {
  clearClassInvitation,
  completeOnboarding,
  getEnrollment,
  joinClass,
  listMemberships,
  safeError,
} from '../api.js'
import {
  captureInvitationCodeFromLocation,
  captureInvitationCode,
  clearHeldInvitation,
  clearPendingInvitation,
  consumeAutomaticJoin,
  getInvitationJoinInput,
  prepareInvitation,
} from '../journey.js'
import '../cohorts.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const pending = ref(false)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const onboarding = ref(route.query.onboarding === '1')
const carry = ref(route.query.carry === '1' && consumeAutomaticJoin())
const hasInvitation = ref(false)
const currentClass = ref(null)
let controller = new AbortController()
let joinedAutomatically = false
let preserveHeldOnUnmount = false
const DEAD_INVITATION = new Set([
  'COHORT_CODE_UNAVAILABLE',
  'COHORT_INVALID_CODE',
  'VALIDATION_ERROR',
])

async function loadCurrentClass() {
  try {
    const result = await listMemberships({ limit: 50, signal: controller.signal })
    // a deactivated class no longer counts, matching the server's one-class check
    const holdsClass = ({ status, cohortStatus, institutionStatus }) =>
      (status === 'active' || status === 'pending') &&
      cohortStatus === 'active' &&
      institutionStatus === 'active'
    currentClass.value = (result?.memberships ?? []).find(holdsClass) ?? null
  } catch {
    currentClass.value = null
  }
}

async function handleJoinFailure(cause) {
  if (controller.signal.aborted) return
  const failure = safeError(cause)
  error.value = failure.message
  if (failure.code === 'COHORT_ALREADY_IN_CLASS') await loadCurrentClass()
}

async function dropInvitation() {
  hasInvitation.value = false
  clearHeldInvitation()
  try {
    await clearClassInvitation(controller.signal)
  } catch {
    // the form is back either way, and a code typed there replaces the held one
  }
}

async function useDifferentCode() {
  if (pending.value) return
  error.value = ''
  await dropInvitation()
}

async function initialize() {
  loading.value = true
  error.value = ''
  try {
    captureInvitationCodeFromLocation()
    const captured = await prepareInvitation({ signal: controller.signal })
    if (captured) hasInvitation.value = true
    if (auth.status !== 'authenticated') await auth.restoreSession({ force: true })
    if (auth.status === 'authenticated') {
      await loadCurrentClass()
      const enrollment = await getEnrollment(controller.signal)
      hasInvitation.value = Boolean(enrollment?.hasInvitation)
      if (route.query.carry === '1' && !carry.value) await router.replace('/join-class')
      if (carry.value && hasInvitation.value && !joinedAutomatically && !currentClass.value) {
        joinedAutomatically = true
        carry.value = false
        onboarding.value = true
        await router.replace({ path: '/join-class', query: { onboarding: '1' } })
        await sendInvitation()
      }
    }
  } catch (cause) {
    if (!controller.signal.aborted) error.value = safeError(cause).message
  } finally {
    loading.value = false
  }
}

async function sendInvitation() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await joinClass(getInvitationJoinInput(), controller.signal)
    clearHeldInvitation()
    const state = result?.membership?.status === 'active' ? 'active' : 'pending'
    await router.replace({ path: '/', query: { classRequest: state } })
  } catch (cause) {
    await handleJoinFailure(cause)
    // a code that was refused stays refused, so sending it again cannot help
    if (DEAD_INVITATION.has(safeError(cause).code)) await dropInvitation()
  } finally {
    pending.value = false
  }
}

async function submitCode(code) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    if (auth.status !== 'authenticated') {
      captureInvitationCode(code)
      await prepareInvitation({ signal: controller.signal })
      hasInvitation.value = true
      notice.value =
        'Your invitation is ready. Sign in or create a student account to send your class request.'
      return
    }
    const result = await joinClass({ code }, controller.signal)
    clearHeldInvitation()
    const state = result?.membership?.status === 'active' ? 'active' : 'pending'
    await router.replace({ path: '/', query: { classRequest: state } })
  } catch (cause) {
    await handleJoinFailure(cause)
  } finally {
    pending.value = false
  }
}

async function skipOnboarding() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    if (hasInvitation.value) await clearClassInvitation(controller.signal)
    clearHeldInvitation()
    await completeOnboarding(controller.signal)
    await router.replace('/')
  } catch (cause) {
    if (!controller.signal.aborted) error.value = safeError(cause).message
  } finally {
    pending.value = false
  }
}

async function goToAccount(path) {
  pending.value = true
  error.value = ''
  try {
    await prepareInvitation({ signal: controller.signal })
    preserveHeldOnUnmount = true
    await router.push(path)
  } catch (cause) {
    error.value = safeError(cause).message
  } finally {
    pending.value = false
  }
}

onMounted(initialize)
onBeforeUnmount(() => {
  controller.abort()
  clearPendingInvitation({ preserveHeld: preserveHeldOnUnmount })
})
</script>

<template>
  <section class="cohort-page" aria-labelledby="join-class-title">
    <h1 id="join-class-title" tabindex="-1">Join a class</h1>
    <p v-if="loading" role="status">Checking your class invitation…</p>
    <template v-else-if="auth.status !== 'authenticated'">
      <p v-if="hasInvitation" class="cohort-notice">
        Your invitation is ready. Sign in or create a student account to send your class request.
      </p>
      <div class="cohort-actions">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="pending"
          @click="goToAccount('/login')"
        >
          {{ pending ? 'Saving invitation…' : 'Sign in' }}
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="pending"
          @click="goToAccount('/register')"
        >
          Create a student account
        </button>
      </div>
      <JoinCohortForm
        v-if="!hasInvitation"
        :pending="pending"
        :error="error"
        @submit="submitCode"
      />
    </template>
    <div v-else-if="currentClass" class="cohort-notice" data-testid="already-in-class">
      <template v-if="currentClass.status === 'pending'">
        <p>You're waiting to join {{ currentClass.cohortName ?? 'a class' }}.</p>
        <p>To join another, ask your instructor to decline this request first.</p>
      </template>
      <template v-else>
        <p>You're already in {{ currentClass.cohortName ?? 'a class' }}.</p>
        <p>To join another, ask your instructor to remove you from this class first.</p>
      </template>
      <RouterLink class="btn btn-secondary" to="/classes">Your classes</RouterLink>
      <button
        v-if="onboarding"
        class="btn btn-secondary"
        type="button"
        :disabled="pending"
        @click="skipOnboarding"
      >
        {{ pending ? 'Saving…' : 'Skip and explore Sharlock' }}
      </button>
    </div>
    <template v-else>
      <p v-if="error" class="cohort-alert" role="alert">{{ error }}</p>
      <p v-if="hasInvitation" class="cohort-notice">
        Your class invitation is ready. Send a request to join.
      </p>
      <button
        v-if="hasInvitation"
        class="btn btn-primary cohort-action"
        type="button"
        :disabled="pending"
        @click="sendInvitation"
      >
        {{ pending ? 'Sending request…' : 'Send class request' }}
      </button>
      <button
        v-if="hasInvitation"
        class="btn btn-secondary cohort-action"
        type="button"
        :disabled="pending"
        @click="useDifferentCode"
      >
        Use a different code
      </button>
      <JoinCohortForm v-else :pending="pending" @submit="submitCode" />
      <div v-if="onboarding" class="cohort-skip">
        <button class="btn btn-secondary" type="button" :disabled="pending" @click="skipOnboarding">
          {{ pending ? 'Saving…' : 'Skip and explore Sharlock' }}
        </button>
      </div>
    </template>
    <p
      v-if="!loading && error && auth.status !== 'authenticated' && hasInvitation"
      class="cohort-alert"
      role="alert"
    >
      {{ error }}
    </p>
  </section>
</template>
