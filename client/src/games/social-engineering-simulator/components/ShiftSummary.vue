<script setup>
defineProps({
  result: { type: Object, required: true },
  retrying: Boolean,
  retryError: { type: String, default: '' },
})
defineEmits(['restart', 'retry-save'])
</script>

<template>
  <section class="soc-summary">
    <h2 data-testid="soc-total">{{ result.score }} / {{ result.maxScore }}</h2>
    <p v-if="result.endedEarly" class="soc-alert soc-alert-bad" role="status">
      Out of trust. Shift ended early.
    </p>
    <ol class="soc-summary-calls">
      <li v-for="(item, index) in result.calls" :key="index">
        <span>Call {{ index + 1 }}</span>
        <span>{{ item.genuine ? 'Genuine' : 'Attacker' }}</span>
        <span>{{ item.decision === 'none' ? 'Leaked' : item.decision }}</span>
        <strong>{{ item.score }}</strong>
      </li>
    </ol>
    <p v-if="result.streakBonus">Streak +{{ result.streakBonus }}</p>
    <p v-if="result.mode === 'scripted'" class="soc-chip">Scripted</p>
    <p v-if="result.saved" class="soc-alert" role="status">Result saved to your account.</p>
    <div v-else class="soc-alert soc-alert-bad" role="alert">
      <p>Not saved.</p>
      <p v-if="retryError">{{ retryError }}</p>
      <button type="button" class="soc-button" :disabled="retrying" @click="$emit('retry-save')">
        Try again
      </button>
    </div>
    <button type="button" class="soc-button soc-button-primary" @click="$emit('restart')">
      New shift
    </button>
  </section>
</template>
