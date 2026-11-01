<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import { listManagedCohorts, listMemberships } from '../../features/cohorts/api.js'
import { useAuthStore } from '../../features/auth/store.js'
import { isEnterKey, isInteractKey } from '../../features/hub/controls.js'
import { getDeviceCheck } from '../../features/hub/deviceCheck.js'
import { readGraphics } from '../../features/hub/graphics.js'
import ImmersiveControls from '../../features/menu/ImmersiveControls.vue'
import { useSignOut } from '../../features/menu/townControls.js'
import { cueView, deriveCues, freshEvents } from './audio/soundCues.js'
import { useRoundMusic } from './audio/useRoundMusic.js'
import { useTagSound } from './audio/useTagSound.js'
import HowToPlayScene from './components/HowToPlayScene.vue'
import NeedsThreeD from './components/NeedsThreeD.vue'
import TagHud from './components/TagHud.vue'
import TagLobby from './components/TagLobby.vue'
import TagResults from './components/TagResults.vue'
import TouchControls from './components/TouchControls.vue'
import UsePrompt from './components/UsePrompt.vue'
import PuzzlePanel from './puzzles/PuzzlePanel.vue'
import PuzzleResult from './puzzles/PuzzleResult.vue'
import { HOW_TO_PLAY } from './howToPlay.js'
import {
  TAG_GAP_MS,
  TOAST_MS,
  USE_GAP_MS,
  msUntil,
  nearestStation,
  nearestTarget,
  sprintPhase,
} from './tagRules.js'
import { useTagSocket } from './useTagSocket.js'
import './tag.css'

const router = useRouter()
const auth = useAuthStore()
const signOut = useSignOut()
const menuOpen = ref(false)
const confirmOpen = ref(false)

// the game needs webgl2; the 2d town setting does not matter
const capable = !getDeviceCheck().reasons.includes('no-webgl2')
const staff = (auth.user?.globalRoles ?? []).some((role) => ['instructor', 'admin'].includes(role))
const classes = ref([])
const cohortId = ref('')
const className = ref('')
const classesFailed = ref(false)
const standing = ref(null)

const tag = useTagSocket({
  staff,
  getCohortId: () => cohortId.value,
  // 4401: the session is gone server side, so drop it locally and show the login notice
  onSessionEnded: (reason) => {
    if (auth.status !== 'authenticated') return
    auth.invalidateSession()
    void router
      ?.replace({
        path: '/login',
        query: { reason: reason === 'replaced' ? 'elsewhere' : 'expired' },
      })
      .catch(() => {})
  },
})
const { state } = tag
const offline = computed(() => state.status === 'reconnecting')

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
const graceMs = computed(() =>
  state.phase === 'playing' && state.graceEndsAt
    ? msUntil(state.graceEndsAt, clock.value, state.offset)
    : 0,
)
const readyMs = computed(() =>
  state.you?.readyBy ? msUntil(state.you.readyBy, clock.value, state.offset) : null,
)
const nameOf = (sid) => state.players.find((player) => player.sid === sid)?.username ?? ''
// toasts come from server events only, and fade out after a few seconds
const toastEvent = computed(() => {
  const event = state.events.at(-1)
  if (!event || state.phase !== 'playing' || !['tag', 'patch'].includes(event.type)) return null
  return clock.value + state.offset - event.at > TOAST_MS ? null : event
})
const toast = computed(() => {
  const event = toastEvent.value
  if (!event) return ''
  if (event.type === 'tag') {
    if (event.from === state.sid) return `Tagged ${nameOf(event.to)}!`
    if (event.to === state.sid) return `${nameOf(event.from)} tagged you!`
    return `${nameOf(event.from)} tagged ${nameOf(event.to)}`
  }
  return `${nameOf(event.sid)} patched`
})

