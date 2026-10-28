<script setup>
import CliIcon from './CliIcon.vue'
import ConceptTags from './ConceptTags.vue'

defineProps({ review: { type: Object, default: null } })
</script>

<template>
  <section
    v-if="review"
    :key="`${review.expectedCommand}-${review.outcome}`"
    :class="['cli-review', `cli-review-${review.outcome}`]"
    aria-label="Last incident"
  >
    <p class="cli-review-head">
      <span :class="['cli-outcome', `cli-outcome-${review.outcome}`]">
        <CliIcon :name="review.outcome === 'correct' ? 'check' : 'cross'" :size="14" />{{
          review.outcome === 'correct' ? 'OK' : 'WRONG'
        }}
      </span>
      Last incident
    </p>
    <p v-if="review.outcome !== 'correct'">
      Correct response: <code>{{ review.expectedCommand }}</code>
    </p>
    <p v-if="review.decoy" class="cli-decoy-label">
      <span class="cli-hint-tag">false alarm</span> Nothing needed containing.
    </p>
    <p class="cli-note">{{ review.explanation }}</p>
    <ConceptTags :concepts="review.concepts" />
  </section>
</template>
