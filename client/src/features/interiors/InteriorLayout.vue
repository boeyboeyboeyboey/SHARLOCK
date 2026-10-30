<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useGameAudio } from '../../composables/useGameAudio.js'
import { useAuthStore } from '../auth/store.js'
import { getDeviceCheck } from '../hub/deviceCheck.js'
import { readGraphics } from '../hub/graphics.js'
import { createSampler, decidePerf, realSamplingOff } from '../hub/perfWatch.js'
import { getTier } from '../hub/scenes/shared/quality.js'
import ImmersiveControls from '../menu/ImmersiveControls.vue'
import { useSignOut, useTownControls } from '../menu/townControls.js'
import { readStoredMode, resolveMode } from '../legacy-town/useTownMode.js'
import { heroActive } from './heroRect.js'
import { decideRender, fallbackGradient, stillUrl } from './renderMode.js'
import { roomFor } from './rooms/index.js'
import { createInterior } from './useInteriorEngine.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const signOut = useSignOut()
const roomId = computed(() => String(route.meta.interior ?? ''))
const room = computed(() => roomFor(roomId.value))

// the room's theme is the only music on a game route
const { isMuted, starting, toggle, missing } = useGameAudio(() => roomId.value)
const controls = useTownControls()
const unregisterSound = controls?.sound.register(
  reactive({ muted: isMuted, busy: computed(() => starting.value || missing.value), toggle }),
)
onBeforeUnmount(() => unregisterSound?.())

const device = getDeviceCheck()
const stored = readStoredMode()
const failed = ref(false)
const slow = ref(false)
const stillMissing = ref(false)
const canvas = ref(null)
const tier = getTier(new URLSearchParams(window.location.search), readGraphics())
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const resolved = computed(() => resolveMode({ stored, device, failed: failed.value }))
// the switch in the game chrome overrides the stored choice for this visit only
const override = ref(null)
const townMode = computed(() =>
  resolved.value.locked ? '2d' : (override.value ?? resolved.value.mode),
)
function toggleMode() {
  const next = townMode.value === '3d' ? '2d' : '3d'
  override.value = next
  if (next === '3d') slow.value = false
}
const renderMode = computed(() =>
  room.value
    ? decideRender({
        townMode: townMode.value,
        tierName: tier.name,
        reducedMotion: reducedQuery.matches,
        failed: failed.value,
        slow: slow.value,
      })
    : 'still',
)
const gradient = computed(() => fallbackGradient(room.value?.palette))
const stage = computed(() => (renderMode.value === 'still' ? 'still' : '3d'))

// a hero room seats the desk panel on its prop; narrow screens and the still keep the centred desk
const wideQuery = window.matchMedia('(min-width: 768px)')
const wide = ref(wideQuery.matches)
const syncWide = () => (wide.value = wideQuery.matches)
wideQuery.addEventListener?.('change', syncWide)
onBeforeUnmount(() => wideQuery.removeEventListener?.('change', syncWide))
const heroRect = ref(null)
const heroOn = computed(() =>
  heroActive({ hero: room.value?.hero, stage: stage.value, wide: wide.value }),
)
const deskStyle = computed(() => {
  if (!heroOn.value) return null
  const r = heroRect.value
  if (!r) return { visibility: 'hidden' }
  return {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    '--shell-chrome': `calc(100dvh - ${r.height}px + 2rem)`,
  }
})

let interior = null
const manualWatch = realSamplingOff()
let sampler = null

function stop() {
  interior?.dispose()
  interior = null
  heroRect.value = null
}

async function start() {
  stop()
  stillMissing.value = false
  if (renderMode.value === 'still') return
  await nextTick()
  if (!canvas.value || renderMode.value === 'still') return
  if (!manualWatch) {
    sampler = createSampler({
      onResult: (fps) => {
        if (
          decidePerf({ tier: tier.name, fps, explicit3d: stored === '3d' }).action === 'switch-2d'
        )
          slow.value = true
      },
    })
  }
  interior = createInterior({
    canvas: canvas.value,
    roomId: roomId.value,
    tier,
    renderMode: renderMode.value,
    onFailed: () => (failed.value = true),
    onHero: room.value?.hero ? (rect) => (heroRect.value = rect) : null,
    onPerf: (ms) => sampler?.frame(ms, !document.hidden),
  })
}

onMounted(start)
watch([roomId, renderMode], start)
onBeforeUnmount(stop)

// leaving through our own chrome (Exit game, the site menu) asks first; the games' own links do not
const menuOpen = ref(false)
const confirmOpen = ref(false)
let pending = null
let chromeLeave = false
let leaveConfirmed = false
let chromeTimer = null

function markMenuNavigation() {
  chromeLeave = true
  clearTimeout(chromeTimer)
  chromeTimer = setTimeout(() => (chromeLeave = false), 1000)
}
function askExit() {
  pending = '/'
  confirmOpen.value = true
}
function cancelLeave() {
  confirmOpen.value = false
  pending = null
}
function confirmLeave() {
  confirmOpen.value = false
  leaveConfirmed = true
  const target = pending ?? '/'
  pending = null
  router.push(target)
}
onBeforeRouteLeave((to) => {
  if (leaveConfirmed || !chromeLeave) return true
  chromeLeave = false
  pending = to.fullPath
  confirmOpen.value = true
  return false
})
onBeforeUnmount(() => clearTimeout(chromeTimer))
</script>

