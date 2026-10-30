<script setup>
defineProps({
  patched: { type: Boolean, default: false },
  lockMs: { type: Number, default: 0 },
})
</script>

<template>
  <p
    v-if="lockMs > 0"
    class="tag-toast tag-glass pz-result is-bad"
    role="status"
    data-testid="puzzle-locked"
  >
    <span aria-hidden="true">&#128274;</span> {{ Math.ceil(lockMs / 1000) }}s
  </p>
  <p
    v-else-if="patched"
    class="tag-toast tag-glass pz-result is-good"
    role="status"
    data-testid="puzzle-patched"
  >
    <span aria-hidden="true">&#128737;</span> Patched
  </p>
</template>
