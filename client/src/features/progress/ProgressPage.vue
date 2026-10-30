<script setup>
defineOptions({ name: 'SharlockProgress' })
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import TrophyCase from '../../components/portal/TrophyCase.vue'
import SessionNotice from '../auth/components/SessionNotice.vue'
import { avatarFor } from '../auth/avatars.js'
import { useAuthStore } from '../auth/store.js'
import { getProgress, listAttempts, progressErrorMessage } from './api.js'
import AttemptHistory from './components/AttemptHistory.vue'
import ProgressSummary from './components/ProgressSummary.vue'
import './progress.css'

// embedded: shown inside the profile overlay, which has its own way back to town
defineProps({ embedded: { type: Boolean, default: false } })
const auth = useAuthStore()
const errorMessage = computed(() => auth.requestError?.message || 'Unable to check your account.')
const avatar = computed(() => avatarFor(auth.user?.avatarId))

const progress = ref(null)
const loading = ref(false)
const loadError = ref('')
const attempts = ref([])
const attemptPage = ref(1)
const attemptTotal = ref(0)
const attemptsLoading = ref(false)
const attemptsError = ref('')
const gameFilter = ref('')
let progressRequest = null
let attemptsRequest = null
let generation = 0

// trophy case expects id and icon, the api sends key
const badges = computed(() =>
  (progress.value?.achievements || []).map((item) => ({
    id: item.key,
    name: item.name,
    description: item.description,
    earnedAt: item.earnedAt,
    icon: 'trophy',
  })),
)
// catalogue entries the player has not earned yet
const lockedBadges = computed(() => {
  const earned = new Set((progress.value?.achievements || []).map((item) => item.key))
  return (progress.value?.catalogue || [])
    .filter((item) => !earned.has(item.key))
    .map((item) => ({ id: item.key, name: item.name, description: item.description }))
})
const hasCompleted = computed(() =>
  (progress.value?.games || []).some((entry) => entry.completedCount > 0),
)

watch(
  () => [auth.status, auth.user?.id],
  () => loadProgress(),
  { immediate: true },
)

onBeforeUnmount(() => {
  generation += 1
  progressRequest?.abort()
  attemptsRequest?.abort()
})

async function loadProgress() {
  const current = ++generation
  progressRequest?.abort()
  attemptsRequest?.abort()
  progress.value = null
  attempts.value = []
  loadError.value = ''
  if (auth.status !== 'authenticated' || !auth.user?.id) {
    loading.value = false
    return
  }
  const controller = new AbortController()
  progressRequest = controller
  loading.value = true
  try {
    const loaded = await getProgress({ signal: controller.signal })
    if (current !== generation) return
    progress.value = loaded
    attemptPage.value = 1
    gameFilter.value = ''
    if (loaded.games.some((entry) => entry.completedCount > 0)) await loadAttempts(1)
  } catch (error) {
    if (current !== generation || controller.signal.aborted) return
    loadError.value = progressErrorMessage(error)
  } finally {
    if (current === generation) loading.value = false
  }
}

async function loadAttempts(page) {
  const current = generation
  attemptsRequest?.abort()
  const controller = new AbortController()
  attemptsRequest = controller
  attemptsLoading.value = true
  attemptsError.value = ''
  try {
    const result = await listAttempts({
      gameId: gameFilter.value,
      page,
      signal: controller.signal,
    })
    if (current !== generation || controller.signal.aborted) return
    attempts.value = result.attempts
    attemptPage.value = result.page
    attemptTotal.value = result.total
  } catch (error) {
    if (current !== generation || controller.signal.aborted) return
    attemptsError.value = progressErrorMessage(error)
  } finally {
    if (attemptsRequest === controller) attemptsLoading.value = false
  }
}

function changeGame(gameId) {
  gameFilter.value = gameId
  loadAttempts(1)
}

async function retrySession() {
  try {
    await auth.restoreSession({ force: true })
  } catch {
    // the auth store retains safe connection feedback for retry
  }
}
</script>

<template>
  <div class="profile-view progress-view">
    <h1 tabindex="-1">Your learning progress.</h1>

    <template v-if="auth.status === 'authenticated' && auth.user">
      <section class="profile-overview" aria-label="Your profile">
        <div class="large-avatar">
          <img
            :src="avatar.path"
            class="avatar-image"
            width="144"
            height="144"
            :alt="avatar.label"
          />
        </div>
        <div>
          <span class="title-pill">YOUR ACCOUNT</span>
          <h2>{{ auth.user.username }}</h2>
        </div>
        <RouterLink v-if="!embedded" to="/" class="btn btn-secondary">
          Town map <PixelIcon name="arrow" :size="18" aria-hidden="true" />
        </RouterLink>
      </section>

      <p v-if="loading" role="status">Loading your progress…</p>
      <div v-else-if="loadError" class="preview-notice" role="alert">
        <p>{{ loadError }}</p>
        <button class="btn btn-secondary" type="button" @click="loadProgress">Try again</button>
      </div>
      <template v-else-if="progress">
        <p v-if="!hasCompleted" class="preview-notice">
          No results yet. Finish an activity to see points and badges here.
        </p>
        <ProgressSummary
          :games="progress.games"
          :total-points="progress.totalPoints"
          :max-points="progress.maxPoints"
          :topic-outcomes="progress.topicOutcomes"
        />
        <TrophyCase :achievements="badges" :locked="lockedBadges" />
        <div v-if="attemptsError" class="preview-notice" role="alert">
          <p>{{ attemptsError }}</p>
          <button class="btn btn-secondary" type="button" @click="loadAttempts(attemptPage)">
            Try again
          </button>
        </div>
        <AttemptHistory
          v-if="hasCompleted"
          :attempts="attempts"
          :page="attemptPage"
          :total="attemptTotal"
          :loading="attemptsLoading"
          :game-id="gameFilter"
          :game-options="progress.savingGameIds"
          @change-page="loadAttempts"
          @change-game="changeGame"
        />
      </template>
    </template>

    <section v-else-if="auth.status === 'anonymous'" class="profile-overview" aria-label="Sign in">
      <div>
        <h2>Sign in to see your progress.</h2>
        <div class="d-flex flex-wrap gap-3">
          <RouterLink to="/login" class="btn btn-primary">Sign in</RouterLink>
          <RouterLink to="/register" class="btn btn-secondary">Create account</RouterLink>
        </div>
      </div>
    </section>
    <p v-else-if="auth.status === 'loading'" role="status">Checking your account…</p>
    <SessionNotice v-else :message="errorMessage" @retry="retrySession">
      <RouterLink to="/login">Sign in</RouterLink>
      <span> or </span>
      <RouterLink to="/register">Create account</RouterLink>
    </SessionNotice>
  </div>
</template>

<style scoped>
.avatar-image {
  image-rendering: pixelated;
}
</style>
