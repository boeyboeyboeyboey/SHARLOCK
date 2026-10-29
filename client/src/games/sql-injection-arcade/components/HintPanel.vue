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
    <button
      v-if="!assisted"
      type="button"
      class="btn btn-outline-primary sql-hint"
      :disabled="disabled"
      @click="emit('hint')"
    >
      Show a hint
    </button>
    <p v-else class="sql-hint-text" tabindex="-1">
      <span class="sql-tag">Assisted</span> <strong>Hint:</strong> {{ hint }}
      <span class="small">Assisted cases lose the first-try bonus.</span>
    </p>
  </div>
</template>
