<script setup>
import { computed } from 'vue'
import { IMMUNITY_MS, formatClock, isUrgent } from '../tagRules.js'

const props = defineProps({
  msLeft: { type: Number, default: 0 },
  infected: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  immunityMs: { type: Number, default: 0 },
  selfInfected: { type: Boolean, default: false },
  toast: { type: String, default: '' },
})

const urgent = computed(() => isUrgent(props.msLeft))
const immune = computed(() => props.immunityMs > 0)
const immunePct = computed(() => Math.min(100, (props.immunityMs / IMMUNITY_MS) * 100))
const status = computed(() => (props.selfInfected ? 'Infected' : immune.value ? 'Immune' : 'Clean'))
</script>

<template>
  <div class="tag-hud" data-testid="tag-hud">
    <div class="tag-hud-top">
      <div
        class="tag-timer tag-glass"
        :class="{ 'is-urgent': urgent }"
        role="timer"
        aria-label="Round time left"
        data-testid="tag-timer"
      >
        <span aria-hidden="true">⏱</span>
        <span>{{ formatClock(msLeft) }}</span>
        <span v-if="urgent" role="img" aria-label="Final 30 seconds" data-testid="tag-urgent"
          >⚠</span
        >
      </div>
      <div class="tag-count tag-glass" aria-live="polite" data-testid="tag-botnet-count">
        <b :aria-label="`${infected} of ${total} infected`">{{ infected }}/{{ total }}</b>
        <span class="tag-pips" aria-hidden="true"
          ><i v-for="n in total" :key="n" :class="{ 'is-on': n <= infected }"
        /></span>
      </div>
    </div>
    <div class="tag-status tag-glass" data-testid="tag-status">{{ status }}</div>
    <div v-if="immune" class="tag-immunity tag-glass" role="status" data-testid="tag-immunity">
      <b>
        <span>Immune</span><span>{{ Math.ceil(immunityMs / 1000) }}s</span>
      </b>
      <div class="tag-bar"><i :style="{ width: `${immunePct}%` }" /></div>
    </div>
    <p v-if="toast" class="tag-toast tag-glass" role="status" data-testid="tag-toast">
      {{ toast }}
    </p>
  </div>
</template>
