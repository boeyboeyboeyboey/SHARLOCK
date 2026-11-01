<script setup>
import { computed } from 'vue'
import { typeLabel } from './triageLabels.js'

const props = defineProps({
  review: { type: Array, default: () => [] },
  score: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 },
  mistakes: { type: Number, default: 0 },
  roundsPlayed: { type: Number, default: 0 },
  timed: { type: Boolean, default: false },
  endReason: { type: String, default: null },
})
defineEmits(['replay'])
const END_LINES = {
  mistakes: 'Ended on the third mistake',
  time: "Time's up",
  rounds: 'All 12 emails checked',
  cap: 'Round limit reached',
}
const correctCalls = computed(() => props.review.filter((item) => item.correct).length)
const endLine = computed(() => END_LINES[props.endReason] ?? '')
const reachedPar = computed(() => props.maxScore > 0 && props.score >= props.maxScore)
const modeNote = computed(() => (props.timed ? 'Timed class run' : 'Practice'))

function callLabel(item) {
  return item.call === 'report' ? 'Reported' : 'Trusted'
}
</script>

<template>
  <section class="triage-debrief">
    <p v-if="endLine" class="triage-end">{{ endLine }}</p>
    <p class="triage-mode">{{ modeNote }}</p>
    <dl class="triage-totals">
      <div>
        <dt>Score</dt>
        <dd>
          {{ score }}<span v-if="maxScore" class="triage-of-max"> of {{ maxScore }}</span>
        </dd>
      </div>
      <div>
        <dt>Correct calls</dt>
        <dd>{{ correctCalls }} of {{ review.length }}</dd>
      </div>
      <div>
        <dt>Mistakes</dt>
        <dd>{{ mistakes }}</dd>
      </div>
    </dl>
    <p v-if="reachedPar" class="triage-par">Par reached: the most one run can save.</p>
    <div class="triage-debrief-actions">
      <button type="button" class="triage-next" @click="$emit('replay')">Play again</button>
      <RouterLink to="/" class="triage-next triage-town-link">Back to town</RouterLink>
    </div>
    <ol class="triage-review">
      <li
        v-for="(item, index) in review"
        :key="index"
        :class="item.correct ? 'is-correct' : 'is-mistake'"
        :style="{ '--i': index }"
      >
        <p class="triage-review-subject">{{ item.subject }}</p>
        <p class="triage-address">{{ item.senderAddress }}</p>
        <p>
          {{ callLabel(item) }}
          <span aria-hidden="true">{{ item.correct ? '✓' : '✗' }}</span>
          {{ item.correct ? 'Correct' : 'Mistake' }}
        </p>
        <p class="triage-type">{{ typeLabel(item.type) }}</p>
        <p>{{ item.explanation }}</p>
        <p class="triage-points">{{ item.points }} points</p>
        <p v-if="item.hintTier > 0" class="triage-hint-used">Hint used</p>
      </li>
    </ol>
  </section>
</template>
