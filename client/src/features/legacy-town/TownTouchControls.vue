<script setup>
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  sprintState: { type: String, default: 'ready' },
})
const emit = defineEmits(['move', 'sprint'])

const pad = ref(null)
const knob = ref(null)
let pointer = null
const DEADZONE = 0.15

const sprintText = { ready: 'Sprint', active: 'Sprinting', cooldown: 'Recharging' }

// the knob follows the finger inside the pad; x right and y down, each -1..1
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
  const magnitude = Math.hypot(dx, dy) / radius
  if (magnitude < DEADZONE) emit('move', 0, 0)
  else emit('move', dx / radius, dy / radius)
}
function release() {
  if (pointer === null) return
  pointer = null
  if (knob.value) knob.value.style.transform = ''
  emit('move', 0, 0)
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
  <div class="town-touch" data-testid="town-touch">
    <div
      ref="pad"
      class="town-joystick"
      role="presentation"
      data-testid="town-joystick"
      @pointerdown.prevent="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @lostpointercapture="up"
    >
      <div ref="knob" class="town-joystick-knob"></div>
    </div>
    <button
      type="button"
      class="pixel-button town-sprint"
      data-testid="town-sprint"
      :data-state="props.sprintState"
      :aria-disabled="props.sprintState !== 'ready'"
      @click="emit('sprint')"
    >
      {{ sprintText[props.sprintState] ?? 'Sprint' }}
    </button>
  </div>
</template>

<style scoped>
.town-touch {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.town-joystick {
  position: relative;
  width: 112px;
  height: 112px;
  border: 3px solid rgb(27 34 48 / 55%);
  border-radius: 50%;
  background: rgb(255 248 223 / 35%);
  box-shadow: 0 0 0 2px rgb(255 248 223 / 45%);
  touch-action: none;
  user-select: none;
}
.town-joystick-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 48px;
  height: 48px;
  margin: -24px 0 0 -24px;
  border: 3px solid #fff8df;
  border-radius: 50%;
  background: rgb(47 58 79 / 75%);
  pointer-events: none;
}
.town-sprint {
  min-width: 72px;
  min-height: 48px;
  padding: 4px 10px;
  border-color: #1b2230;
  background: #2f3a4f;
  color: #fff8df;
  font-size: 14px;
  box-shadow:
    0 0 0 2px #fff8df,
    4px 4px 0 #1b2230;
}
.town-sprint[data-state='active'] {
  background: #ffc94a;
  color: #1b2230;
}
.town-sprint[data-state='cooldown'] {
  opacity: 0.6;
}
</style>
