<script setup>
import { computed } from 'vue'

const props = defineProps({
  hints: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['request'])

const exhausted = computed(() => props.hints.used >= props.hints.max)
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
      :disabled="exhausted || disabled"
      @click="emit('request')"
    >
      {{ label }}
      <span v-if="!exhausted" class="clear-hint-cost">−{{ hints.cost }} points</span>
    </button>
  </section>
</template>
