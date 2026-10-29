<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  HINT_MAX_VISITS,
  HINT_MS,
  TOUCH_HINT,
  keyboardHint,
  readHintCount,
  writeHintCount,
} from './controls.js'

const props = defineProps({
  // true while the lore intro owns the screen
  held: { type: Boolean, default: false },
})
const visible = ref(false)
const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const reduced = ref(Boolean(motionQuery?.matches))
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const text = computed(() => (touch ? TOUCH_HINT : keyboardHint()))
let timer = null
let counted = false

function hide() {
  visible.value = false
  clearTimeout(timer)
  window.removeEventListener('keydown', hide)
  window.removeEventListener('pointerdown', hide)
}

// reopened from Settings; this does not count as a visit
function show() {
  clearTimeout(timer)
  visible.value = true
  timer = setTimeout(hide, HINT_MS)
  window.addEventListener('keydown', hide)
  window.addEventListener('pointerdown', hide)
}

// the first three visits show it once the intro is out of the way
function showOnVisit() {
  if (counted || props.held) return
  counted = true
  const seen = readHintCount()
  if (seen >= HINT_MAX_VISITS) return
  writeHintCount(seen + 1)
  show()
}

watch(() => props.held, showOnVisit)
onMounted(showOnVisit)
onBeforeUnmount(hide)
defineExpose({ show, hide })
</script>

<template>
  <Transition :css="!reduced" name="controls-hint">
    <p
      v-if="visible"
      class="controls-hint"
      data-testid="controls-hint"
      :data-motion="reduced ? 'reduced' : 'full'"
      role="status"
    >
      {{ text }}
    </p>
  </Transition>
</template>

<style scoped>
.controls-hint {
  position: absolute;
  top: 64px;
  left: 50%;
  z-index: 3;
  width: max-content;
  max-width: min(640px, calc(100% - 32px));
  margin: 0;
  padding: 8px 16px;
  transform: translateX(-50%);
  border: 1px solid var(--hub-glass-edge);
  border-radius: var(--hub-glass-radius);
  background: var(--hub-glass-bg);
  color: var(--hub-glass-ink);
  box-shadow: var(--hub-glass-shadow);
  -webkit-backdrop-filter: var(--hub-glass-filter);
  backdrop-filter: var(--hub-glass-filter);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  pointer-events: none;
}
.controls-hint-enter-active,
.controls-hint-leave-active {
  transition: opacity 0.4s ease;
}
.controls-hint-enter-from,
.controls-hint-leave-to {
  opacity: 0;
}
</style>