// closing only hides the panel: the protocol has no cancel, so the server keeps the puzzle until its deadline
const puzzle = computed(() => (state.phase === 'playing' ? (state.you?.puzzle ?? null) : null))
const puzzleKey = computed(() =>
  puzzle.value ? `${puzzle.value.stationId}:${puzzle.value.deadline}` : '',
)
const dismissed = ref('')
const puzzleMs = computed(() =>
  puzzle.value ? msUntil(puzzle.value.deadline, clock.value, state.offset) : 0,
)
const lockMs = computed(() =>
  state.you?.lockedUntil ? msUntil(state.you.lockedUntil, clock.value, state.offset) : 0,
)
const puzzleOpen = computed(
  () => Boolean(puzzle.value) && puzzleKey.value !== dismissed.value && !state.blocked,
)

// a clean player beside a ready station gets the Use prompt
const nearStation = computed(() =>
  state.phase === 'playing' && me.value && !me.value.infected
    ? nearestStation(me.value, state.stations, clock.value + state.offset)
    : null,
)
const showUse = computed(
  () => Boolean(nearStation.value) && !puzzleOpen.value && !state.blocked && !offline.value,
)
let lastUseAt = 0
function useStation() {
  if (!showUse.value || lockMs.value > 0) return
  if (puzzle.value) {
    dismissed.value = ''
    return
  }
  const t = Date.now()
  if (t - lastUseAt < USE_GAP_MS) return
  lastUseAt = t
  tag.station(nearStation.value.id)
}
function onKeydown(event) {
  if (howToOpen.value || menuOpen.value || confirmOpen.value) return
  if (isInteractKey(event) || isEnterKey(event)) useStation()
}

// infected players tag by touching: the nearest clean player in reach, at a capped rate
let lastTagAt = 0
const tagTimer = setInterval(() => {
  if (state.phase !== 'playing' || state.blocked || !me.value?.infected || graceMs.value > 0) return
  const t = Date.now()
  if (t - lastTagAt < TAG_GAP_MS) return
  const target = nearestTarget(me.value, state.players, t + state.offset)
  if (target) {
    lastTagAt = t
    tag.tag(target)
  }
}, 120)
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  clearInterval(tagTimer)
  window.removeEventListener('keydown', onKeydown)
})

// touch sprint button: the ring follows this tab's own sprint, the server keeps the real cooldown
const sprintAt = ref(0)
const sprintNow = computed(() => sprintPhase(sprintAt.value, clock.value))
function onSprint() {
  sprintAt.value = Date.now()
  sound.play('sprint')
  return tag.sprint()
}
const touchOn = computed(
  () =>
    state.phase === 'playing' &&
    Boolean(me.value) &&
    !state.blocked &&
    !offline.value &&
    !puzzleOpen.value,
)
const patchedUntil = ref(0)
const patched = computed(() => clock.value < patchedUntil.value)
watch(
  () => state.events.at(-1),
  (event) => {
    if (event?.type === 'patch' && event.sid === state.sid) patchedUntil.value = Date.now() + 2000
  },
)

// round music uses the shared mute and switches to the final track for the last 30 s; a missing track stays silent
const music = useRoundMusic(capable, () => ({ phase: state.phase, msLeft: msLeft.value }))
const sound = useTagSound()
const { open: howToOpen, show: showHowTo } = useHowToPlay('botnet-tag')
const seenEvents = new Set()
let lastView = null
watch(
  () => ({
    view: cueView({
      phase: state.phase,
      msLeft: state.phase === 'playing' ? msLeft.value : 0,
      immunityMs: immunityMs.value,
      lockMs: lockMs.value,
      selfInfected: me.value?.infected,
      sideWon: state.sideWon,
    }),
    events: state.events.length,
    last: state.events.at(-1)?.at,
  }),
  ({ view }) => {
    const events = freshEvents(state.events, seenEvents)
    for (const cue of deriveCues(lastView, view, events, state.sid)) sound.play(cue)
    lastView = view
  },
  { immediate: true },
)
function submitPuzzle(submission) {
  tag.submit(submission)
  dismissed.value = puzzleKey.value
}

const CLASS_PAGE = 50
const MAX_CLASS_PAGES = 20

