<script setup>
defineOptions({ name: 'SharlockProfile' })
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PixelIcon from '../../components/town/PixelIcon.vue'
import TrophyCase from '../../components/portal/TrophyCase.vue'
import SessionNotice from '../auth/components/SessionNotice.vue'
import { avatarFor } from '../auth/avatars.js'
import { useAuthStore } from '../auth/store.js'
import WardrobePicker from './components/WardrobePicker.vue'
import ProfileEditor from './components/ProfileEditor.vue'
import { getOwnProfile, safeError, updateOwnProfile } from './api.js'
import './profile.css'

const route = useRoute()
const auth = useAuthStore()
const shownUsername = computed(() => profile.value?.username || auth.user?.username || '')
const shownAvatarId = computed(() => profile.value?.avatarId || auth.user?.avatarId)
const avatar = computed(() => avatarFor(shownAvatarId.value))
const errorMessage = computed(() => auth.requestError?.message || 'Unable to check your account.')
const profile = ref(null)
const profileLoading = ref(false)
const profileError = ref(null)
const editing = ref(false)
const saving = ref(false)
const saveError = ref(null)
const saveNotice = ref('')
const refreshError = ref(false)
const saveSessionExpired = ref(false)
const retainedDraft = ref(null)
const editButton = ref(null)
let profileRequest = null
let profileGeneration = 0

watch([() => route.path, () => auth.status, () => auth.user?.id], () => loadProfile(), {
  immediate: true,
})

onBeforeUnmount(() => {
  profileGeneration += 1
  profileRequest?.abort()
})

async function loadProfile() {
  const generation = ++profileGeneration
  profileRequest?.abort()
  if (route.path !== '/profile' || auth.status !== 'authenticated' || !auth.user?.id) {
    profileLoading.value = false
    if (route.path !== '/profile') {
      editing.value = false
      profile.value = null
      profileError.value = null
      retainedDraft.value = null
    }
    return
  }

  const controller = new AbortController()
  profileRequest = controller
  profileLoading.value = true
  profileError.value = null
  try {
    const loaded = await getOwnProfile({ signal: controller.signal })
    if (generation !== profileGeneration) return
    profile.value = loaded
  } catch (error) {
    if (generation !== profileGeneration || controller.signal.aborted) return
    profileError.value = safeError(error)
  } finally {
    if (generation === profileGeneration) profileLoading.value = false
    if (profileRequest === controller) profileRequest = null
  }
}

async function focusEditButton() {
  await nextTick()
  editButton.value?.focus()
}

function startEditing() {
  if (!profile.value) return
  editing.value = true
  saveError.value = null
  saveNotice.value = ''
  refreshError.value = false
  saveSessionExpired.value = false
}

async function cancelEditing() {
  editing.value = false
  retainedDraft.value = null
  saveError.value = null
  saveNotice.value = ''
  saveSessionExpired.value = false
  await focusEditButton()
}

async function saveProfile(draft) {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  saveNotice.value = ''
  refreshError.value = false
  saveSessionExpired.value = false
  try {
    const saved = await updateOwnProfile(draft)
    profile.value = saved
    retainedDraft.value = null
    editing.value = false
    saveNotice.value = 'Profile saved.'
    try {
      const refreshedUser = await auth.restoreSession({ force: true })
      if (refreshedUser?.username && refreshedUser?.avatarId) {
        profile.value = { username: refreshedUser.username, avatarId: refreshedUser.avatarId }
      } else {
        refreshError.value = true
        saveSessionExpired.value = true
      }
    } catch {
      refreshError.value = true
    }
    await focusEditButton()
  } catch (error) {
    saveError.value = safeError(error)
    if (saveError.value.status === 401) {
      try {
        await auth.restoreSession({ force: true })
      } catch {
        // keep the local draft available while the account check is unavailable
      }
    }
  } finally {
    saving.value = false
  }
}

async function retryIdentityRefresh() {
  try {
    const refreshedUser = await auth.restoreSession({ force: true })
    if (refreshedUser?.username && refreshedUser?.avatarId) {
      profile.value = { username: refreshedUser.username, avatarId: refreshedUser.avatarId }
      refreshError.value = false
      saveSessionExpired.value = false
    } else {
      refreshError.value = true
      saveSessionExpired.value = true
    }
  } catch {
    refreshError.value = true
  }
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
  <div class="profile-view">
    <p class="eyebrow">YOUR DETECTIVE DESK</p>
    <h1 tabindex="-1">A curious mind looks good on you.</h1>
    <p class="page-description">Your account, your capybara companion and your next discoveries.</p>

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
          <h2>{{ shownUsername }}</h2>
          <p>{{ auth.user.email }}</p>
        </div>
        <RouterLink to="/" class="btn btn-secondary">
          Town map <PixelIcon name="arrow" :size="18" aria-hidden="true" />
        </RouterLink>
        <button
          ref="editButton"
          class="btn btn-primary profile-edit-button"
          type="button"
          :disabled="profileLoading || !profile"
          @click="startEditing"
        >
          Edit profile
        </button>
      </section>
      <p v-if="profileLoading" role="status">Loading your profile…</p>
      <div v-if="profileError" class="preview-notice" role="alert">
        <p>{{ profileError.message }}</p>
        <button class="btn btn-secondary" type="button" @click="loadProfile">Try again</button>
      </div>
      <ProfileEditor
        v-if="editing && profile"
        :profile="profile"
        :draft="retainedDraft"
        :pending="saving"
        :error="saveError"
        @draft-change="retainedDraft = $event"
        @save="saveProfile"
        @cancel="cancelEditing"
      />
      <p v-if="saveNotice" class="preview-notice" role="status">{{ saveNotice }}</p>
      <div v-if="refreshError" class="preview-notice profile-refresh-error" role="alert">
        <p>Your profile was saved, but the account display could not refresh.</p>
        <button class="btn btn-secondary" type="button" @click="retryIdentityRefresh">
          Refresh account display
        </button>
      </div>
      <WardrobePicker />
      <p class="preview-notice">
        Your account and avatar are saved. Saved activity results, points and badges are on your
        learning progress page.
      </p>
      <TrophyCase />
    </template>

    <section v-else-if="auth.status === 'anonymous'" class="profile-overview" aria-label="Sign in">
      <div>
        <h2>Make this desk your own.</h2>
        <p>Sign in or create an account to see your profile and enter Sharlock Town.</p>
        <p v-if="saveSessionExpired" role="status">
          Your profile was saved, but your session ended. Sign in again to see the changes.
        </p>
        <p v-if="retainedDraft" role="status">
          Your unsaved changes are still here for now. If you leave this page to sign in, you will
          need to re-enter them.
        </p>
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
