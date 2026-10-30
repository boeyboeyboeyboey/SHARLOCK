<script setup>
defineProps({
  callIndex: { type: Number, required: true },
  callsTotal: { type: Number, required: true },
  strikes: { type: Number, required: true },
  maxStrikes: { type: Number, required: true },
  trust: { type: Number, required: true },
  streak: { type: Number, default: 0 },
})
</script>

<template>
  <header class="soc-status">
    <p class="soc-status-call" data-testid="soc-call-number">
      Call {{ callIndex + 1 }}/{{ callsTotal }}
    </p>
    <p class="soc-status-strikes" :aria-label="`Strikes ${strikes} of ${maxStrikes}`">
      <span
        v-for="n in maxStrikes"
        :key="n"
        class="soc-strike"
        :class="{ 'is-hit': n <= strikes }"
        aria-hidden="true"
        >{{ n <= strikes ? '✕' : '○' }}</span
      >
    </p>
    <label class="soc-status-trust">
      Trust
      <meter min="0" max="100" low="40" high="70" optimum="100" :value="trust"></meter>
    </label>
    <p class="soc-status-streak" data-testid="soc-streak">Streak {{ streak }}</p>
  </header>
</template>