// an administrator can manage many classes, so the picker walks every page
async function loadClasses() {
  classesFailed.value = false
  const found = []
  try {
    for (let page = 1; page <= MAX_CLASS_PAGES; page += 1) {
      const { cohorts = [], total = 0 } = await listManagedCohorts({ page, limit: CLASS_PAGE })
      found.push(...cohorts)
      if (cohorts.length === 0 || found.length >= total) break
    }
  } catch {
    classesFailed.value = true
  }
  classes.value = found
  // one class is no choice; with more, staff pick so nobody lands in another class's lobby
  if (found.length === 1 && !classesFailed.value) cohortId.value = found[0].cohortId
}

async function load() {
  if (staff) {
    await loadClasses()
    return
  }
  try {
    const memberships = (await listMemberships({ limit: 20 })).memberships ?? []
    // a deactivated class no longer counts, matching where the server places the student
    const inLiveClass = ({ cohortStatus, institutionStatus }) =>
      cohortStatus === 'active' && institutionStatus === 'active'
    const active = memberships.find((item) => item.status === 'active' && inLiveClass(item))
    className.value = active?.cohortName ?? ''
    standing.value =
      memberships.find((item) => item.status === 'pending' && inLiveClass(item)) ??
      memberships.findLast((item) => item.status === 'removed') ??
      null
  } catch {
    className.value = ''
  }
}

watch(cohortId, (id) => {
  className.value = classes.value.find((item) => item.cohortId === id)?.cohortName ?? ''
  if (id) tag.rejoin()
})

// the first-visit guide holds the socket back, so reading it does not spend the 45 s limit
let pageGone = false
let startAfterGuide = false
onBeforeUnmount(() => (pageGone = true))
onMounted(async () => {
  if (!capable) return
  await load()
  if (staff || pageGone) return
  if (howToOpen.value) startAfterGuide = true
  else tag.start()
})
watch(howToOpen, (open) => {
  if (open || !startAfterGuide) return
  startAfterGuide = false
  tag.start()
})

// the 3d yard exists only while a round is on screen; babylon loads the first time it is needed
const arenaEl = ref(null)
const arenaOn = computed(
  () =>
    capable &&
    !state.blocked &&
    ['countdown', 'playing', 'results'].includes(state.phase) &&
    (!staff || Boolean(cohortId.value)),
)
let arena = null
let arenaToken = 0
const inputOn = computed(
  () =>
    !puzzleOpen.value &&
    !offline.value &&
    !howToOpen.value &&
    !menuOpen.value &&
    !confirmOpen.value,
)
watch(inputOn, (on) => arena?.setInputEnabled(on))
async function mountArena() {
  const token = ++arenaToken
  if (typeof WebGL2RenderingContext === 'undefined' || !arenaEl.value) return
  try {
    const { createArena } = await import('./arena/createArena.js')
    if (token !== arenaToken || !arenaEl.value) return
    arena = createArena({
      container: arenaEl.value,
      getState: () => state,
      send: { move: tag.move, sprint: onSprint },
      quality: readGraphics(),
      wardrobe: auth.user?.wardrobe ?? null,
      params: import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams(),
    })
    arena.setInputEnabled(inputOn.value)
  } catch (error) {
    console.warn('tag arena failed to start', error)
    arena = null
    // leave the round so nobody waits on a player who cannot move
    tag.leave('arena-failed')
  }
}
function unmountArena() {
  arenaToken += 1
  sprintAt.value = 0
  arena?.dispose()
  arena = null
}
watch(
  arenaOn,
  (on) => {
    if (on) mountArena()
    else unmountArena()
  },
  { flush: 'post' },
)
onMounted(() => arenaOn.value && mountArena())
onBeforeUnmount(unmountArena)

function leave() {
  tag.leave()
  router.push('/')
}

