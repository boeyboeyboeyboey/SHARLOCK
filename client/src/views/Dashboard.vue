<script setup>
defineOptions({ name: 'SharlockDashboard' })
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HubScene from '../features/hub/HubScene.vue'
import HubAmbience from '../features/hub/HubAmbience.vue'
import TownMap from '../features/legacy-town/TownMap.vue'
import TownAudio from '../features/legacy-town/TownAudio.vue'
import Hub3dWarning from '../features/legacy-town/Hub3dWarning.vue'
import { readGraphics, writeGraphics } from '../features/hub/graphics.js'
import { writePerf } from '../features/hub/perfWatch.js'
import { useTownMode } from '../features/legacy-town/useTownMode.js'
import ImmersiveControls from '../features/menu/ImmersiveControls.vue'
import {
  createSoundRegistry,
  provideTownControls,
  useSignOut,
} from '../features/menu/townControls.js'
import { useLoreIntro } from '../features/hub/intro/useLoreIntro.js'
import { gameCatalog } from '../data/gameCatalog.js'
import { useAuthStore } from '../features/auth/store.js'
import { useUiScale } from '../composables/useUiScale.js'
import '../assets/styles/ui-scale.css'
const auth = useAuthStore()
useUiScale()
const route = useRoute()
const router = useRouter()
const hubScene = ref(null)
const townMap = ref(null)
const controls = ref(null)
const menuOpen = ref(false)
const signOut = useSignOut()
// the floating controls offer this slot to whichever sound component is mounted
const soundSlot = shallowRef(null)
// the 2d town registers its jump function here for the menu's Places list
const jumpTo = shallowRef(null)
const lore = useLoreIntro()
const townMode = useTownMode()
const is3d = computed(() => townMode.mode.value === '3d')
const graphics = ref(readGraphics())
function setGraphics(value) {
  graphics.value = value
  writeGraphics(graphics.value)
  // choosing auto again forgets the measured outcome so the device is measured afresh
  if (graphics.value === 'auto') writePerf(null)
}
// one line for the pending class notice in both town modes
const classPendingText = 'Class request pending staff approval.'
const noticeText = computed(() => {
  const reasons = townMode.reasons.value
  if (reasons.includes('no-webgl2')) return 'No WebGL 2 here: showing the 2D town.'
  if (reasons.includes('phone')) return 'Phones open the 2D town. Switch to 3D any time.'
  if (reasons.includes('slow-runtime')) return '3D ran too slowly here; showing 2D.'
  if (reasons.includes('failed'))
    return 'The 3D town could not start on this device, so you are seeing the 2D town.'
  return 'This device may not run 3D smoothly; showing 2D.'
})
// the Times and the menu overlays share one open, close and focus contract
const overlayNames = new Set(
  router
    .getRoutes()
    .filter((record) => record.meta.overlay || record.meta.newsDialog)
    .map((record) => record.name),
)
const isOverlay = computed(() => overlayNames.has(route.name))
const escapeHeld = computed(() => isOverlay.value || lore.playing.value || townMode.warning.value)
let afterClose = null
function replayIntro() {
  afterClose = () => lore.replay()
  closeOverlay()
}
function showControls() {
  afterClose = () => hubScene.value?.showControls()
  closeOverlay()
}
function resetCamera() {
  afterClose = () => hubScene.value?.resetCamera()
  closeOverlay()
}
provideTownControls({
  townMode,
  graphics,
  setGraphics,
  sound: createSoundRegistry(),
  replayIntro,
  showControls,
  resetCamera,
  soundSlot,
  jumpTo,
})
let openedFromTown = false
watch(
  () => route.name,
  async (name, previous) => {
    const opening = overlayNames.has(name)
    const wasOpen = overlayNames.has(previous)
    if (opening && !wasOpen) {
      openedFromTown = previous === 'town'
      townMap.value?.dismiss()
    } else if (name === 'town' && wasOpen) {
      openedFromTown = false
      await nextTick()
      if (afterClose) {
        const run = afterClose
        afterClose = null
        run()
        return
      }
      // skip the restore if a newly opened card already took focus
      if (document.activeElement?.closest('.game-info-card')) return
      if (previous !== 'news') controls.value?.focusMenu()
      else if (is3d.value) hubScene.value?.focusDestination('threat-briefing')
      else townMap.value?.focusBuilding('threat-briefing')
    }
  },
)
function closeOverlay() {
  // only go back when this mounted town created the overlay history entry
  if (openedFromTown) router.back()
  else router.replace({ name: 'town' })
}
</script>
<template>
  <div class="town-dashboard" :class="{ 'is-hub': is3d }">
    <h1 v-if="is3d" class="visually-hidden" tabindex="-1">3D town</h1>
    <h1 v-else class="visually-hidden" tabindex="-1">Welcome to Sharlock Town.</h1>
    <div v-if="!is3d" class="town-notices">
      <p v-if="route.query.classRequest === 'pending'" class="alert alert-success" role="status">
        {{ classPendingText }}
        <RouterLink to="/classes">View your classes</RouterLink>
      </p>
      <p
        v-else-if="route.query.classRequest === 'active'"
        class="alert alert-success"
        role="status"
      >
        You already belong to this class. <RouterLink to="/classes">View your classes</RouterLink>
      </p>
      <div
        v-if="townMode.noticeVisible.value"
        class="alert alert-info d-flex flex-wrap align-items-center gap-2"
        role="status"
        data-testid="town-mode-notice"
      >
        <span class="flex-grow-1">
          {{ noticeText }}
          <RouterLink to="/about#graphics">Why?</RouterLink>
          <template v-if="!townMode.locked.value">
            &middot;
            <button
              type="button"
              class="btn btn-link p-0 align-baseline"
              data-testid="town-mode-try3d"
              @click="townMode.toggle"
            >
              Try 3D anyway
            </button>
          </template>
        </span>
        <button
          v-if="!townMode.locked.value"
          type="button"
          class="btn-close"
          aria-label="Dismiss this notice"
          data-testid="town-mode-notice-close"
          @click="townMode.dismissNotice"
        ></button>
      </div>
    </div>
    <HubScene
      v-if="is3d"
      ref="hubScene"
      fill
      :games="gameCatalog"
      :input-paused="isOverlay || menuOpen"
      :quality="graphics"
      :explicit3d="townMode.explicit3d.value"
      :wardrobe="auth.user?.wardrobe ?? null"
      @enter="router.push($event.route)"
      @failed="townMode.markFailed"
      @slow="townMode.markSlow"
    >
      <HubAmbience :suspended="route.name === 'news'" />
      <p v-if="route.query.classRequest === 'pending'" class="hud-alert" role="status">
        {{ classPendingText }}
        <RouterLink to="/classes">View your classes</RouterLink>
      </p>
      <p v-else-if="route.query.classRequest === 'active'" class="hud-alert" role="status">
        You already belong to this class. <RouterLink to="/classes">View your classes</RouterLink>
      </p>
    </HubScene>
    <TownMap
      v-else
      ref="townMap"
      class="town-canvas"
      :games="gameCatalog"
      @activate="router.push($event)"
    />
    <Hub3dWarning
      v-if="townMode.warning.value"
      @cancel="townMode.cancel3d"
      @confirm="townMode.confirm3d"
    />
    <ImmersiveControls
      ref="controls"
      v-model:menu-open="menuOpen"
      :mode="townMode.mode.value"
      :skin="is3d ? 'glass' : 'pixel'"
      :locked="townMode.locked.value"
      :suppressed="escapeHeld"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @toggle-mode="townMode.toggle"
      @sign-out="signOut"
    >
      <template v-if="!is3d" #sound>
        <TownAudio :suspended="route.name === 'news'" />
      </template>
    </ImmersiveControls>
    <RouterView @request-close="closeOverlay" />
  </div>
