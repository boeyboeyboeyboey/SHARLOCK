<script setup>
import { computed, ref } from 'vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
import { useLandingMusic } from '../../composables/useLandingMusic.js'
import { useLoreIntro } from './intro/useLoreIntro.js'
const props = defineProps({ suspended: Boolean })
const audio = ref(null)
const { playing: introPlaying } = useLoreIntro()
// the lore intro holds the ambience the same way the open Times does
const held = computed(() => props.suspended || introPlaying.value)
// same autoplay, gesture fallback and session mute as the 2d town music
const { isMuted, starting, errorMessage, toggle, failPlayback } = useLandingMusic(
  audio,
  () => held.value,
)
const soundLabel = computed(() => {
  if (starting.value) return 'Starting…'
  if (isMuted.value) return 'Sound off'
  return 'Sound on'
})
</script>
<template>
  <div class="town-audio hub-audio">
    <audio
      ref="audio"
      src="/audio/hub-ambience.mp3"
      loop
      preload="none"
      @error="failPlayback"
    ></audio>
    <button
      class="pixel-button sound-button"
      type="button"
      :aria-label="isMuted ? 'Turn on hub sound' : 'Mute hub sound'"
      :aria-pressed="!isMuted"
      :disabled="starting || held"
      @click="toggle"
    >
      <PixelIcon :name="isMuted ? 'mute' : 'sound'" :size="20" /><span>{{ soundLabel }}</span>
    </button>
    <p v-if="errorMessage" class="audio-error" role="status">{{ errorMessage }}</p>
  </div>
</template>
