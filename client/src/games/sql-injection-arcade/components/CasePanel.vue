<script setup>
import { computed } from 'vue'

const props = defineProps({ current: { type: Object, required: true } })

// split the template so placeholders can be marked without v-html
const segments = computed(() =>
  (props.current.query ?? '')
    .split(/(‹[^›]*›)/)
    .filter(Boolean)
    .map((text) => ({ text, placeholder: text.startsWith('‹') })),
)
const heading = computed(() =>
  props.current.number
    ? `Case ${props.current.number}: ${props.current.title}`
    : props.current.title,
)
const schema = computed(() =>
  (props.current.schemaHint ?? []).map((item) => `${item.table}(${item.columns.join(', ')})`),
)
</script>

<template>
  <section
    class="sql-explanation"
    aria-label="Case file"
    data-testid="sql-case"
    :data-case-id="current.caseId"
  >
    <div class="sql-monitor-bar">
      <h2><span class="sql-console-name">01 / </span>{{ heading }}</h2>
      <span class="sql-monitor-indicator"><span aria-hidden="true">■</span> SIMULATION</span>
    </div>
    <div class="sql-query-content">
      <pre v-if="current.query" aria-label="Vulnerable query template"><code><template
        v-for="(part, index) in segments"
        :key="index"
      ><mark v-if="part.placeholder">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></code></pre>
      <p>{{ current.scenario }}</p>
      <p><strong>Goal:</strong> {{ current.goal }}</p>
      <p v-if="current.forTitle"><strong>Fixing:</strong> {{ current.forTitle }}</p>
      <p v-if="current.resultColumns">
        <strong>The page shows:</strong> {{ current.resultColumns.join(', ') }}
      </p>
      <p v-if="schema.length"><strong>Leaked schema:</strong> {{ schema.join(' · ') }}</p>
      <p v-if="current.knownCrate"><strong>A crate you know:</strong> {{ current.knownCrate }}</p>
      <p v-if="current.question && current.canAnswer">
        <strong>Question:</strong> {{ current.question }}
      </p>
    </div>
  </section>
</template>
