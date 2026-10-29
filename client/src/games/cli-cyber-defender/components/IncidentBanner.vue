<script setup>
import { computed } from 'vue'
import CliIcon from './CliIcon.vue'

const props = defineProps({
  incident: { type: Object, default: null },
  remainingMs: { type: Number, default: null },
  mode: { type: String, default: 'timed' },
  interactive: { type: Boolean, default: true },
  canHint: { type: Boolean, default: false },
  hintDisabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select-target', 'hint'])

const lines = computed(
  () =>
    props.incident?.alert.segments ??
    props.incident?.alert.lines.map((line) => [{ text: line }]) ??
    [],
)

const fraction = computed(() => {
  const total = props.incident?.windowSeconds
  if (!total || props.remainingMs == null) return 1
  return Math.max(0, Math.min(1, props.remainingMs / (total * 1000)))
})
const urgent = computed(() => props.remainingMs != null && props.remainingMs <= 3000)
</script>

<template>
  <section class="cli-banner" aria-label="Current incident">
    <div v-if="incident?.alert" :key="incident.incidentId" class="cli-banner-body">
      <p class="cli-banner-meta">
        <span :class="['badge', 'cli-severity', `cli-severity-${incident.alert.severity}`]">
          <CliIcon name="alert" :size="14" />{{ incident.alert.severity }}
        </span>
        <span class="cli-radar" aria-hidden="true"></span>
        <span>{{ incident.alert.source }}</span>
      </p>
      <h2 class="cli-banner-title">{{ incident.alert.title }}</h2>
      <ul class="cli-banner-lines">
        <li
          v-for="(parts, index) in lines"
          :key="index"
          :class="{ 'cli-hint-line': incident.hintLine === index }"
        >
          <template v-for="(part, partIndex) in parts" :key="partIndex">
            <button
              v-if="part.target"
              type="button"
              :class="['cli-entity', `cli-entity-${part.kind}`]"
              :disabled="!interactive"
              :aria-label="`Use ${part.target} as the target`"
              @click="emit('select-target', part.target)"
              v-text="part.target"
            ></button>
            <span v-else v-text="part.text"></span>
          </template>
          <span v-if="incident.hintLine === index" class="cli-hint-tag">hint</span>
        </li>
      </ul>
      <p v-if="incident.lookups" class="cli-banner-status">
        Lookups used: {{ incident.lookups.used }} of {{ incident.lookups.limit }}
        <span v-if="incident.stepsDone > 0" class="cli-step-note"
          >| Step {{ incident.stepsDone }} done, the incident is still open</span
        >
      </p>
      <div v-if="interactive" class="cli-banner-foot">
        <p class="cli-banner-tip">
          Investigate with logs and whois, then act. Tap a name to use it.
        </p>
        <button
          v-if="canHint"
          type="button"
          class="btn cli-hint-button"
          :disabled="hintDisabled"
          @click="emit('hint')"
        >
          <CliIcon name="hint" :size="16" />Hint
        </button>
      </div>
      <div
        v-if="mode === 'timed'"
        :class="['progress', 'cli-countdown', { 'cli-countdown-urgent': urgent }]"
        aria-hidden="true"
      >
        <div class="progress-bar" :style="{ width: `${fraction * 100}%` }"></div>
      </div>
      <p v-if="mode === 'timed'" class="visually-hidden">
        You have {{ incident.windowSeconds }} seconds for this incident.
      </p>
    </div>
    <p v-else class="cli-banner-idle">No open incident.</p>
  </section>
</template>
