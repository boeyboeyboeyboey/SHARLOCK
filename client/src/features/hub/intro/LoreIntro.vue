<script setup>
import '@fontsource/libre-baskerville/400.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PixelIcon from '../../../components/town/PixelIcon.vue'
import { MUSIC_MUTED_KEY } from '../../../composables/useLandingMusic.js'
import { FADE_MS, LORE_CARDS, holdFor } from './loreCards.js'

const props = defineProps({
  reducedMotion: { type: Boolean, default: false },
  ready: { type: Boolean, default: false },
})
const emit = defineEmits(['done'])

const EXIT_MS = 800
const SKIP_MS = 300
const VOLUME = 0.5
const GATE_TEXT = 'Click or press Enter to begin'

function readMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}
// an unmuted choice is never stored, so audio can start again in a new session
function writeMuted(value) {
  try {
    if (value) sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    else sessionStorage.removeItem(MUSIC_MUTED_KEY)
  } catch {
    // storage can be blocked
  }
}

const dialog = ref(null)
const audio = ref(null)
const index = ref(0)
const visible = ref(false)
const waiting = ref(false)
const gated = ref(false)
const leaving = ref(false)
const skipping = ref(false)
const muted = ref(readMuted())
const coarse = ref(false)
let timer = null
let fadeTimer = null
let finished = false
let audioOn = false
let started = false

const parts = computed(() => {
  if (waiting.value) return [{ text: 'Loading the wharf…' }]
  if (gated.value) return [{ text: GATE_TEXT }]
  const { text, highlight } = LORE_CARDS[index.value]
  const at = highlight ? text.indexOf(highlight) : -1
  if (at < 0) return [{ text }]
  return [
    { text: text.slice(0, at) },
    { text: highlight, name: true },
    { text: text.slice(at + highlight.length) },
  ].filter((part) => part.text)
})
const showContinue = computed(() => props.reducedMotion && !waiting.value && !gated.value)

function clear() {
  clearTimeout(timer)
  timer = null
}

function stopAudio() {
  clearInterval(fadeTimer)
  fadeTimer = null
  audioOn = false
  audio.value?.pause()
}

// ramp the volume to zero, then pause
function fadeAudio(ms) {
  if (!audioOn || !audio.value || ms <= 0) return stopAudio()
  const from = audio.value.volume
  const steps = Math.max(1, Math.round(ms / 50))
  let n = 0
  clearInterval(fadeTimer)
  fadeTimer = setInterval(() => {
    n += 1
    if (!audio.value || n >= steps) return stopAudio()
    audio.value.volume = from * (1 - n / steps)
  }, 50)
}

// resolves true when playback started; a missing file or any other failure continues silently
async function playAudio() {
  if (!audio.value) return { ok: false, blocked: false }
  audio.value.volume = VOLUME
  try {
    await audio.value.play()
    audioOn = true
    return { ok: true, blocked: false }
  } catch (error) {
    return { ok: false, blocked: error?.name === 'NotAllowedError' }
  }
}

function finishNow() {
  if (finished) return
  finished = true
  clear()
  stopAudio()
  emit('done')
}

// fade the black out to reveal the scene, then hand control back
function exit() {
  if (finished || leaving.value) return
  clear()
  if (props.reducedMotion) return finishNow()
  leaving.value = true
  fadeAudio(EXIT_MS)
  timer = setTimeout(finishNow, EXIT_MS)
}

function atEnd() {
  clear()
  if (props.ready) exit()
  else {
    waiting.value = true
    visible.value = true
  }
}

function showCard() {
  clear()
  started = true
  visible.value = true
  if (props.reducedMotion) return
  timer = setTimeout(fadeOut, FADE_MS + holdFor(LORE_CARDS[index.value].text))
}

// fade the current card out, then move on
function fadeOut() {
  clear()
  visible.value = false
  if (props.reducedMotion) return step()
  timer = setTimeout(step, FADE_MS)
}

function step() {
  clear()
  if (index.value >= LORE_CARDS.length - 1) return atEnd()
  index.value += 1
  showCard()
}

// the first click or Enter after a blocked autoplay starts the sound and card 1
function begin() {
  gated.value = false
  if (!muted.value) playAudio()
  showCard()
}

function advance() {
  if (finished || leaving.value) return
  if (gated.value) return begin()
  if (!started || waiting.value) return
  fadeOut()
}

function skip() {
  if (finished || leaving.value) return
  clear()
  if (props.reducedMotion || !audioOn) return finishNow()
  leaving.value = true
  skipping.value = true
  fadeAudio(SKIP_MS)
  timer = setTimeout(finishNow, SKIP_MS)
}

