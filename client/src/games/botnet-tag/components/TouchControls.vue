<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { SPRINT_COOLDOWN_MS, SPRINT_MS } from '../tagRules.js'

const props = defineProps({
  sprintPhase: { type: String, default: 'ready' },
  sprintAt: { type: Number, default: 0 },
})
const emit = defineEmits(['joystick', 'jump', 'sprint'])

const pad = ref(null)
const knob = ref(null)
let pointer = null

const sprintText = {
  ready: 'Sprint ready',
  active: 'Sprint active',
  cooldown: 'Sprint recharging',
}

// the knob follows the finger inside the pad; the arena reads x right and y forward
function drive(event) {
  const rect = pad.value.getBoundingClientRect()
  const radius = rect.width / 2
  let dx = event.clientX - (rect.left + radius)
  let dy = event.clientY - (rect.top + radius)
  const len = Math.hypot(dx, dy)
  if (len > radius) {
    dx = (dx * radius) / len
    dy = (dy * radius) / len
  }
  knob.value.style.transform = `translate(${dx}px, ${dy}px)`
  emit('joystick', dx / radius, -dy / radius)
}
function release() {
  if (pointer === null) return
  pointer = null
  if (knob.value) knob.value.style.transform = ''
  emit('joystick', 0, 0)
}
function down(event) {
  if (pointer !== null) return
  pointer = event.pointerId
  pad.value.setPointerCapture?.(event.pointerId)
  drive(event)
}
function move(event) {
  if (event.pointerId === pointer) drive(event)
}
function up(event) {
  if (event.pointerId === pointer) release()
}
onBeforeUnmount(release)
</script>

<template>
  <div class="tag-touch" data-testid="tag-touch">
    <div
      ref="pad"
      class="tag-joystick"
      aria-hidden="true"
      data-testid="tag-joystick"
      @pointerdown.prevent="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @lostpointercapture="up"
    >
      <div ref="knob" class="tag-joystick-knob"></div>
    </div>
    <button type="button" class="tag-jump" data-testid="tag-jump" @click="emit('jump')">
      Jump
    </button>
    <button
      type="button"
      class="tag-sprint"
      data-testid="tag-sprint"
      :data-state="props.sprintPhase"
      :aria-disabled="props.sprintPhase !== 'ready'"
      aria-label="Sprint"
      aria-describedby="tag-sprint-state"
      @click="emit('sprint')"
    >
      <svg class="tag-sprint-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="tag-sprint-track" cx="18" cy="18" r="16" />
        <circle
          :key="`${props.sprintPhase}-${props.sprintAt}`"
          class="tag-sprint-fill"
          cx="18"
          cy="18"
          r="16"
          pathLength="100"
          :style="{
            '--sprint-ms': `${props.sprintPhase === 'active' ? SPRINT_MS : SPRINT_COOLDOWN_MS}ms`,
          }"
        />
        <path class="tag-sprint-bolt" d="M20 6 11 20h6l-2 10 10-15h-6z" />
      </svg>
      <span id="tag-sprint-state" class="tag-sr">{{ sprintText[props.sprintPhase] }}</span>
    </button>
  </div>
</template>
