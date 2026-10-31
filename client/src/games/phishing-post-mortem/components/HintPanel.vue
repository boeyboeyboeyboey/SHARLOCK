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
const label = computed(() => {
  if (exhausted.value) return 'No more hints'
  return props.tier === 0 ? 'Hint' : 'Another hint'
})
</script>

<template>
  <section class="triage-hint" aria-label="Hints">
    <button
      type="button"
      class="triage-hint-button"
      :disabled="disabled || exhausted"
      @click="emit('hint')"
    >
      {{ label }}
    </button>
    <ul v-if="lines.length" class="triage-hint-lines" aria-live="polite">
      <li v-for="line in lines" :key="line">{{ line }}</li>
    </ul>
  </section>
</template>