// leaving through the page's own chrome asks first while a round is on, as the other games do
const midRound = computed(() => !state.blocked && ['countdown', 'playing'].includes(state.phase))
let pendingLeave = null
let leaveConfirmed = false
let menuLeave = false
let menuLeaveTimer = null
function markMenuNavigation() {
  menuLeave = true
  clearTimeout(menuLeaveTimer)
  menuLeaveTimer = setTimeout(() => (menuLeave = false), 1000)
}
function askLeave() {
  if (!midRound.value) {
    leave()
    return
  }
  pendingLeave = '/'
  confirmOpen.value = true
}
function cancelLeave() {
  confirmOpen.value = false
  pendingLeave = null
}
function confirmLeave() {
  confirmOpen.value = false
  leaveConfirmed = true
  tag.leave()
  router.push(pendingLeave ?? '/')
  pendingLeave = null
}
onBeforeRouteLeave((to) => {
  if (leaveConfirmed || !menuLeave || !midRound.value) return true
  menuLeave = false
  pendingLeave = to.fullPath
  confirmOpen.value = true
  return false
})
onBeforeUnmount(() => clearTimeout(menuLeaveTimer))

const blockedText = {
  superseded: 'Open in another tab',
  ended: 'Signed out',
  stopped: 'Connection closed',
  failed: 'Connection lost',
  left: 'You left the round',
  idle: 'Removed from the lobby',
  'arena-failed': 'The 3D yard could not start',
}
const blockedDetail = {
  idle: 'You did not press Ready within 45 seconds, so the others are not kept waiting.',
  'arena-failed': 'You left the round so the others can carry on. Try again or come back later.',
}
const canRetry = computed(() =>
  ['failed', 'stopped', 'idle', 'arena-failed'].includes(state.blocked),
)
const blockedTitle = computed(() => {
  if (state.blocked !== 'no-class') return blockedText[state.blocked]
  if (standing.value?.status === 'pending') {
    return `Your request for ${standing.value.cohortName} is waiting for approval`
  }
  if (standing.value?.status === 'removed')
    return `You were removed from ${standing.value.cohortName}`
  return 'Join a class first'
})
</script>

