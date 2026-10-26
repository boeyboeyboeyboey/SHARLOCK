<script setup>
import { computed } from 'vue'
import MeterBoard from './MeterBoard.vue'
import { starText, VERDICTS } from '../clearanceTower.js'

const props = defineProps({
  level: { type: Object, required: true },
  result: { type: Object, required: true },
  hasNext: { type: Boolean, default: false },
})
const emit = defineEmits(['next', 'levels'])

const meters = computed(() => props.result.meters)

function verdictLabel(value) {
  return VERDICTS.find((verdict) => verdict.value === value)?.label ?? value
}
</script>

<template>
  <section class="clear-card clear-debrief" aria-labelledby="clear-debrief-title">
    <p class="clear-eyebrow">Case file</p>
    <h2 id="clear-debrief-title" tabindex="-1" data-phase-heading>{{ level.title }}</h2>
    <p class="clear-score">
      <span class="clear-number">{{ result.score }}</span> / 100
      <span class="clear-stars" :aria-label="`${result.stars} out of 3 stars`">
        {{ starText(result.stars) }}
      </span>
    </p>
    <p class="clear-hint">Recorded in this climb. Finish the climb to save the total.</p>

    <MeterBoard :breakdown="result.breakdown" />

    <ul class="clear-facts">
      <li>Leaks: {{ meters.leaks }}</li>
      <li>Work completed: {{ meters.workDone }} of {{ meters.workTotal }}</li>
      <li v-if="level.model !== 'blp'">Rights nobody needed: {{ meters.excessRights }}</li>
      <li v-for="conflict in meters.dutyConflicts" :key="`${conflict.agent}-${conflict.reason}`">
        Separation of duties broken: {{ conflict.reason }}
      </li>
      <li v-if="meters.tampering">
        Tampering allowed by the model: {{ meters.tampering }}. Bell–LaPadula guards secrecy, not
        integrity, so this costs no points; it is the lesson.
      </li>
      <li v-if="result.edits">
        You made {{ result.edits.badgeEdits }} badge edits. Underneath,
        {{ result.edits.matrixEdits }} matrix cells changed.
      </li>
    </ul>

    <h3>Your calls</h3>
    <ol class="clear-review">
      <li
        v-for="item in result.predictionReview"
        :key="item.id"
        :class="item.correct ? 'is-correct' : 'is-wrong'"
      >
        <strong>{{ item.correct ? 'Correct' : 'Missed' }}:</strong> {{ item.request }} You said
        {{ verdictLabel(item.verdict) }}; it is {{ verdictLabel(item.answer) }}.
        <span class="clear-explanation">{{ item.explanation }}</span>
      </li>
    </ol>

    <h3>Takeaways</h3>
    <ul>
      <li v-for="takeaway in result.takeaways" :key="takeaway">{{ takeaway }}</li>
    </ul>
    <p class="clear-source">Source: {{ level.slides }}</p>

    <div class="clear-actions">
      <button type="button" class="clear-button" @click="emit('levels')">All cases</button>
      <button v-if="hasNext" type="button" class="clear-button is-primary" @click="emit('next')">
        Next case
      </button>
    </div>
  </section>
</template>
