<script setup>
import { computed, ref } from 'vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useLandingMusic } from '../../composables/useLandingMusic.js'
const props = defineProps({ suspended: Boolean })
const audio = ref(null)
const { isMuted, starting, errorMessage, toggle, failPlayback } = useLandingMusic(
  audio,
  () => props.suspended,
)
const soundLabel = computed(() => {
  if (starting.value) return 'Starting…'
  if (isMuted.value) return 'Sound off'
  return 'Sound on'
})
</script>
<template>
  <div class="town-audio">
    <audio
      ref="audio"
      src="/audio/sharlock-bgm.mp3"
      loop
      preload="none"
      @error="failPlayback"
    ></audio>
    <button
      class="pixel-button sound-button"
      type="button"
      :aria-label="isMuted ? 'Turn on town sound' : 'Mute town sound'"
      :aria-pressed="!isMuted"
      :disabled="starting || suspended"
      @click="toggle"
    >
      <PixelIcon :name="isMuted ? 'mute' : 'sound'" :size="20" /><span>{{ soundLabel }}</span>
    </button>
    <p v-if="errorMessage" class="audio-error" role="status">{{ errorMessage }}</p>
  </div>
</template>
