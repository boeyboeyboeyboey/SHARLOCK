<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useGameAudio } from '../../composables/useGameAudio.js'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import { listManagedCohorts, listMemberships } from '../../features/cohorts/api.js'
import { useAuthStore } from '../../features/auth/store.js'
import { isEnterKey, isInteractKey } from '../../features/hub/controls.js'
import { getDeviceCheck } from '../../features/hub/deviceCheck.js'
import { readGraphics } from '../../features/hub/graphics.js'
import ImmersiveControls from '../../features/menu/ImmersiveControls.vue'
import { useSignOut } from '../../features/menu/townControls.js'
import { cueView, deriveCues, freshEvents } from './audio/soundCues.js'
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
watch(puzzleOpen, (open) => arena?.setInputEnabled(!open))

// a clean player beside a ready station gets the Use prompt
const nearStation = computed(() =>
  state.phase === 'playing' && me.value && !me.value.infected
    ? nearestStation(me.value, state.stations, clock.value + state.offset)
    : null,
)
const showUse = computed(() => Boolean(nearStation.value) && !puzzleOpen.value && !state.blocked)
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
  if (howToOpen.value || menuOpen.value) return
  if (isInteractKey(event) || isEnterKey(event)) useStation()
}

// infected players tag by touching: the nearest clean player in reach, at a capped rate
let lastTagAt = 0
const tagTimer = setInterval(() => {
  if (state.phase !== 'playing' || state.blocked || !me.value?.infected) return
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
const touchOn = computed(() => state.phase === 'playing' && !state.blocked && !puzzleOpen.value)
const patchedUntil = ref(0)
const patched = computed(() => clock.value < patchedUntil.value)
watch(
  () => state.events.at(-1),
  (event) => {
    if (event?.type === 'patch' && event.sid === state.sid) patchedUntil.value = Date.now() + 2000
  },
)

// round music uses the shared mute; a missing track stays silent
const music = useGameAudio(() => (capable ? 'botnet-tag' : ''))
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
    arena.setInputEnabled(!puzzleOpen.value)
  } catch (error) {
    console.warn('tag arena failed to start', error)
    arena = null
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
    <div ref="arenaEl" class="tag-arena" data-testid="tag-arena" aria-hidden="true"></div>
    <ImmersiveControls
      v-model:menu-open="menuOpen"
      inline
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @sign-out="signOut"
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
          data-testid="tag-howto-open"
          @click="showHowTo"
        >
          How to play
        </button>
      </template>
    </ImmersiveControls>
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
      <PuzzleResult v-if="state.phase === 'playing'" :patched="patched" :lock-ms="lockMs" />
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
