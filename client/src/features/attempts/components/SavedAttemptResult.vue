<script setup>
import { onMounted, ref } from 'vue'
defineProps({
  attempt: { type: Object, required: true },
  // a game with a long review list places its own actions above it
  hideActions: Boolean,
})
defineEmits(['replay'])
const heading = ref(null)
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>
<template>
  <section class="attempt-result" aria-label="Saved result">
    <h2 ref="heading" tabindex="-1">Case closed</h2>
    <p class="result-score">
      Score: <span>{{ attempt.score }} / {{ attempt.maxScore }}</span>
    </p>
    <p v-if="attempt.status === 'completed' && attempt.persisted" role="status">
      Result saved to your account.
    </p>
    <div class="attempt-result-content"><slot /></div>
    <div v-if="!hideActions">
      <button class="btn btn-primary" @click="$emit('replay')">Play again</button>
      <RouterLink to="/" class="btn btn-outline-primary">Back to town</RouterLink>
    </div>
  </section>
</template>
<style scoped>
.attempt-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.attempt-result-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  position: relative;
}
</style>
