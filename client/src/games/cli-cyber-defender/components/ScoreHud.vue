<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CliIcon from './CliIcon.vue'

const props = defineProps({
  score: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 },
  remainingMs: { type: Number, default: null },
  resolvedCount: { type: Number, default: 0 },
  total: { type: Number, default: 8 },
  mode: { type: String, default: 'timed' },
  history: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: null },
  penalty: { type: Object, default: null },
})

const shownScore = ref(props.score)
let frame

// ease the displayed score up to the new total; reduced motion jumps straight to it
watch(
  () => props.score,
  (next, previous) => {
    cancelAnimationFrame(frame)
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || next < previous || !globalThis.requestAnimationFrame) {
      shownScore.value = next
      return
    }
    const from = shownScore.value
    const started = performance.now()
    const step = (time) => {
      const progress = Math.min(1, (time - started) / 400)
      shownScore.value = Math.round(from + (next - from) * progress)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
)

onBeforeUnmount(() => cancelAnimationFrame(frame))

// the hourglass only flips in the last three seconds of a timed window
const urgent = computed(
  () => props.mode === 'timed' && props.remainingMs != null && props.remainingMs <= 3000,
)

const challenge = computed(() =>
  props.currentIndex == null ? Math.min(props.resolvedCount, props.total) : props.currentIndex + 1,
)
const outcomes = computed(() => new Map(props.history.map((item) => [item.index, item.outcome])))

function stepClass(index) {
  const outcome = outcomes.value.get(index)
  if (outcome === 'correct') return 'is-ok'
  if (outcome === 'wrong' || outcome === 'missed') return 'is-bad'
  if (outcome === 'skipped') return 'is-skip'
  return index === props.currentIndex ? 'is-current' : ''
}

const timeLabel = computed(() =>
  props.mode === 'practice' || props.remainingMs == null
    ? 'untimed'
    : `${(props.remainingMs / 1000).toFixed(1)}s`,
)
</script>

<template>
  <section class="cli-hud row row-cols-2 row-cols-md-4 g-2" aria-label="Game status">
    <div class="col">
      <div class="cli-stat cli-stat-score">
        <span :key="score" class="cli-stat-icon cli-pop"><CliIcon name="score" :size="28" /></span>
        <div class="cli-stat-body">
          <span class="cli-stat-label">Score</span>
          <span class="cli-stat-value">{{ shownScore.toLocaleString() }}</span>
        </div>
      </div>
    </div>
    <div class="col">
      <div :class="['cli-stat', 'cli-stat-streak', { 'is-hot': streak >= 3 }]">
        <span :key="streak" :class="['cli-stat-icon', { 'cli-flicker': streak > 0 }]"
          ><CliIcon name="streak" :size="28"
        /></span>
        <div class="cli-stat-body">
          <span class="cli-stat-label">Streak</span>
          <span class="cli-stat-row">
            <span class="cli-stat-value">{{ streak }}</span>
            <span :class="['cli-streak-meter', { 'is-max': streak >= 3 }]" aria-hidden="true">
              <span
                v-for="step in 3"
                :key="step"
                :class="['cli-streak-pip', { 'is-on': streak >= step }]"
              ></span>
            </span>
            <span class="cli-hud-sub">next &times;{{ multiplier }}</span>
          </span>
        </div>
      </div>
    </div>
    <div class="col">
      <div class="cli-stat cli-stat-window">
        <span :class="['cli-stat-icon', { 'cli-flip': urgent }]"
          ><CliIcon name="window" :size="28"
        /></span>
        <div class="cli-stat-body">
          <span class="cli-stat-label">Window</span>
          <span
            :class="['cli-stat-value', { 'is-word': timeLabel === 'untimed' }]"
            aria-hidden="true"
            >{{ timeLabel }}</span
          >
          <span v-if="penalty" :key="penalty.key" class="cli-penalty-cue" aria-hidden="true"
            >-{{ penalty.seconds }} s</span
          >
          <span class="visually-hidden" role="status">{{
            penalty ? `${penalty.seconds} seconds cut from the clock.` : ''
          }}</span>
        </div>
      </div>
    </div>
    <div class="col">
      <div class="cli-stat cli-stat-handled">
        <span :key="challenge" class="cli-stat-icon cli-pop"
          ><CliIcon name="handled" :size="28"
        /></span>
        <div class="cli-stat-body">
          <span class="cli-stat-label">Challenge</span>
          <span class="cli-stat-value">{{ challenge }} / {{ total }}</span>
          <span class="cli-steps" aria-hidden="true">
            <span
              v-for="step in total"
              :key="step"
              :class="['cli-step', stepClass(step - 1)]"
            ></span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