async function toggleSound() {
  if (finished || leaving.value) return
  if (!muted.value) {
    muted.value = true
    writeMuted(true)
    stopAudio()
    if (gated.value) begin()
    return
  }
  muted.value = false
  writeMuted(false)
  if (!gated.value) await playAudio()
}

function onKeydown(event) {
  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    return skip()
  }
  if (event.key === 'Tab') {
    event.stopPropagation()
    const buttons = [...dialog.value.querySelectorAll('button')]
    if (!buttons.length) return event.preventDefault()
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog.value)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
    return
  }
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    // a focused button keeps its own activation
    if (event.target instanceof HTMLButtonElement) {
      if (event.repeat) return
      return event.target.click()
    }
    if (!event.repeat) advance()
  }
}

watch(waiting, async (value) => {
  if (!value) return
  await nextTick()
  dialog.value?.focus()
})
watch(
  () => props.ready,
  (ready) => {
    if (ready && waiting.value) exit()
  },
)

onMounted(async () => {
  coarse.value = Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  await nextTick()
  if (props.reducedMotion)
    dialog.value?.querySelector('[data-testid="lore-intro-continue"]')?.focus()
  else dialog.value?.focus()
  if (muted.value) return showCard()
  const result = await playAudio()
  if (finished) return
  if (result.blocked && !muted.value) {
    gated.value = true
    visible.value = true
  } else showCard()
})
onBeforeUnmount(() => {
  clear()
  stopAudio()
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="dialog"
      class="lore-intro"
      :class="{ leaving, skipping, 'no-motion': reducedMotion }"
      role="dialog"
      aria-modal="true"
      aria-label="Introduction"
      tabindex="-1"
      data-testid="lore-intro"
      @keydown="onKeydown"
      @click="advance"
    >
      <audio ref="audio" src="/audio/lore-intro.mp3" preload="auto"></audio>
      <button
        type="button"
        class="lore-sound"
        data-testid="lore-intro-sound"
        :aria-label="muted ? 'Turn on intro sound' : 'Mute intro sound'"
        :aria-pressed="muted"
        @click.stop="toggleSound"
      >
        <PixelIcon :name="muted ? 'mute' : 'sound'" :size="20" />
      </button>
      <div class="lore-body">
        <p
          class="lore-card"
          :class="{ shown: visible }"
          aria-live="polite"
          data-testid="lore-intro-card"
        >
          <template v-for="(part, i) in parts" :key="i"
            ><span v-if="part.name" class="lore-name">{{ part.text }}</span
            ><template v-else>{{ part.text }}</template></template
          >
        </p>
        <button
          v-if="showContinue"
          type="button"
          class="lore-continue"
          data-testid="lore-intro-continue"
          @click.stop="advance"
        >
          Continue
        </button>
      </div>
      <button
        type="button"
        class="lore-skip"
        data-testid="lore-intro-skip"
        aria-label="Skip intro"
        @click.stop="skip"
      >
        {{ coarse ? 'Tap to skip' : 'Press Space to skip' }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lore-intro {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 56px 20px 24px;
  background: #000;
  color: #fff;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.8s ease;
  outline: none;
}
.lore-intro.leaving {
  opacity: 0;
  pointer-events: none;
}
.lore-intro.skipping {
  transition-duration: 0.3s;
}
.lore-body {
  display: grid;
  justify-items: center;
  gap: 24px;
  max-width: 100%;
}
.lore-card {
  max-width: 32ch;
  margin: 0;
  color: #fff;
  font-family: 'Libre Baskerville', Georgia, serif;
  font-size: clamp(1.4rem, 3.5vw, 2.4rem);
  line-height: 1.5;
  text-align: center;
  overflow-wrap: break-word;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.lore-card.shown {
  opacity: 1;
}
.lore-name {
  color: #e8c468;
}
.lore-sound,
.lore-skip,
.lore-continue {
  border: 2px solid #fff;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
}
.lore-sound {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  padding: 6px;
  border-width: 1px;
  opacity: 0.6;
}
.lore-skip {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 4px 10px;
  border-width: 1px;
  font-family: 'Libre Baskerville', Georgia, serif;
  font-size: 0.8rem;
  opacity: 0.6;
}
.lore-sound:hover,
.lore-sound:focus-visible,
.lore-skip:hover,
.lore-skip:focus-visible {
  opacity: 1;
}
.lore-continue {
  padding: 8px 20px;
}
.lore-sound:hover,
.lore-skip:hover,
.lore-continue:hover {
  background: #fff;
  color: #000;
}
.lore-sound:focus-visible,
.lore-skip:focus-visible,
.lore-continue:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}
.no-motion,
.no-motion .lore-card {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .lore-intro,
  .lore-card {
    transition: none;
  }
}
</style>
