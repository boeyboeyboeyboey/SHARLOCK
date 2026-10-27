<script setup>
defineOptions({ name: 'SharlockDashboard' })
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HubScene from '../features/hub/HubScene.vue'
import TownMap from '../features/legacy-town/TownMap.vue'
import TownAudio from '../features/legacy-town/TownAudio.vue'
import Hub3dWarning from '../features/legacy-town/Hub3dWarning.vue'
import { GRAPHICS_OPTIONS, readGraphics, writeGraphics } from '../features/hub/graphics.js'
import { writePerf } from '../features/hub/perfWatch.js'
import { useTownMode } from '../features/legacy-town/useTownMode.js'
import PixelIcon from '../components/town/PixelIcon.vue'
import { gameCatalog } from '../data/gameCatalog.js'
import { useAuthStore } from '../features/auth/store.js'
import { avatarFor } from '../features/auth/avatars.js'
const auth = useAuthStore()
const avatar = computed(() => avatarFor(auth.user?.avatarId))
const route = useRoute()
const router = useRouter()
const hubScene = ref(null)
const townMap = ref(null)
const townMode = useTownMode()
const is3d = computed(() => townMode.mode.value === '3d')
const graphics = ref(readGraphics())
function setGraphics(event) {
  graphics.value = event.target.value
  writeGraphics(graphics.value)
  // choosing auto again forgets the measured outcome so the device is measured afresh
  if (graphics.value === 'auto') writePerf(null)
}
const noticeText = computed(() => {
  const reasons = townMode.reasons.value
  if (reasons.includes('no-webgl2')) return 'This browser does not support WebGL 2, so you are seeing the 2D map.'
  if (reasons.includes('slow-runtime')) return 'Your device was struggling to run the 3D wharf, so we switched to the 2D map.'
  if (reasons.includes('failed')) return 'The 3D wharf could not start on this device, so you are seeing the 2D map.'
  return 'You are seeing the 2D map because this device may not run the 3D wharf smoothly.'
})
const toggleLabel = computed(() => (is3d.value ? 'Switch to 2D map' : 'Switch to 3D wharf'))
let openedFromTown = false
watch(
  () => route.name,
  async (name, previous) => {
    if (name === 'news') {
      openedFromTown = previous === 'town'
      townMap.value?.dismiss()
    } else if (name === 'town' && previous === 'news') {
      openedFromTown = false
      await nextTick()
      // skip the restore if a newly opened card already took focus
      if (document.activeElement?.closest('.game-info-card')) return
      if (is3d.value) hubScene.value?.focusDestination('threat-briefing')
      else townMap.value?.focusBuilding('threat-briefing')
    }
  },
)
function closeNewspaper() {
  // only go back when this mounted town created the newspaper history entry
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
      <div class="town-intro-actions">
        <button
          v-if="!townMode.locked.value"
          type="button"
          class="pixel-button"
          data-testid="town-mode-toggle"
          :aria-label="toggleLabel"
          @click="townMode.toggle"
        >
          {{ is3d ? '2D map' : '3D wharf' }}
        </button>
        <RouterLink to="/profile" class="town-player" aria-label="View your detective profile">
          <img :src="avatar.path" width="80" height="80" :alt="avatar.label" class="avatar-image" />
          <span
            ><strong>{{ auth.user?.username }}</strong
            ><span>Results are not saved</span></span
          >
        </RouterLink>
      </div>
    </section>
    <template v-if="!is3d">
      <p v-if="route.query.classRequest === 'pending'" class="alert alert-success" role="status">
        Your class request is pending staff approval. You can explore on your own while you wait.
        <RouterLink to="/classes">View your classes</RouterLink>
      </p>
      <p v-else-if="route.query.classRequest === 'active'" class="alert alert-success" role="status">
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
      :input-paused="route.name === 'news'"
      :quality="graphics"
      :explicit3d="townMode.explicit3d.value"
      @enter="router.push($event.route)"
      @failed="townMode.markFailed"
      @slow="townMode.markSlow"
    >
      <div class="hud-row">
        <button
          type="button"
          class="pixel-button hud-toggle"
          data-testid="town-mode-toggle"
          :aria-label="toggleLabel"
          @click="townMode.toggle"
        >
          2D map
        </button>
        <label class="hud-graphics">
          <span>Graphics</span>
          <select
            class="form-select form-select-sm"
            data-testid="hub-graphics"
            aria-label="Graphics quality"
            :value="graphics"
            @change="setGraphics"
          >
            <option v-for="option in GRAPHICS_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <TownAudio :suspended="route.name === 'news'" />
        <RouterLink
          to="/profile"
          class="town-player hud-player"
          aria-label="View your detective profile"
        >
          <img :src="avatar.path" width="40" height="40" :alt="avatar.label" class="avatar-image" />
          <span
            ><strong>{{ auth.user?.username }}</strong
            ><span class="hud-note">Results are not saved</span></span
          >
        </RouterLink>
      </div>
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
    <RouterView @request-close="closeNewspaper" />
  </div>
</template>

<style scoped>
.town-intro-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

/* 3d landing: the wharf fills the window below the navbar, so the shared page padding and footer step aside */
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
:global(.portal-shell:has(.town-dashboard.is-hub) .portal-footer) {
  display: none;
}
.hud-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud-toggle {
  min-width: 44px;
  padding: 4px 10px;
  font-size: 14px;
  box-shadow: 3px 3px 0 var(--town-edge);
}
.hud-row :deep(.sound-button) {
  min-width: 44px;
  padding: 4px 10px;
  font-size: 14px;
  box-shadow: 3px 3px 0 var(--town-edge);
}
.hud-graphics {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 2px 6px;
  border: 2px solid var(--town-edge);
  background: var(--town-paper);
  box-shadow: 3px 3px 0 var(--town-edge);
  font-size: 13px;
}
.hud-graphics select {
  width: auto;
  min-height: 36px;
}
.hud-player {
  min-height: 44px;
  gap: 8px;
  padding: 2px 10px 2px 2px;
  box-shadow: 3px 3px 0 var(--town-edge);
  min-width: 0;
}
.hud-player img {
  width: 40px;
  height: 40px;
}
.hud-player strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.hud-note {
  font-size: 12px;
}
.hud-alert {
  max-width: 320px;
  margin: 0;
  padding: 6px 10px;
  border: 2px solid var(--town-edge);
  background: var(--town-paper);
  box-shadow: 3px 3px 0 var(--town-edge);
  font-size: 13px;
}
@media (max-width: 575.98px) {
  .hud-row {
    flex-wrap: wrap;
  }
  .hud-graphics > span {
    display: none;
  }
  .hud-player > span {
    gap: 0;
  }
  .hud-note {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .hud-alert {
    max-width: 240px;
    font-size: 12px;
  }
}
</style>
