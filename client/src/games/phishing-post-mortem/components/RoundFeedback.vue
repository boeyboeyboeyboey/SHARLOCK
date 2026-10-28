<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import TriageEmailCard from './TriageEmailCard.vue'
import { typeLabel } from './triageLabels.js'

const props = defineProps({
  last: { type: Object, required: true },
  email: { type: Object, default: null },
  timed: { type: Boolean, default: false },
  runOver: { type: Boolean, default: false },
})
const emit = defineEmits(['next'])

const nextButton = ref(null)

const timedLine = computed(() => {
  if (!props.last.correct) return `Mistake: ${typeLabel(props.last.type)}`
  if (props.last.verdict === 'phish' && !props.last.tellHit) {
    return `Correct, but not the main tell +${props.last.points}`
  }
  return `Correct +${props.last.points}`
})
const heading = computed(() => (props.last.verdict === 'phish' ? 'Phish' : 'Genuine'))
const outcome = computed(() => (props.last.correct ? 'Your call was right' : 'Your call was wrong'))
const stampText = computed(() => {
  const call =
    props.last.call ??
    ((props.last.verdict === 'phish') === props.last.correct ? 'report' : 'trust')
  return call === 'report' ? 'Reported' : 'Trusted'
})
const showEmail = computed(() => props.email?.roundId === props.last.roundId)

onMounted(async () => {
  if (props.timed) return
  await nextTick()
  nextButton.value?.focus()
})
</script>

<template>
  <p
    v-if="timed"
    class="triage-strip"
    :class="last.correct ? 'is-correct' : 'is-mistake'"
    aria-live="polite"
  >
    {{ timedLine }}
  </p>
  <section v-else class="triage-feedback" :class="last.correct ? 'is-correct' : 'is-mistake'">
    <span
      class="triage-stamp triage-stamp-land"
      :class="stampText === 'Reported' ? 'is-report' : 'is-trust'"
      aria-hidden="true"
    >
      {{ stampText }}
    </span>
    <h3>{{ heading }}</h3>
    <p class="triage-outcome">
      <span aria-hidden="true">{{ last.correct ? '✓' : '✗' }}</span> {{ outcome }}
    </p>
    <p class="triage-type">{{ typeLabel(last.type) }}</p>
    <p>{{ last.explanation }}</p>
    <p class="triage-points">+{{ last.points }} points</p>
    <TriageEmailCard
      v-if="showEmail"
      :email="email"
      :highlight-ids="last.tellPartIds"
      :picking="false"
    />
    <button ref="nextButton" type="button" class="triage-next" @click="emit('next')">
      {{ runOver ? 'See results' : 'Next email' }}
    </button>
  </section>
</template>
