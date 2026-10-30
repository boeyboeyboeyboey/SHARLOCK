<script setup>
defineOptions({ name: 'SharlockSiteMenu' })
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { avatarFor } from '../auth/avatars.js'
import { gameCatalog } from '../../data/gameCatalog.js'
import { useTownControls } from './townControls.js'
import { useDiscoveries } from '../hub/discoveries.js'
import { usePresenceRoster } from '../hub/presence/roster.js'
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
const isInstructor = computed(() => roles.value.includes('instructor'))
const isAdmin = computed(() => roles.value.includes('admin'))
const avatar = computed(() => avatarFor(props.user?.avatarId))
const discoveries = useDiscoveries()
const { state: presence, count: onlineCount } = usePresenceRoster()
const onlineOpen = ref(false)
// the 2d town registers its jump function; other pages offer no Places
const controls = useTownControls()
const jumpTo = computed(() => controls?.jumpTo?.value ?? null)
async function goTo(id) {
  const jump = jumpTo.value
  emit('navigate')
  // let the menu close before the card takes focus
  await nextTick()
  jump?.(id)
}

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
      <RouterLink
        to="/discoveries"
        class="menu-count menu-count-link"
        data-testid="menu-discoveries"
        @click="emit('navigate')"
      >
        Discoveries <strong>{{ discoveries.count.value }}/{{ discoveries.total }}</strong>
      </RouterLink>
      <p v-if="presence.superseded" class="menu-count" data-testid="menu-online-elsewhere">
        Open in another tab
      </p>
      <div v-else-if="presence.active" class="menu-online" data-testid="menu-online">
        <label v-if="presence.staff && presence.classes.length" class="menu-online-class">
          Class
          <select v-model="presence.selectedCohortId" data-testid="menu-online-class">
            <option v-for="c in presence.classes" :key="c.cohortId" :value="c.cohortId">
              {{ c.cohortName }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="menu-online-toggle"
          data-testid="menu-online-toggle"
          aria-controls="menu-online-list"
          :aria-expanded="String(onlineOpen)"
          @click="onlineOpen = !onlineOpen"
        >
          Online in your class: <strong data-testid="menu-online-count">{{ onlineCount }}</strong>
        </button>
        <ul v-show="onlineOpen" id="menu-online-list" class="menu-online-list" data-testid="menu-online-list">
          <li v-for="peer in presence.peers" :key="peer.sid">
            {{ peer.username }}<small v-if="peer.staff"> (staff)</small>
          </li>
        </ul>
      </div>
      <nav v-if="jumpTo" aria-label="Places" data-testid="menu-places">
        <h3 class="menu-section">Places</h3>
        <ul class="menu-list">
          <li v-for="game in gameCatalog" :key="game.id">
            <button type="button" class="menu-link" @click="goTo(game.id)">
              {{ game.name }}
            </button>
          </li>
        </ul>
      </nav>
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
          <li v-if="user && (isInstructor || isAdmin)"><hr /></li>
          <template v-if="user">
            <li v-if="isInstructor || isAdmin">
              <RouterLink to="/instructor" class="menu-link" @click="emit('navigate')"
                >Instructor desk</RouterLink
              >
            </li>
            <li v-if="isAdmin">
              <RouterLink to="/admin" class="menu-link" @click="emit('navigate')"
                >Admin</RouterLink
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
