<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PixelIcon from '../../../components/town/PixelIcon.vue'

const audio = ref(null)
const wantsSound = ref(true)
const starting = ref(false)
const message = ref('')
const emit = defineEmits(['status'])
watch(message, (value) => emit('status', value))
let generation = 0
let disposed = false
const soundLabel = computed(() => {
  if (starting.value) return 'Starting…'
  if (wantsSound.value) return 'Mute'
  return 'Sound'
})

function silence() {
  generation++
  wantsSound.value = false
  starting.value = false
  if (audio.value) {
    audio.value.muted = true
    audio.value.pause()
  }
}
function failPlayback(error) {
  if (disposed) return
  silence()
  message.value =
    error?.name === 'NotAllowedError' ? '' : 'Sound could not start. Tap Sound to try again.'
}
async function play() {
  const element = audio.value
  if (!element || disposed) return
  const request = ++generation
  wantsSound.value = true
  starting.value = true
  message.value = ''
  element.muted = false
  try {
    await element.play()
    // a late play promise must not undo a mute or restart audio after departure
    if (disposed || !wantsSound.value) {
      element.muted = true
      element.pause()
    }
  } catch (error) {
    if (request === generation) failPlayback(error)
  } finally {
    if (!disposed && request === generation) starting.value = false
  }
}
function toggleSound() {
  message.value = ''
  if (wantsSound.value) silence()
  else play()
}
onMounted(() => {
  audio.value.volume = 0.2
  play()
})
onBeforeUnmount(() => {
  disposed = true
  silence()
})
</script>
<template>
  <div class="gazette-audio">
    <audio
      ref="audio"
      src="/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3"
      loop
      preload="auto"
      @error="failPlayback"
    ></audio>
    <button
      type="button"
      class="gazette-button gazette-sound"
      :aria-label="wantsSound ? 'Mute newspaper sound' : 'Play newspaper sound'"
      :aria-pressed="wantsSound"
      :aria-describedby="message ? 'times-audio-status' : undefined"
      @click="toggleSound"
    >
      <PixelIcon :name="wantsSound ? 'sound' : 'mute'" :size="20" />
      <span>{{ soundLabel }}</span>
    </button>
  </div>
</template>
