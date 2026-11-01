<script setup>
import { computed } from 'vue'
import { describeStep, OUTCOME_LABELS, stepVerdict } from '../clearanceTower.js'

const props = defineProps({
  level: { type: Object, required: true },
  events: { type: Array, required: true },
})

// newest first, so the latest event is always visible without scrolling
const newestFirst = computed(() => [...props.events].reverse())
</script>

<template>
  <div class="clear-log">
    <h3>Duty log</h3>
    <p v-if="!events.length" class="clear-hint">
      The day has not started. Press Play, or Next event to go one step at a time.
    </p>
    <ol class="clear-log-list" aria-live="polite">
      <li
        v-for="event in newestFirst"
        :key="event.id"
        class="clear-log-entry"
        :class="`is-${event.outcome}`"
        data-testid="clear-log-entry"
      >
        <span class="clear-outcome">{{ OUTCOME_LABELS[event.outcome] }}</span>
        <span class="clear-story">{{ event.story }}</span>
        <ul class="clear-steps">
          <li v-for="(step, index) in event.steps" :key="index">
            {{ describeStep(level, step) }}: <strong>{{ stepVerdict(step) }}</strong
            >.
            {{ step.reason }}
          </li>
        </ul>
      </li>
    </ol>
  </div>
</template>