</template>

<style scoped>
/* 3d landing: the wharf fills the window, so the shared page padding and footer step aside */
.town-dashboard.is-hub {
  position: relative;
  display: block;
  height: calc(100dvh - var(--header-height));
  min-height: 0;
}
:global(.portal-main:has(> .town-dashboard.is-hub)) {
  max-width: none;
  min-height: 0;
  padding: 0;
}
/* no navbar or sidebar on the town: the shell loses their space and the floating controls take a strip at the top */
:global(.portal-shell.is-immersive) {
  --header-height: 0px;
  --shell-chrome: 64px;
}
:global(.portal-shell.is-immersive .portal-workspace) {
  margin-left: 0;
}
/* 2d town: the map fills the window; the edge tabs and zoom stack float over it */
.town-dashboard:not(.is-hub) {
  position: relative;
  display: block;
  height: 100dvh;
  min-height: 0;
  padding: 0;
}
:global(.portal-main:has(> .town-dashboard:not(.is-hub))) {
  max-width: none;
  min-height: 0;
  padding: 0;
}
.town-notices {
  position: absolute;
  top: 68px;
  left: 50%;
  z-index: 15;
  width: min(560px, calc(100% - 24px));
  transform: translateX(-50%);
  pointer-events: none;
}
.town-notices > * {
  margin: 0 0 8px;
  padding: 8px 12px;
  border: 2px solid var(--town-edge);
  border-radius: 0;
  box-shadow: 3px 3px 0 var(--town-edge);
  font-size: 14px;
  pointer-events: auto;
}
:global(.portal-shell.is-immersive .hub-hud),
:global(.portal-shell.is-immersive .hub-dest) {
  top: 64px;
}
:global(.portal-shell:has(.town-dashboard) .portal-footer) {
  display: none;
}
.hud-alert {
  max-width: 320px;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--hub-glass-edge);
  border-radius: var(--hub-glass-radius);
  background: var(--hub-glass-bg);
  color: var(--hub-glass-ink);
  box-shadow: var(--hub-glass-shadow);
  -webkit-backdrop-filter: var(--hub-glass-filter);
  backdrop-filter: var(--hub-glass-filter);
  font-size: 13px;
}
.hud-alert a {
  color: var(--hub-glass-ink);
}
@media (max-width: 575.98px) {
  .hud-alert {
    max-width: 240px;
    font-size: 12px;
  }
}
</style>
