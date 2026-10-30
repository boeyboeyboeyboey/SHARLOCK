<script setup>
import { HINT_PENALTY, TOOLS } from '../simulator.js'

defineProps({
  tools: { type: Object, default: () => ({}) },
  hints: { type: Array, default: () => [] },
  hintsLeft: { type: Number, default: 0 },
  disabled: Boolean,
})
defineEmits(['tool', 'hint'])
</script>

<template>
  <section class="soc-tools" aria-label="Desk tools">
    <div class="soc-tools-row">
      <button
        v-for="tool in TOOLS"
        :key="tool.id"
        type="button"
        class="soc-button soc-button-choice"
        :disabled="disabled"
        @click="$emit('tool', tool.id)"
      >
        <span aria-hidden="true">{{ tool.icon }}</span> {{ tool.label }}
      </button>
      <button
        type="button"
        class="soc-button"
        :disabled="disabled || hintsLeft < 1"
        @click="$emit('hint')"
      >
        <span aria-hidden="true">?</span> Ask Sharlock (&minus;{{ HINT_PENALTY }})
      </button>
    </div>
    <ul class="soc-facts">
      <li v-for="tool in TOOLS.filter((item) => tools[item.id])" :key="tool.id">
        <strong>{{ tool.label }}</strong> {{ tools[tool.id].summary }}
      </li>
      <li v-for="(text, index) in hints" :key="`hint-${index}`" class="soc-hint">
        <strong>Sharlock</strong> {{ text }}
      </li>
    </ul>
  </section>
</template>
