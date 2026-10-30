<script setup>
defineProps({
  debrief: { type: Object, required: true },
  pending: Boolean,
})
defineEmits(['next', 'finish'])
</script>

<template>
  <section class="soc-debrief" aria-live="polite">
    <h2 class="soc-debrief-title" :class="debrief.correct ? 'is-good' : 'is-bad'">
      {{ debrief.correct ? '✓' : '✕' }} {{ debrief.debrief.headline }}
    </h2>
    <p class="soc-debrief-score" data-testid="soc-call-score">
      +{{ debrief.score
      }}<span v-if="debrief.streakBonus"> (+{{ debrief.streakBonus }} streak)</span>
    </p>
    <h3>Tells</h3>
    <ul class="soc-tells">
      <li v-for="tell in debrief.debrief.tells" :key="tell.text" :class="`is-${tell.kind}`">
        {{ tell.text }}
      </li>
    </ul>
    <p v-if="debrief.debrief.scriptedNote" class="soc-chip" data-testid="soc-scripted-note">
      {{ debrief.debrief.scriptedNote }}
    </p>
    <button
      v-if="debrief.finished"
      type="button"
      class="soc-button soc-button-primary"
      :disabled="pending"
      @click="$emit('finish')"
    >
      Result
    </button>
    <button
      v-else
      type="button"
      class="soc-button soc-button-primary"
      :disabled="pending"
      @click="$emit('next')"
    >
      Next call
    </button>
  </section>
</template>
