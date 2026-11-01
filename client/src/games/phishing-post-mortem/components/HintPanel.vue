<script setup>
import { computed } from 'vue'

const props = defineProps({
  tier: { type: Number, default: 0 },
  maxTier: { type: Number, default: 2 },
  lines: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['hint'])

const exhausted = computed(() => props.tier >= props.maxTier)
const unavailable = computed(() => props.disabled || exhausted.value)
const label = computed(() => {
  if (exhausted.value) return 'No more hints'
  return props.tier === 0 ? 'Hint' : 'Another hint'
})

// the button stays focusable while unavailable, so a keyboard user keeps their place
function askForHint() {
  if (!unavailable.value) emit('hint')
}
</script>

<template>
  <section class="triage-hint" aria-label="Hints">
    <button
      type="button"
      class="triage-hint-button"
      :aria-disabled="unavailable"
      @click="askForHint"
    >
      {{ label }}
    </button>
    <div aria-live="polite">
      <ul v-if="lines.length" class="triage-hint-lines">
        <li v-for="line in lines" :key="line">{{ line }}</li>
      </ul>
    </div>
  </section>
</template>
