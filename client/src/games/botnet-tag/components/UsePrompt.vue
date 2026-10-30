<script setup>
defineProps({ lockMs: { type: Number, default: 0 } })
const emit = defineEmits(['use'])
</script>

<template>
  <p v-if="lockMs > 0" class="tag-use tag-glass is-locked" role="status" data-testid="tag-locked">
    Locked {{ Math.ceil(lockMs / 1000) }}s
  </p>
  <button v-else type="button" class="tag-use tag-glass" data-testid="tag-use" @click="emit('use')">
    <kbd aria-hidden="true">E</kbd> Use
  </button>
</template>