<template>
  <div class="botnet-tag-game" data-testid="botnet-tag">
    <div ref="arenaEl" class="tag-arena" data-testid="tag-arena" aria-hidden="true"></div>
    <ImmersiveControls
      v-model:menu-open="menuOpen"
      inline
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @sign-out="signOut"
      @navigate="markMenuNavigation"
    >
      <template #sound>
        <div class="immersive-sound">
          <button
            v-if="capable && !music.missing.value"
            class="sound-button"
            type="button"
            data-testid="tag-sound"
            :aria-label="music.isMuted.value ? 'Turn on game sound' : 'Mute game sound'"
            :aria-pressed="!music.isMuted.value"
            :disabled="music.starting.value"
            @click="music.toggle"
          >
            <PixelIcon :name="music.isMuted.value ? 'mute' : 'sound'" :size="20" />
          </button>
        </div>
      </template>
      <template #end>
        <button
          v-if="capable"
          type="button"
          class="glass-surface glass-button"
          aria-label="How to play"
          data-testid="tag-howto-open"
          @click="showHowTo"
        >
          <span class="tag-long">How to play</span>
          <span class="tag-short" aria-hidden="true">?</span>
        </button>
        <button
          v-if="capable && !state.blocked"
          type="button"
          class="glass-surface glass-button"
          aria-label="Leave game"
          data-testid="tag-leave-game"
          @click="askLeave"
        >
          <span class="tag-long">Leave game</span>
          <span class="tag-short" aria-hidden="true">Leave</span>
        </button>
      </template>
    </ImmersiveControls>
    <ConfirmDialog
      :open="confirmOpen"
      title="Leave the game?"
      message="An unfinished round won't be saved."
      confirm-label="Leave game"
      cancel-label="Keep playing"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
    <p v-if="offline" class="tag-reconnect tag-glass" role="status" data-testid="tag-reconnecting">
      Connection lost, reconnecting
    </p>
    <NeedsThreeD v-if="!capable" />
    <template v-else>
      <section
        v-if="state.blocked"
        class="tag-panel tag-notice"
        role="status"
        data-testid="tag-notice"
      >
        <h1>{{ blockedTitle }}</h1>
        <p v-if="blockedDetail[state.blocked]" class="tag-note">
          {{ blockedDetail[state.blocked] }}
        </p>
        <div class="tag-foot is-end">
          <RouterLink v-if="state.blocked === 'no-class'" to="/classes" class="tag-btn is-primary"
            >Your classes</RouterLink
          >
          <button
            v-else-if="canRetry"
            type="button"
            class="tag-btn is-primary"
            data-testid="tag-retry"
            @click="tag.rejoin()"
          >
            {{ state.blocked === 'idle' ? 'Rejoin' : 'Retry' }}
          </button>
          <RouterLink to="/" class="tag-btn">Back to town</RouterLink>
        </div>
      </section>
      <section v-else-if="staff && !cohortId" class="tag-panel tag-notice" data-testid="tag-staff">
        <h1>Botnet Tag</h1>
        <label v-if="classes.length" class="tag-field"
          >Class
          <select v-model="cohortId" data-testid="tag-class-select">
            <option value="" disabled>Choose a class</option>
            <option v-for="item in classes" :key="item.cohortId" :value="item.cohortId">
              {{ item.cohortName }}
            </option>
          </select>
        </label>
        <p
          v-else-if="classesFailed"
          class="tag-note"
          role="status"
          data-testid="tag-classes-failed"
        >
          Classes could not load
        </p>
        <p v-else class="tag-note" data-testid="tag-no-classes">You have no active classes</p>
        <div class="tag-foot is-end">
          <button
            v-if="classesFailed"
            type="button"
            class="tag-btn is-primary"
            data-testid="tag-classes-retry"
            @click="loadClasses"
          >
            Retry
          </button>
          <RouterLink to="/" class="tag-btn">Back to town</RouterLink>
        </div>
      </section>
      <TagLobby
        v-else-if="state.phase === 'lobby' || state.phase === 'countdown'"
        :players="state.players"
        :sid="state.sid"
        :class-name="className"
        :countdown-ms="countdownMs"
        :ready-ms="readyMs"
        :staff="staff"
        :round-lost="state.roundLost"
        :offline="offline"
        @ready="tag.ready"
      />
      <TagHud
        v-else-if="state.phase === 'playing'"
        :ms-left="msLeft"
        :infected="infectedCount"
        :total="state.players.length"
        :immunity-ms="immunityMs"
        :self-infected="Boolean(me?.infected)"
        :watching="state.watching"
        :grace-ms="graceMs"
        :toast="toast"
        :toast-key="toastEvent?.at ?? 0"
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
      <PuzzlePanel
        v-if="puzzle && !state.blocked && puzzleKey !== dismissed && state.phase === 'playing'"
        :key="puzzleKey"
        :kind="puzzle.kind"
        :data="puzzle.public"
        :ms-left="puzzleMs"
        @submit="submitPuzzle"
        @close="dismissed = puzzleKey"
      />
      <UsePrompt v-if="state.phase === 'playing' && showUse" :lock-ms="lockMs" @use="useStation" />
      <TouchControls
        v-if="touchOn"
        :sprint-phase="sprintNow"
        :sprint-at="sprintAt"
        @joystick="(x, y) => arena?.setJoystick(x, y)"
        @jump="arena?.jump()"
        @sprint="arena?.sprint()"
      />
      <PuzzleResult
        v-if="state.phase === 'playing'"
        :patched="patched"
        :lock-ms="lockMs"
        :reason="state.you?.failReason ?? ''"
        :notice="state.you?.notice ?? ''"
      />
    </template>
    <HowToPlayDialog
      v-if="capable"
      v-model:open="howToOpen"
      game-id="botnet-tag"
      v-bind="HOW_TO_PLAY"
    >
      <template #scene="scene">
        <HowToPlayScene v-if="howToOpen" :step="scene.step" :reduced-motion="scene.reducedMotion" />
      </template>
    </HowToPlayDialog>
  </div>
</template>
