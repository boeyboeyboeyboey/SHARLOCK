<script setup>
defineOptions({ name: 'SharlockDashboard' })
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HubScene from '../features/hub/HubScene.vue'
import HubAmbience from '../features/hub/HubAmbience.vue'
import TownMap from '../features/legacy-town/TownMap.vue'
import Hub3dWarning from '../features/legacy-town/Hub3dWarning.vue'
import { readGraphics, writeGraphics } from '../features/hub/graphics.js'
import { writePerf } from '../features/hub/perfWatch.js'
import { useTownMode } from '../features/legacy-town/useTownMode.js'
import PixelIcon from '../components/town/PixelIcon.vue'
import ImmersiveControls from '../features/menu/ImmersiveControls.vue'
import {
  createSoundRegistry,
  provideTownControls,
  useSignOut,
} from '../features/menu/townControls.js'
import { useLoreIntro } from '../features/hub/intro/useLoreIntro.js'
import { gameCatalog } from '../data/gameCatalog.js'
import { useAuthStore } from '../features/auth/store.js'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const hubScene = ref(null)
const townMap = ref(null)
const controls = ref(null)
const menuOpen = ref(false)
const signOut = useSignOut()
// the floating controls offer this slot to whichever sound component is mounted
const soundSlot = shallowRef(null)
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
const noticeText = computed(() => {
  const reasons = townMode.reasons.value
  if (reasons.includes('no-webgl2'))
    return 'This browser does not support WebGL 2, so you are seeing the 2D map.'
  if (reasons.includes('phone'))
    return 'Phones open the 2D map by default. You can switch to 3D from the top right.'
  if (reasons.includes('slow-runtime'))
    return 'Your device was struggling to run the 3D wharf, so we switched to the 2D map.'
  if (reasons.includes('failed'))
    return 'The 3D wharf could not start on this device, so you are seeing the 2D map.'
  return 'You are seeing the 2D map because this device may not run the 3D wharf smoothly.'
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
    <h1 v-if="is3d" class="visually-hidden" tabindex="-1">Thames Wharf</h1>
    <section v-else class="town-intro">
      <div>
        <p class="town-eyebrow">A SMALL TOWN. A WORLD OF DISCOVERIES.</p>
        <h1 tabindex="-1">Welcome to Sharlock Town.</h1>
        <p>
          Pick a building. Follow your curiosity. Every adventure is open.
          <RouterLink to="/about">About Sharlock</RouterLink>
        </p>
      </div>
    </section>
    <template v-if="!is3d">
      <p v-if="route.query.classRequest === 'pending'" class="alert alert-success" role="status">
        Your class request is pending staff approval. You can explore on your own while you wait.
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
    </template>
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
        Your class request is pending staff approval. You can explore on your own while you wait.
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
      :sound-suspended="route.name === 'news'"
      @activate="router.push($event)"
    />
    <p v-if="!is3d" class="town-footnote">
      <PixelIcon name="star" :size="16" /> Explore at your own pace.
    </p>
    <Hub3dWarning
      v-if="townMode.warning.value"
      @cancel="townMode.cancel3d"
      @confirm="townMode.confirm3d"
    />
    <ImmersiveControls
      ref="controls"
      v-model:menu-open="menuOpen"
      :mode="townMode.mode.value"
      :locked="townMode.locked.value"
      :suppressed="escapeHeld"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @toggle-mode="townMode.toggle"
      @sign-out="signOut"
    />
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
.town-dashboard:not(.is-hub) {
  padding-top: 52px;
}
:global(.portal-shell.is-immersive .hub-hud),
:global(.portal-shell.is-immersive .hub-dest) {
  top: 64px;
}
:global(.portal-shell:has(.town-dashboard.is-hub) .portal-footer) {
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