<template>
  <div
    class="interior"
    :data-room="roomId"
    :data-stage="stage"
    :data-tier="tier.name"
    :data-hero="heroOn ? 'on' : null"
    data-testid="interior"
  >
    <div class="interior-stage" aria-hidden="true">
      <canvas
        v-if="stage === '3d'"
        :key="roomId"
        ref="canvas"
        class="interior-canvas"
        data-testid="interior-canvas"
      ></canvas>
      <template v-else>
        <div
          class="interior-fallback"
          :style="{ background: gradient }"
          data-testid="interior-fallback"
        ></div>
        <img
          v-if="roomId && !stillMissing"
          class="interior-still"
          :src="stillUrl(roomId)"
          alt=""
          data-testid="interior-still"
          @error="stillMissing = true"
        />
      </template>
    </div>
    <ImmersiveControls
      v-model:menu-open="menuOpen"
      :mode="townMode"
      :locked="resolved.locked"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      label3d="3D room"
      label2d="2D still"
      escape-ignore-within=".interior-desk"
      @toggle-mode="toggleMode"
      @navigate="markMenuNavigation"
      @sign-out="signOut"
    >
      <template #sound>
        <div class="immersive-sound">
          <button
            v-if="!missing"
            class="sound-button interior-sound"
            type="button"
            data-testid="interior-sound"
            :aria-label="isMuted ? 'Turn on game sound' : 'Mute game sound'"
            :aria-pressed="!isMuted"
            :disabled="starting"
            @click="toggle"
          >
            <PixelIcon :name="isMuted ? 'mute' : 'sound'" :size="20" />
          </button>
        </div>
      </template>
      <template #end>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="exit-game"
          @click="askExit"
        >
          Exit game
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
    <div
      class="interior-desk"
      :class="{ 'is-hero': heroOn }"
      :style="deskStyle"
      data-testid="interior-desk"
    >
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
/* the layout cancels the workspace padding and the desk repeats it, so a game that bleeds by the
   workspace gutter (a negative margin) lines up with the desk's inner edge without any clipping.
   --gutter, --pt and --pb mirror .portal-main's padding at each breakpoint */
.interior {
  --gutter: 1.15rem;
  --pt: 1.6rem;
  --pb: 3rem;
  --room-gap: clamp(24px, 3vw, 48px);
  /* the room shrinks vertically on short windows so fitted games keep their height */
  --room-gap-y: clamp(0px, calc((100dvh - 760px) / 4), var(--room-gap));
  --room-wood: #3b2a1d;
  /* the floating Menu and Exit controls take this strip above the desk */
  --top-band: 60px;
  position: relative;
  min-height: 100dvh;
  isolation: isolate;
  margin: calc(-1 * var(--pt)) calc(-1 * var(--gutter)) calc(-1 * var(--pb));
}

@media (min-width: 576px) {
  .interior {
    --gutter: 2rem;
    --pt: 2rem;
  }
}

@media (min-width: 768px) {
  .interior {
    --gutter: 1.8rem;
    --pt: 2.2rem;
  }
}

@media (min-width: 992px) {
  .interior {
    --gutter: 2.8rem;
    --pt: 2.5rem;
  }
}

@media (min-width: 1200px) {
  .interior {
    --gutter: 3.5rem;
  }
}

/* the same pages the shell trims on laptop-height windows */
@media (min-width: 768px) and (min-height: 600px) {
  .interior:has(.case-preview, .is-fitted, .auth-page, .profile-view, .cohort-page) {
    --pt: 0.75rem;
    --pb: 1rem;
  }
}

.interior-stage {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: #14100d;
  pointer-events: none;
}

.interior-canvas,
.interior-still,
.interior-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.interior-still {
  object-fit: cover;
}

.interior[data-tier='desktop'] .interior-canvas,
.interior[data-tier='compact'] .interior-canvas,
.interior-still {
  filter: blur(1.5px);
  transform: scale(1.03);
}

.interior-desk {
  position: relative;
  background: var(--bg-primary);
  /* the frame is a ring outside the box, so the desk's own box is exactly the game's container */
  box-shadow:
    0 0 0 3px var(--room-wood),
    0 10px 40px rgb(0 0 0 / 0.45);
  min-width: 0;
  padding: var(--pt) var(--gutter) var(--pb);
}

/* a hero room sits the panel on its prop: the prop frame is the border, the room stays sharp around it */
.interior[data-hero='on'] .interior-canvas {
  filter: none;
  transform: none;
}

.interior-desk.is-hero {
  --gutter: 1.25rem;
  --pt: 1rem;
  --pb: 1rem;
  position: absolute;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 0.4),
    inset 0 0 22px rgb(0 0 0 / 0.28);
}

/* phones: the room is a header band above the game panel */
@media (max-width: 767.98px) {
  .interior-stage {
    position: relative;
    height: 150px;
  }

  .interior-desk {
    box-shadow: 0 -3px 0 var(--room-wood);
  }
}

@media (min-width: 768px) {
  .interior {
    padding: var(--top-band) 0 var(--room-gap-y);
  }

  .interior-desk {
    margin-inline: var(--room-gap);
  }
}

/* fitted games measure the window minus the shell, so the room gap comes off that too; on windows under 700px high the room gap and frame go and the game gets the old size */
@media (min-width: 768px) and (min-height: 600px) {
  .interior-desk {
    --shell-chrome: calc(var(--top-band) + var(--room-gap-y) + 28px);
  }
}

@media (min-width: 768px) and (min-height: 600px) and (max-height: 699.98px) {
  .interior-desk {
    margin-inline: 0;
    box-shadow: none;
  }
}

/* a game screen has no navbar, sidebar or footer: the shell gives their space back */
:global(.portal-shell.is-immersive:has(.interior)) {
  --header-height: 0px;
}
:global(.portal-shell.is-immersive:has(.interior) .portal-workspace) {
  margin-left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .interior-canvas,
  .interior-still {
    transform: none;
  }
}
</style>
