<script setup>
import { DECISIONS } from '../simulator.js'

defineProps({ disabled: Boolean })
defineEmits(['decide'])
</script>

<template>
  <section class="soc-decisions" aria-label="Decision">
    <div class="soc-decisions-row">
      <button
        v-for="decision in DECISIONS"
        :key="decision.id"
        type="button"
        class="soc-button"
        :class="decision.id === 'grant' ? 'soc-button-danger' : 'soc-button-choice'"
        :disabled="disabled"
        @click="$emit('decide', decision.id)"
      >
        <span aria-hidden="true">{{ decision.icon }}</span> {{ decision.label }}
      </button>
    </div>
  </section>
</template>
