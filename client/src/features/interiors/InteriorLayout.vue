<script setup>
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useGameAudio } from '../../composables/useGameAudio.js'
import { useAuthStore } from '../auth/store.js'
import ImmersiveControls from '../menu/ImmersiveControls.vue'
import { useSignOut } from '../menu/townControls.js'
import { fallbackGradient, stillUrl } from './renderMode.js'
import { roomFor } from './rooms/palettes.js'
import { INTERIOR_LEAVE } from './useInteriorLeave.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const signOut = useSignOut()
const roomId = computed(() => String(route.meta.interior ?? ''))
const room = computed(() => roomFor(roomId.value))

// the room's theme is the only music on a game route
const { isMuted, starting, toggle, missing } = useGameAudio(() => roomId.value)

const stillMissing = ref(false)
watch(roomId, () => (stillMissing.value = false))
const gradient = computed(() => fallbackGradient(room.value?.palette))

// leaving through our own chrome (Exit game, the site menu) asks first; the games' own links do not
const menuOpen = ref(false)
const confirmOpen = ref(false)
let pending = null
let chromeLeave = false
let leaveConfirmed = false
let chromeTimer = null

// a timed game can register here to hold its clock while the leave dialog is open
const leaveHooks = new Set()
provide(INTERIOR_LEAVE, (hooks) => {
  leaveHooks.add(hooks)
  return () => leaveHooks.delete(hooks)
})
watch(confirmOpen, (open) => {
  // a confirmed leave unmounts the game, so its clock stays held
  if (!open && leaveConfirmed) return
  for (const hooks of leaveHooks) (open ? hooks.onOpen : hooks.onClose)?.()
})

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
  <div class="interior" :data-room="roomId" data-testid="interior">
    <div class="interior-stage" aria-hidden="true">
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
    </div>
    <ImmersiveControls
      v-model:menu-open="menuOpen"
      :show-mode="false"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      escape-ignore-within=".interior-desk"
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
            aria-label="Game sound"
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
    <div class="interior-desk" data-testid="interior-desk">
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

/* fitted games, which the shell also trims on laptop-height windows */
@media (min-width: 768px) and (min-height: 600px) {
  .interior:has(.is-fitted) {
    --pt: 0.75rem;
    --pb: 1rem;
  }
}

/* short landscape: every row counts, so the desk gives up most of its top padding */
@media (max-height: 500px) {
  .interior {
    --desk-pt: 0.5rem;
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
  padding: var(--desk-pt, var(--pt)) var(--gutter) var(--pb);
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

/* small phones: only the strip the floating Menu and Exit controls need, so the game starts above the fold */
@media (max-width: 575.98px) {
  .interior-stage {
    height: var(--top-band);
  }
}

/* phones and short landscape: the controls are a solid top bar that owns its height, so the game starts below it */
@media (max-width: 575.98px), (max-height: 500px) {
  /* games that size themselves to the screen minus the header must also leave the bar */
  .interior {
    --top-band: 64px;
    --header-height: var(--top-band);
  }

  .interior-stage {
    height: var(--top-band);
  }

  .interior .immersive-controls {
    inset: 0 0 auto;
    height: var(--top-band);
    align-items: center;
    padding: 0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));
    background: var(--hub-glass-solid);
    border-bottom: 1px solid var(--hub-glass-edge);
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
  .interior-still {
    transform: none;
  }
}
</style>
