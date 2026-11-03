<script setup>
defineProps({
  hint: { type: String, default: null },
  assisted: Boolean,
  disabled: Boolean,
})
const emit = defineEmits(['hint'])
</script>

<template>
  <div class="sql-hint-box">
    <template v-if="!assisted">
      <button
        type="button"
        class="btn btn-outline-primary sql-hint"
        aria-describedby="sql-hint-cost"
        :disabled="disabled"
        @click="emit('hint')"
      >
        Show a hint
      </button>
      <span id="sql-hint-cost" class="small">Costs the first-try bonus for this case.</span>
    </template>
    <p v-else class="sql-hint-text" tabindex="-1">
      <span class="sql-tag">Assisted</span> <strong>Hint:</strong> {{ hint }}
      <span class="small">Assisted cases lose the first-try bonus.</span>
    </p>
  </div>
</template>
