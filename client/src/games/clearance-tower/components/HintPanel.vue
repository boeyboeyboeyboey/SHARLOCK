<script setup>
import { computed } from 'vue'

const props = defineProps({
  hints: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['request'])

// aria-disabled keeps keyboard focus on the button while a request runs or once hints run out
function request() {
  if (!unavailable.value) emit('request')
}

const exhausted = computed(() => props.hints.used >= props.hints.max)
const unavailable = computed(() => exhausted.value || props.disabled)
const label = computed(() => {
  if (exhausted.value) return 'No more hints'
  return props.hints.used === 0 ? 'Hint' : 'Another hint'
})
</script>

<template>
  <section class="clear-hints" aria-labelledby="clear-hints-title">
    <h3 id="clear-hints-title">Hints</h3>
    <ol v-if="hints.texts.length" class="clear-hint-list" aria-live="polite">
      <li v-for="(text, index) in hints.texts" :key="index">
        <strong>{{ index === 0 ? 'Where to look' : 'The idea' }}:</strong> {{ text }}
      </li>
    </ol>
    <button
      type="button"
      class="clear-button clear-hint-button"
      :aria-disabled="unavailable"
      @click="request"
    >
      {{ label }}
      <span v-if="!exhausted" class="clear-hint-cost">−{{ hints.cost }} points</span>
    </button>
  </section>
</template>
