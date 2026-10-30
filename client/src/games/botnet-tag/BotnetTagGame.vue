<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listManagedCohorts, listMemberships } from '../../features/cohorts/api.js'
import { useAuthStore } from '../../features/auth/store.js'
import { getDeviceCheck } from '../../features/hub/deviceCheck.js'
import ImmersiveControls from '../../features/menu/ImmersiveControls.vue'
import { useSignOut } from '../../features/menu/townControls.js'
import NeedsThreeD from './components/NeedsThreeD.vue'
import TagHud from './components/TagHud.vue'
import TagLobby from './components/TagLobby.vue'
import TagResults from './components/TagResults.vue'
import { msUntil } from './tagRules.js'
import { useTagSocket } from './useTagSocket.js'
import './tag.css'

const router = useRouter()
const auth = useAuthStore()
const signOut = useSignOut()
const menuOpen = ref(false)

// the game needs webgl2; the 2d town setting does not matter
const capable = !getDeviceCheck().reasons.includes('no-webgl2')
const staff = (auth.user?.globalRoles ?? []).some((role) => ['instructor', 'admin'].includes(role))
const classes = ref([])
const cohortId = ref('')
const className = ref('')

const tag = useTagSocket({ staff, getCohortId: () => cohortId.value })
const { state } = tag

// a coarse clock drives the timers between snapshots
const clock = ref(Date.now())
const ticker = setInterval(() => (clock.value = Date.now()), 250)
onBeforeUnmount(() => clearInterval(ticker))

const countdownMs = computed(() =>
  state.phase === 'countdown' ? msUntil(state.phaseEndsAt, clock.value, state.offset) : null,
)
const msLeft = computed(() => msUntil(state.phaseEndsAt, clock.value, state.offset))
const me = computed(() => state.players.find((player) => player.sid === state.sid))
const infectedCount = computed(() => state.players.filter((player) => player.infected).length)
const immunityMs = computed(() =>
  me.value?.immuneUntil ? msUntil(me.value.immuneUntil, clock.value, state.offset) : 0,
)
const nameOf = (sid) => state.players.find((player) => player.sid === sid)?.username ?? ''
const toast = computed(() => {
  const event = state.events.at(-1)
  if (!event || state.phase !== 'playing') return ''
  if (event.type === 'tag') return `${nameOf(event.from)} tagged ${nameOf(event.to)}`
  if (event.type === 'patch') return `${nameOf(event.sid)} patched`
  return ''
})

async function load() {
  if (staff) {
    try {
      classes.value = (await listManagedCohorts({ limit: 50 })).cohorts ?? []
    } catch {
      classes.value = []
    }
    cohortId.value = classes.value[0]?.cohortId ?? ''
    return
  }
  try {
    const active = ((await listMemberships({ limit: 20 })).memberships ?? []).find(
      (item) => item.status === 'active',
    )
    className.value = active?.cohortName ?? ''
  } catch {
    className.value = ''
  }
}

watch(cohortId, (id) => {
  className.value = classes.value.find((item) => item.cohortId === id)?.cohortName ?? ''
  if (id) tag.rejoin()
})

onMounted(async () => {
  if (!capable) return
  await load()
  if (!staff) tag.start()
})

function leave() {
  tag.leave()
  router.push('/')
}

const blockedText = {
  'no-class': 'Join a class first',
  superseded: 'Open in another tab',
  ended: 'Signed out',
  stopped: 'Connection closed',
  failed: 'Connection lost',
  left: 'You left the round',
}
</script>

<template>
  <div class="botnet-tag-game" data-testid="botnet-tag">
    <div class="tag-arena" data-testid="tag-arena" aria-hidden="true"></div>
    <ImmersiveControls
      v-model:menu-open="menuOpen"
      inline
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @sign-out="signOut"
    />
    <NeedsThreeD v-if="!capable" />
    <template v-else>
      <section
        v-if="state.blocked"
        class="tag-panel tag-notice"
        role="status"
        data-testid="tag-notice"
      >
        <h1>{{ blockedText[state.blocked] }}</h1>
        <div class="tag-foot is-end">
          <RouterLink v-if="state.blocked === 'no-class'" to="/classes" class="tag-btn is-primary"
            >Your classes</RouterLink
          >
          <button
            v-else-if="state.blocked === 'failed' || state.blocked === 'stopped'"
            type="button"
            class="tag-btn is-primary"
            @click="tag.rejoin()"
          >
            Retry
          </button>
          <RouterLink to="/" class="tag-btn">Back to town</RouterLink>
        </div>
      </section>
      <section v-else-if="staff && !cohortId" class="tag-panel tag-notice" data-testid="tag-staff">
        <h1>Botnet Tag</h1>
        <label v-if="classes.length" class="tag-field"
          >Class
          <select v-model="cohortId" data-testid="tag-class-select">
            <option v-for="item in classes" :key="item.cohortId" :value="item.cohortId">
              {{ item.cohortName }}
            </option>
          </select>
        </label>
      </section>
      <TagLobby
        v-else-if="state.phase === 'lobby' || state.phase === 'countdown'"
        :players="state.players"
        :sid="state.sid"
        :class-name="className"
        :countdown-ms="countdownMs"
        @ready="tag.ready"
      />
      <TagHud
        v-else-if="state.phase === 'playing'"
        :ms-left="msLeft"
        :infected="infectedCount"
        :total="state.players.length"
        :immunity-ms="immunityMs"
        :self-infected="Boolean(me?.infected)"
        :toast="toast"
      />
      <TagResults
        v-else-if="state.phase === 'results' && state.results"
        :results="state.results"
        :sid="state.sid"
        :saved="state.saved"
        @again="tag.rejoin()"
        @leave="leave"
      />
      <p v-else class="tag-panel tag-notice" role="status" data-testid="tag-connecting">
        Connecting
      </p>
    </template>
  </div>
</template>
