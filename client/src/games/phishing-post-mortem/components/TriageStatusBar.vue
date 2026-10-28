<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  timed: { type: Boolean, default: false },
  secondsLeft: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  mistakes: { type: Number, default: 0 },
  maxMistakes: { type: Number, default: 3 },
  roundsPlayed: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 12 },
})

const WARNINGS = [
  { at: 10, text: '10 seconds left' },
  { at: 30, text: '30 seconds left' },
  { at: 60, text: '1 minute left' },
]

const clock = computed(() => {
  const whole = Math.max(0, Math.ceil(props.secondsLeft))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
})
const multiplier = computed(() => {
  if (props.streak >= 6) return 3
  if (props.streak >= 3) return 2
  return 1
})
const emailNumber = computed(() => Math.min(props.roundsPlayed + 1, props.totalRounds))

const RUN_SECONDS = 180
const totalSeconds = ref(Math.max(props.secondsLeft, RUN_SECONDS))
const wholeSeconds = computed(() => Math.max(0, Math.ceil(props.secondsLeft)))
const drainPercent = computed(() =>
  Math.min(100, Math.round((Math.max(0, props.secondsLeft) / totalSeconds.value) * 100)),
)
const tone = computed(() => {
  if (!props.timed) return ''
  if (props.secondsLeft <= 10) return 'is-urgent'
  if (props.secondsLeft <= 30) return 'is-warning'
  return ''
})
watch(
  () => props.secondsLeft,
  (seconds) => {
    if (seconds > totalSeconds.value) totalSeconds.value = seconds
  },
)

// score counts up to its new value, jumping straight there under reduced motion
const COUNT_MS = 500
const shownScore = ref(props.score)
let frame = null

function motionAllowed() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return false
  }
  if (typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function stopCount() {
  if (frame !== null) window.cancelAnimationFrame(frame)
  frame = null
}

watch(
  () => props.score,
  (target) => {
    stopCount()
    if (!motionAllowed()) {
      shownScore.value = target
      return
    }
    const from = shownScore.value
    let began = null
    const step = (now) => {
      began ??= now
      const progress = Math.min(1, (now - began) / COUNT_MS)
      shownScore.value = Math.round(from + (target - from) * (1 - (1 - progress) ** 3))
      frame = progress < 1 ? window.requestAnimationFrame(step) : null
    }
    frame = window.requestAnimationFrame(step)
  },
)

// the newly spent pip flashes once
const flashPip = ref(0)
let flashTimer = null
watch(
  () => props.mistakes,
  (now, before) => {
    if (now <= before) return
    clearTimeout(flashTimer)
    flashPip.value = now
    flashTimer = setTimeout(() => {
      flashPip.value = 0
    }, 700)
  },
)

onBeforeUnmount(() => {
  stopCount()
  clearTimeout(flashTimer)
})

const announcement = ref('')
const announced = new Set()
watch(
  () => props.secondsLeft,
  (seconds) => {
    if (!props.timed) return
    const warning = WARNINGS.find((item) => seconds <= item.at)
    if (!warning || announced.has(warning.at)) return
    WARNINGS.filter((item) => item.at >= warning.at).forEach((item) => announced.add(item.at))
    announcement.value = warning.text
  },
  { immediate: true },
)
</script>

<template>
  <div class="triage-status" :class="tone">
    <div v-if="timed" class="triage-timer">
      <span class="triage-clock" role="timer">{{ clock }}</span>
      <span
        class="triage-drain"
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin="0"
        :aria-valuemax="totalSeconds"
        :aria-valuenow="wholeSeconds"
        :aria-valuetext="clock"
      >
        <span class="triage-drain-fill" :style="{ width: `${drainPercent}%` }"></span>
      </span>
    </div>
    <span v-else class="triage-stat">Email {{ emailNumber }} of {{ totalRounds }}</span>
    <span class="triage-stat">Score {{ shownScore }}</span>
    <span class="triage-stat">
      Streak {{ streak
      }}<template v-if="multiplier > 1"
        >{{ ' ' }}<span :key="multiplier" class="triage-mult">×{{ multiplier }}</span></template
      >
    </span>
    <span v-if="timed" class="triage-stat triage-mistakes">
      <span class="triage-pips" aria-hidden="true">
        <span
          v-for="n in maxMistakes"
          :key="n"
          class="triage-pip"
          :class="{ 'is-spent': n <= mistakes, 'is-flash': n === flashPip }"
        ></span>
      </span>
      Mistakes {{ mistakes }} of {{ maxMistakes }}
    </span>
    <span class="visually-hidden" aria-live="polite">{{ announcement }}</span>
  </div>
</template>
