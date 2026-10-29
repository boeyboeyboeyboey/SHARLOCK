<script setup>
import { computed } from 'vue'
import OverlayPanel from '../OverlayPanel.vue'
import { GRAPHICS_OPTIONS } from '../../hub/graphics.js'
import { HUB_KEYS } from '../../hub/controls.js'
import { useTownControls } from '../townControls.js'

defineEmits(['request-close'])
const controls = useTownControls()
const is3d = computed(() => controls?.townMode.mode.value === '3d')
const sound = computed(() => controls?.sound.current.value ?? null)
const soundBusy = computed(() => !sound.value || sound.value.busy)
</script>

<template>
  <OverlayPanel title="Settings" :paper="false" @request-close="$emit('request-close')">
    <ul v-if="controls" class="settings-list">
      <li v-if="is3d">
        <label for="settings-graphics">Graphics</label>
        <select
          id="settings-graphics"
          data-testid="hub-graphics"
          :value="controls.graphics.value"
          @change="controls.setGraphics($event.target.value)"
        >
          <option v-for="option in GRAPHICS_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </li>
      <li>
        <span id="settings-sound-label">Sound</span>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="settings-sound"
          aria-labelledby="settings-sound-label"
          :aria-pressed="String(Boolean(sound) && !sound.muted)"
          :disabled="soundBusy"
          @click="sound?.toggle()"
        >
          {{ sound && !sound.muted ? 'On' : 'Off' }}
        </button>
      </li>
      <li>
        <span id="settings-view-label">View</span>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="settings-view"
          aria-describedby="settings-view-label"
          :disabled="controls.townMode.locked.value"
          @click="controls.townMode.toggle()"
        >
          {{ is3d ? '3D (switch to 2D)' : '2D (switch to 3D)' }}
        </button>
      </li>
      <li v-if="is3d">
        <span id="settings-intro-label">Intro</span>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="settings-replay-intro"
          aria-describedby="settings-intro-label"
          @click="controls.replayIntro()"
        >
          Replay intro
        </button>
      </li>
      <li v-if="is3d">
        <span id="settings-controls-label">Controls</span>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="settings-controls"
          aria-describedby="settings-controls-label"
          @click="controls.showControls()"
        >
          Show controls
        </button>
        <ul class="settings-keys" aria-label="Controls">
          <li v-for="[key, action] in HUB_KEYS" :key="key">
            <kbd>{{ key }}</kbd> {{ action }}
          </li>
        </ul>
      </li>
      <li v-if="is3d">
        <span id="settings-camera-label">Camera</span>
        <button
          type="button"
          class="glass-surface glass-button"
          data-testid="settings-reset-camera"
          aria-describedby="settings-camera-label"
          @click="controls.resetCamera()"
        >
          Reset camera
        </button>
      </li>
    </ul>
  </OverlayPanel>
</template>
