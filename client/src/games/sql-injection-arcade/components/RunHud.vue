<script setup>
import { computed } from 'vue'

const props = defineProps({
  timed: Boolean,
  number: { type: Number, default: null },
  totalCases: { type: Number, default: null },
  repair: Boolean,
  score: { type: Number, default: 0 },
  lives: { type: Number, default: null },
  maxLives: { type: Number, default: null },
  secondsLeft: { type: Number, default: null },
  triesLeft: { type: Number, default: null },
  triesMax: { type: Number, default: null },
})

const caseLabel = computed(() => {
  if (props.repair) return 'Repair'
  if (props.totalCases) return `Case ${props.number} of ${props.totalCases}`
  return `Case ${props.number}`
})
const clock = computed(() => {
  const total = props.secondsLeft ?? 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})
const hearts = computed(() =>
  '♥'.repeat(props.lives ?? 0).concat('♡'.repeat((props.maxLives ?? 0) - (props.lives ?? 0))),
)
</script>

<template>
  <ul class="sql-hud" aria-label="Run status">
    <li>
      <span aria-hidden="true">▣</span> <span data-testid="sql-hud-case">{{ caseLabel }}</span>
    </li>
    <li>
      <span aria-hidden="true">★</span> Score <strong>{{ score }}</strong>
    </li>
    <li v-if="timed && lives !== null">
      <span aria-hidden="true">{{ hearts }}</span> Lives {{ lives }} of {{ maxLives }}
    </li>
    <li v-if="timed && secondsLeft !== null">
      <span aria-hidden="true">⏱</span> Time left
      <strong role="timer" data-testid="sql-hud-clock">{{ clock }}</strong>
    </li>
    <li v-if="triesMax !== null">
      <span aria-hidden="true">⌖</span> Tries left {{ triesLeft }} of {{ triesMax }}
    </li>
  </ul>
</template>
