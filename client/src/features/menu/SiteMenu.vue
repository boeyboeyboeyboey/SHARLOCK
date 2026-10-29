<script setup>
defineOptions({ name: 'SharlockSiteMenu' })
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { avatarFor } from '../auth/avatars.js'
import './menu.css'

const props = defineProps({
  open: { type: Boolean, default: false },
  user: { type: Object, default: null },
  logoutPending: { type: Boolean, default: false },
})
// close restores focus to the Menu button; navigate hands focus to the page that opens
const emit = defineEmits(['close', 'navigate', 'sign-out'])
const dialog = ref(null)
const closeButton = ref(null)
const roles = computed(() => props.user?.globalRoles ?? [])
const isStudent = computed(() => roles.value.includes('student'))
const isStaff = computed(() => roles.value.some((role) => ['instructor', 'admin'].includes(role)))
const isAdmin = computed(() => roles.value.includes('admin'))
const avatar = computed(() => avatarFor(props.user?.avatarId))

function sync() {
  const el = dialog.value
  if (!el) return
  if (props.open && !el.open) {
    if (typeof el.showModal === 'function') el.showModal()
    else el.setAttribute('open', '')
    nextTick(() => closeButton.value?.focus())
  } else if (!props.open && el.open) {
    if (typeof el.close === 'function') el.close()
    else el.removeAttribute('open')
  }
}
onMounted(sync)
watch(() => props.open, sync)
</script>

<template>
  <dialog
    ref="dialog"
    class="site-menu"
    data-testid="site-menu"
    aria-labelledby="site-menu-title"
    @cancel.prevent="emit('close')"
    @click.self="emit('close')"
  >
    <div class="site-menu-inner">
      <div class="menu-head">
        <img
          src="/images/sharlock-placeholder.svg"
          width="44"
          height="44"
          alt="Sharlock, the 3D-style capybara mascot wearing a monocle"
        />
        <h2 id="site-menu-title" class="menu-title">Sharlock Hub</h2>
        <button
          ref="closeButton"
          type="button"
          class="menu-close"
          data-testid="site-menu-close"
          aria-label="Close menu"
          @click="emit('close')"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div v-if="user" class="menu-user">
        <img :src="avatar.path" width="48" height="48" :alt="avatar.label" class="avatar-image" />
        <div>
          <strong>{{ user.username }}</strong>
          <small>Results are not saved</small>
        </div>
      </div>
      <nav aria-label="Site menu">
        <ul class="menu-list">
          <template v-if="user">
            <li>
              <RouterLink to="/profile" class="menu-link" @click="emit('navigate')"
                >Profile &amp; progress</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/leaderboard" class="menu-link" @click="emit('navigate')"
                >Leaderboard</RouterLink
              >
            </li>
            <li v-if="isStudent">
              <RouterLink to="/classes" class="menu-link" @click="emit('navigate')"
                >Your classes</RouterLink
              >
            </li>
          </template>
          <li>
            <RouterLink to="/settings" class="menu-link" @click="emit('navigate')"
              >Settings</RouterLink
            >
          </li>
          <li>
            <RouterLink to="/about" class="menu-link" @click="emit('navigate')"
              >About Sharlock</RouterLink
            >
          </li>
          <template v-if="user && isStaff">
            <li><hr /></li>
            <li>
              <RouterLink to="/instructor" class="menu-link" @click="emit('navigate')"
                >Class enrollment</RouterLink
              >
            </li>
            <li v-if="isAdmin">
              <RouterLink to="/admin" class="menu-link" @click="emit('navigate')"
                >Administrator workspace</RouterLink
              >
            </li>
          </template>
          <li><hr /></li>
          <template v-if="user">
            <li>
              <button
                type="button"
                class="menu-link"
                data-testid="site-menu-sign-out"
                :disabled="logoutPending"
                :aria-busy="logoutPending"
                @click="emit('sign-out')"
              >
                {{ logoutPending ? 'Signing out…' : 'Sign out' }}
              </button>
            </li>
          </template>
          <template v-else>
            <li>
              <RouterLink to="/login" class="menu-link" @click="emit('navigate')"
                >Sign in</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/register" class="menu-link" @click="emit('navigate')"
                >Create account</RouterLink
              >
            </li>
          </template>
        </ul>
      </nav>
    </div>
  </dialog>
</template>
